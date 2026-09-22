import * as fs from 'fs';
import * as path from 'path';
import { ComparisonResult } from './apiComparator';

export interface BulkExecutionStats {
  totalRows: number;
  processed: number;
  matches: number;
  mismatches: number;
  errors: number;
  durationMs: number;
  avgQaDurationMs: number;
  avgProdDurationMs: number;
  fieldDiffFrequency: Record<string, number>;
  samples: Array<{
    rowIndex: number;
    params: Record<string, string>;
    qaUrl: string;
    prodUrl: string;
    result: ComparisonResult;
  }>;
}

export class BulkReporter {
  private logCsvPath: string;
  private logStream: fs.WriteStream;
  private reportsDir: string;
  private stats: BulkExecutionStats;
  private totalQaLatency = 0;
  private totalProdLatency = 0;

  constructor(baseTitle: string = 'bulk-comparison') {
    this.reportsDir = path.resolve(process.cwd(), 'reports', 'api-comparison');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logCsvPath = path.join(this.reportsDir, `${baseTitle}_results_${timestamp}.csv`);
    this.logStream = fs.createWriteStream(this.logCsvPath, { flags: 'a', encoding: 'utf8' });

    // Write CSV header
    this.logStream.write('rowIndex,status,diffCount,error,diffKeys,qaUrl,prodUrl\n');

    this.stats = {
      totalRows: 0,
      processed: 0,
      matches: 0,
      mismatches: 0,
      errors: 0,
      durationMs: 0,
      avgQaDurationMs: 0,
      avgProdDurationMs: 0,
      fieldDiffFrequency: {},
      samples: [],
    };
  }

  public setTotalRows(count: number): void {
    this.stats.totalRows = count;
  }

  /**
   * Streams a single comparison outcome to the results CSV and aggregates stats.
   */
  public recordResult(
    rowIndex: number,
    params: Record<string, string>,
    qaUrl: string,
    prodUrl: string,
    result?: ComparisonResult,
    qaLatency = 0,
    prodLatency = 0,
    errorMessage?: string
  ): void {
    this.stats.processed++;
    this.totalQaLatency += qaLatency;
    this.totalProdLatency += prodLatency;

    if (errorMessage) {
      this.stats.errors++;
      this.logStream.write(
        `${rowIndex},ERROR,0,"${this.escapeCsv(errorMessage)}",,"${this.escapeCsv(qaUrl)}","${this.escapeCsv(prodUrl)}"\n`
      );
      return;
    }

    if (!result) return;

    if (result.isMatch) {
      this.stats.matches++;
      this.logStream.write(`${rowIndex},MATCH,0,,,"${this.escapeCsv(qaUrl)}","${this.escapeCsv(prodUrl)}"\n`);
    } else {
      this.stats.mismatches++;
      const diffKeys = result.differences.map((d) => d.path);
      const diffKeysStr = diffKeys.slice(0, 10).join('; ');

      // Track field difference frequency
      for (const key of diffKeys) {
        this.stats.fieldDiffFrequency[key] = (this.stats.fieldDiffFrequency[key] || 0) + 1;
      }

      // Keep up to 30 samples for the HTML visual dashboard
      if (this.stats.samples.length < 30) {
        this.stats.samples.push({
          rowIndex,
          params,
          qaUrl,
          prodUrl,
          result,
        });
      }

      this.logStream.write(
        `${rowIndex},MISMATCH,${result.totalDifferences},,"${this.escapeCsv(diffKeysStr)}","${this.escapeCsv(qaUrl)}","${this.escapeCsv(prodUrl)}"\n`
      );
    }
  }

  /**
   * Finalizes the streams and generates the Executive HTML Dashboard.
   */
  public async finalize(totalDurationMs: number): Promise<{ htmlReportPath: string; csvLogPath: string; stats: BulkExecutionStats }> {
    this.stats.durationMs = totalDurationMs;
    this.stats.avgQaDurationMs = this.stats.processed > 0 ? Math.round(this.totalQaLatency / this.stats.processed) : 0;
    this.stats.avgProdDurationMs = this.stats.processed > 0 ? Math.round(this.totalProdLatency / this.stats.processed) : 0;

    await new Promise((resolve) => this.logStream.end(resolve));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const htmlReportPath = path.join(this.reportsDir, `bulk_dashboard_${timestamp}.html`);

    const html = this.buildExecutiveDashboardHtml();
    fs.writeFileSync(htmlReportPath, html, 'utf8');

    return {
      htmlReportPath,
      csvLogPath: this.logCsvPath,
      stats: this.stats,
    };
  }

  private buildExecutiveDashboardHtml(): string {
    const matchPct = this.stats.processed > 0 ? ((this.stats.matches / this.stats.processed) * 100).toFixed(1) : '0';
    const mismatchPct = this.stats.processed > 0 ? ((this.stats.mismatches / this.stats.processed) * 100).toFixed(1) : '0';

    // Top differing fields sorted
    const topFields = Object.entries(this.stats.fieldDiffFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const topFieldsHtml =
      topFields.length > 0
        ? topFields
            .map(
              ([f, count]) => `
          <tr>
            <td><code>${this.escapeHtml(f)}</code></td>
            <td><strong>${count}</strong></td>
            <td>${((count / Math.max(1, this.stats.mismatches)) * 100).toFixed(1)}%</td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="3">No differences found!</td></tr>';

    const samplesHtml = this.stats.samples
      .map(
        (s) => `
      <div class="sample-card">
        <div class="sample-header">
          <strong>Row #${s.rowIndex}</strong> — <span class="badge-danger">${s.result.totalDifferences} Differences</span>
          <br><small style="color:#94a3b8">Params: ${this.escapeHtml(JSON.stringify(s.params))}</small>
        </div>
        <div class="endpoint-line">QA: ${this.escapeHtml(s.qaUrl)}</div>
        <div class="endpoint-line">Prod: ${this.escapeHtml(s.prodUrl)}</div>
        <details>
          <summary>View Difference Breakdown</summary>
          <table class="sample-table">
            <thead>
              <tr><th>Path</th><th>Type</th><th>QA Value</th><th>Prod Value</th></tr>
            </thead>
            <tbody>
              ${s.result.differences
                .slice(0, 10)
                .map(
                  (d) => `
                <tr>
                  <td><code>${this.escapeHtml(d.path)}</code></td>
                  <td><span class="type-badge ${d.type.toLowerCase()}">${d.type}</span></td>
                  <td><pre>${this.escapeHtml(JSON.stringify(d.qaValue))}</pre></td>
                  <td><pre>${this.escapeHtml(JSON.stringify(d.prodValue))}</pre></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
          ${s.result.differences.length > 10 ? `<p style="padding: 8px; color: #94a3b8;">...and ${s.result.differences.length - 10} more differences.</p>` : ''}
        </details>
      </div>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bulk API Comparison Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --green: #10b981;
      --red: #ef4444;
      --blue: #3b82f6;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; margin: 0; }
    h1, h2, h3 { margin-top: 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }
    .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .kpi-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
    .kpi-val { font-size: 28px; font-weight: 700; margin-top: 8px; }
    .val-green { color: var(--green); }
    .val-red { color: var(--red); }
    .val-blue { color: var(--blue); }
    table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 24px; }
    th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { background: #111827; color: #94a3b8; text-transform: uppercase; font-size: 11px; }
    .badge-danger { background: rgba(239, 68, 68, 0.2); color: var(--red); padding: 3px 8px; border-radius: 4px; font-weight: 700; }
    .sample-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .sample-header { margin-bottom: 8px; font-size: 14px; }
    .endpoint-line { font-size: 12px; color: #94a3b8; font-family: monospace; word-break: break-all; margin-bottom: 4px; }
    summary { cursor: pointer; padding: 8px 0; color: var(--blue); font-weight: 600; font-size: 13px; }
    pre { margin: 0; font-family: monospace; font-size: 11px; }
    .type-badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
    .type-badge.modified { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .type-badge.added { background: rgba(16, 185, 129, 0.2); color: var(--green); }
    .type-badge.removed { background: rgba(239, 68, 68, 0.2); color: var(--red); }
  </style>
</head>
<body>
  <h1>Bulk API Comparison Dashboard (1 Lakh Scale)</h1>
  <p style="color: #94a3b8">Processed <strong>${this.stats.processed}</strong> records in <strong>${(this.stats.durationMs / 1000).toFixed(1)}s</strong> (${(this.stats.processed / Math.max(1, this.stats.durationMs / 1000)).toFixed(1)} req/s)</p>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Total Processed</div><div class="kpi-val">${this.stats.processed}</div></div>
    <div class="kpi-card"><div class="kpi-label">Match Rate</div><div class="kpi-val val-green">${matchPct}%</div><small style="color:#94a3b8">${this.stats.matches} passed</small></div>
    <div class="kpi-card"><div class="kpi-label">Mismatches</div><div class="kpi-val val-red">${mismatchPct}%</div><small style="color:#94a3b8">${this.stats.mismatches} differing</small></div>
    <div class="kpi-card"><div class="kpi-label">Errors</div><div class="kpi-val">${this.stats.errors}</div></div>
    <div class="kpi-card"><div class="kpi-label">Avg QA / Prod Latency</div><div class="kpi-val val-blue">${this.stats.avgQaDurationMs}ms / ${this.stats.avgProdDurationMs}ms</div></div>
  </div>

  <h2>Top Differing Fields Frequency</h2>
  <table>
    <thead><tr><th>Field Path</th><th>Occurrences</th><th>% of Mismatched Rows</th></tr></thead>
    <tbody>${topFieldsHtml}</tbody>
  </table>

  <h2>Sample Mismatches (First ${this.stats.samples.length})</h2>
  ${samplesHtml || '<p style="color:#94a3b8">No mismatches detected across any rows!</p>'}

  <footer style="margin-top: 40px; color: #64748b; font-size: 12px;">
    All 100,000 row records are streamed and saved to: <code>${this.logCsvPath}</code>
  </footer>
</body>
</html>`;
  }

  private escapeCsv(str: any): string {
    if (!str) return '';
    return String(str).replace(/"/g, '""');
  }

  private escapeHtml(str: any): string {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

