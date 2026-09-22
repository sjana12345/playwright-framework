import * as fs from 'fs';
import * as readline from 'readline';

export class CsvStreamReader {
  /**
   * Streams a CSV file line-by-line as an async generator.
   * Memory usage stays minimal (~few MBs) even for 100k+ rows.
   */
  public static async *read(filePath: string): AsyncIterableIterator<Record<string, string>> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let headers: string[] | null = null;

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const tokens = this.parseCsvLine(trimmed);

      if (!headers) {
        headers = tokens.map((h) => h.trim());
      } else {
        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          row[headers[i]] = tokens[i] !== undefined ? tokens[i].trim() : '';
        }
        yield row;
      }
    }
  }

  /**
   * Fast line counter to accurately report total progress.
   */
  public static async countRows(filePath: string): Promise<number> {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let count = 0;
    for await (const line of rl) {
      if (line.trim()) count++;
    }
    // Subtract 1 for header line
    return Math.max(0, count - 1);
  }

  /**
   * Parses a single CSV line taking quoted values and commas into account.
   */
  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}

