import { ApiClient } from './apiClient';
import { ApiComparator, ComparisonOptions } from './apiComparator';
import { BulkReporter, BulkExecutionStats } from './bulkReporter';
import { CsvStreamReader } from './csvStreamReader';

export interface BulkComparisonConfig {
  csvFilePath: string;
  qaUrlTemplate: string;
  prodUrlTemplate: string;
  concurrency?: number; // default: 20
  ignoreFields?: string[];
  reportTitle?: string;
  maxRows?: number; // optional limit if user only wants to run a subset of 100k
  logProgressInterval?: number; // log every N items, default: 500
  delayMs?: number; // optional throttling delay between batches in ms (for corporate rate limiters)
}

export interface BulkComparisonResult {
  htmlReportPath: string;
  csvLogPath: string;
  stats: BulkExecutionStats;
}

export class BulkComparator {
  private apiClient: ApiClient;

  constructor() {
    this.apiClient = new ApiClient();
  }

  /**
   * Executes bulk comparisons streaming rows from CSV with bounded concurrency.
   */
  public async execute(config: BulkComparisonConfig): Promise<BulkComparisonResult> {
    const concurrency = Math.max(1, config.concurrency || 20);
    const progressInterval = config.logProgressInterval || 500;
    const reporter = new BulkReporter(config.reportTitle || 'bulk-api-comparison');

    console.log(`\n======================================================`);
    console.log(` STARTING BULK API COMPARISON (1 LAKH SCALE)`);
    console.log(`======================================================`);
    console.log(` CSV Input:    ${config.csvFilePath}`);
    console.log(` QA Template:  ${config.qaUrlTemplate}`);
    console.log(` Prod Template:${config.prodUrlTemplate}`);
    console.log(` Concurrency:  ${concurrency} parallel workers`);
    if (config.ignoreFields?.length) {
      console.log(` Ignore Fields:${config.ignoreFields.join(', ')}`);
    }

    // Optional quick total row count
    try {
      const totalCount = await CsvStreamReader.countRows(config.csvFilePath);
      const effectiveTotal = config.maxRows ? Math.min(totalCount, config.maxRows) : totalCount;
      reporter.setTotalRows(effectiveTotal);
      console.log(` Total Rows:   ${effectiveTotal.toLocaleString()}`);
    } catch {
      // Continue even if row counting is skipped
    }

    console.log('------------------------------------------------------');
    console.log(' Streaming rows and dispatching workers...\n');

    const startTime = Date.now();
    let rowIndex = 0;
    let activeWorkers = 0;
    let completed = 0;

    const rowIterator = CsvStreamReader.read(config.csvFilePath);

    // Worker pool queue mechanism
    await new Promise<void>((resolve, reject) => {
      let isDoneIterating = false;

      const pump = async () => {
        while (activeWorkers < concurrency && !isDoneIterating) {
          if (config.maxRows && rowIndex >= config.maxRows) {
            isDoneIterating = true;
            break;
          }

          const { value: row, done } = await rowIterator.next();
          if (done) {
            isDoneIterating = true;
            break;
          }

          rowIndex++;
          const currentRowIndex = rowIndex;
          activeWorkers++;

          this.processRow(row, currentRowIndex, config, reporter)
            .catch((err) => {
              console.error(`Error processing row ${currentRowIndex}:`, err);
            })
            .finally(() => {
              activeWorkers--;
              completed++;

              // Periodic progress report
              if (completed % progressInterval === 0 || completed === rowIndex && isDoneIterating) {
                const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
                const rate = (completed / elapsedSec).toFixed(1);
                process.stdout.write(
                  `\r[Progress]: ${completed.toLocaleString()} rows processed | Speed: ${rate} req/s...`
                );
              }

              if (isDoneIterating && activeWorkers === 0) {
                resolve();
              } else {
                pump();
              }
            });
        }

        if (isDoneIterating && activeWorkers === 0) {
          resolve();
        }
      };

      pump().catch(reject);
    });

    const totalDurationMs = Date.now() - startTime;
    console.log(`\n\n Completed processing ${completed.toLocaleString()} rows in ${(totalDurationMs / 1000).toFixed(1)}s!`);

    const finalOutput = await reporter.finalize(totalDurationMs);

    console.log('======================================================');
    console.log(` BULK COMPARISON SUMMARY:`);
    console.log(`   - Total Processed: ${finalOutput.stats.processed.toLocaleString()}`);
    console.log(`   - Perfect Matches: ${finalOutput.stats.matches.toLocaleString()}`);
    console.log(`   - Mismatches:      ${finalOutput.stats.mismatches.toLocaleString()}`);
    console.log(`   - Errors:          ${finalOutput.stats.errors.toLocaleString()}`);
    console.log('------------------------------------------------------');
    console.log(` [Results CSV Log]:       ${finalOutput.csvLogPath}`);
    console.log(` [Executive Dashboard]:   ${finalOutput.htmlReportPath}`);
    console.log('======================================================\n');

    return finalOutput;
  }

  private async processRow(
    row: Record<string, string>,
    rowIndex: number,
    config: BulkComparisonConfig,
    reporter: BulkReporter
  ): Promise<void> {
    const qaUrl = this.apiClient.buildUrl(config.qaUrlTemplate, row, row);
    const prodUrl = this.apiClient.buildUrl(config.prodUrlTemplate, row, row);

    if (config.delayMs && config.delayMs > 0) {
      await new Promise((r) => setTimeout(r, config.delayMs));
    }

    try {
      // Execute QA and Prod requests in parallel
      const [qaResp, prodResp] = await Promise.all([
        this.apiClient.get(qaUrl),
        this.apiClient.get(prodUrl),
      ]);

      const diffResult = ApiComparator.compare(qaResp.body, prodResp.body, {
        ignoreFields: config.ignoreFields,
      });

      reporter.recordResult(
        rowIndex,
        row,
        qaUrl,
        prodUrl,
        diffResult,
        qaResp.durationMs,
        prodResp.durationMs
      );
    } catch (err: any) {
      reporter.recordResult(rowIndex, row, qaUrl, prodUrl, undefined, 0, 0, err.message);
    }
  }
}

