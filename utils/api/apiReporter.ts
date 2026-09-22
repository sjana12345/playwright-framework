import * as fs from 'fs';
import * as path from 'path';
import { ComparisonResult } from './apiComparator';
import { ApiResponseData } from './apiClient';

export interface ReportMetadata {
  title?: string;
  qaResponse?: ApiResponseData;
  prodResponse?: ApiResponseData;
}

export class ApiReporter {
  private static reportsDir = path.resolve(process.cwd(), 'reports', 'api-comparison');

  /**
   * Generates a modern HTML comparison report and writes it to disk.
   */
  public static generateHtmlReport(
    result: ComparisonResult,
    metadata: ReportMetadata = {}
  ): string {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (metadata.title || 'api-comparison').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filePath = path.join(this.reportsDir, `${safeTitle}_${timestamp}.html`);

    const statusBadgeClass = result.isMatch ? 'badge-success' : 'badge-danger';
    const statusText = result.isMatch ? 'PERFECT MATCH' : `${result.totalDifferences} DIFFERENCES DETECTED`;

    const diffRows = result.differences
      .map(
        (d, idx) => `
        <tr class="diff-row ${d.type.toLowerCase()}">
          <td>${idx + 1}</td>
          <td><code class="path-code">${this.escapeHtml(d.path)}</code></td>
          <td><span class="type-badge ${d.type.toLowerCase()}">${d.type}</span></td>
          <td class="val-qa"><pre>${this.escapeHtml(JSON.stringify(d.qaValue, null, 2))}</pre></td>
          <td class="val-prod"><pre>${this.escapeHtml(JSON.stringify(d.prodValue, null, 2))}</pre></td>
          <td>${this.escapeHtml(d.message)}</td>
        </tr>`
      )
      .join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(metadata.title || 'API Comparison Report')}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --added: #10b981;
      --removed: #ef4444;
      --modified: #f59e0b;
      --primary: #3b82f6;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .badge {
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .badge-success { background: #065f46; color: #6ee7b7; border: 1px solid #10b981; }
    .badge-danger { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef4444; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card-title { color: var(--text-muted); font-size: 12px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
    .card-value { font-size: 24px; font-weight: 700; }
    .added-val { color: var(--added); }
    .removed-val { color: var(--removed); }
    .modified-val { color: var(--modified); }

    .endpoint-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .endpoint-row {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;
      font-size: 14px;
      word-break: break-all;
    }
    .endpoint-label { font-weight: 700; min-width: 60px; color: var(--primary); }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 24px;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #111827;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
    }
    .path-code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-family: monospace; }
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }
    .type-badge.added { background: rgba(16, 185, 129, 0.2); color: var(--added); }
    .type-badge.removed { background: rgba(239, 68, 68, 0.2); color: var(--removed); }
    .type-badge.modified { background: rgba(245, 158, 11, 0.2); color: var(--modified); }

    pre { margin: 0; font-size: 12px; font-family: monospace; max-height: 120px; overflow-y: auto; }
    .val-qa pre { color: #fca5a5; }
    .val-prod pre { color: #6ee7b7; }

    .json-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .json-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .json-box h3 { margin-top: 0; font-size: 14px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .json-box pre { max-height: 400px; overflow: auto; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${this.escapeHtml(metadata.title || 'API Comparison Report')}</h1>
      <small style="color: var(--text-muted)">Generated at: ${new Date().toLocaleString()}</small>
    </div>
    <div>
      <span class="badge ${statusBadgeClass}">${statusText}</span>
    </div>
  </div>

  ${
    metadata.qaResponse && metadata.prodResponse
      ? `
  <div class="endpoint-card">
    <div class="endpoint-row">
      <span class="endpoint-label">QA:</span>
      <span><strong>[${metadata.qaResponse.status} ${metadata.qaResponse.statusText}]</strong> ${this.escapeHtml(metadata.qaResponse.url)} (${metadata.qaResponse.durationMs}ms)</span>
    </div>
    <div class="endpoint-row">
      <span class="endpoint-label">PROD:</span>
      <span><strong>[${metadata.prodResponse.status} ${metadata.prodResponse.statusText}]</strong> ${this.escapeHtml(metadata.prodResponse.url)} (${metadata.prodResponse.durationMs}ms)</span>
    </div>
  </div>`
      : ''
  }

  <div class="grid">
    <div class="card">
      <div class="card-title">Total Differences</div>
      <div class="card-value">${result.totalDifferences}</div>
    </div>
    <div class="card">
      <div class="card-title">Added in Prod</div>
      <div class="card-value added-val">+${result.addedCount}</div>
    </div>
    <div class="card">
      <div class="card-title">Removed in Prod</div>
      <div class="card-value removed-val">-${result.removedCount}</div>
    </div>
    <div class="card">
      <div class="card-title">Modified Values</div>
      <div class="card-value modified-val">${result.modifiedCount}</div>
    </div>
  </div>

  ${
    result.differences.length > 0
      ? `
  <h2>Detailed Differences</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 40px">#</th>
        <th>Field Path</th>
        <th style="width: 90px">Type</th>
        <th>QA Value</th>
        <th>Prod Value</th>
        <th>Explanation</th>
      </tr>
    </thead>
    <tbody>
      ${diffRows}
    </tbody>
  </table>`
      : `<div class="card" style="text-align: center; padding: 32px; color: var(--added);">
           <h3>All fields and values match identically between QA and Prod!</h3>
         </div>`
  }

  <h2>Raw JSON Payloads</h2>
  <div class="json-section">
    <div class="json-box">
      <h3>QA Response Body</h3>
      <pre>${this.escapeHtml(JSON.stringify(result.qaData, null, 2))}</pre>
    </div>
    <div class="json-box">
      <h3>Prod Response Body</h3>
      <pre>${this.escapeHtml(JSON.stringify(result.prodData, null, 2))}</pre>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(filePath, htmlContent, 'utf8');
    return filePath;
  }

  /**
   * Logs a summary of the comparison result to the terminal console.
   */
  public static printConsoleSummary(result: ComparisonResult, title?: string): void {
    console.log('\n======================================================');
    console.log(` API COMPARISON SUMMARY: ${title || 'QA vs PROD'}`);
    console.log('======================================================');
    if (result.isMatch) {
      console.log(' Result: PERFECT MATCH (0 differences)\n');
      return;
    }

    console.log(` Status: DIFFERENCES FOUND (${result.totalDifferences})`);
    console.log(`   + Added in Prod:    ${result.addedCount}`);
    console.log(`   - Removed in Prod:  ${result.removedCount}`);
    console.log(`   ~ Modified Values:  ${result.modifiedCount}`);
    console.log('------------------------------------------------------');
    console.log(' First 5 Differences:');
    result.differences.slice(0, 5).forEach((d, idx) => {
      console.log(`   ${idx + 1}. [${d.type}] at "${d.path}" -> ${d.message}`);
    });
    if (result.differences.length > 5) {
      console.log(`   ... and ${result.differences.length - 5} more differences.`);
    }
    console.log('======================================================\n');
  }

  private static escapeHtml(str: any): string {
    if (str === undefined || str === null) return String(str);
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

