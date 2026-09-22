import * as fs from 'fs';
import * as path from 'path';

/**
 * Script to generate a CSV dataset for API testing.
 * Usage:
 *   npx tsx scripts/generate-sample-csv.ts --count=1000 --out=data/bulk-api-sample.csv
 */
function generateCsv(): void {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith('--count='));
  const outArg = args.find((a) => a.startsWith('--out='));

  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 100;
  const outPath = outArg
    ? path.resolve(process.cwd(), outArg.split('=')[1])
    : path.resolve(process.cwd(), 'data', 'bulk-api-sample.csv');

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = fs.createWriteStream(outPath, { encoding: 'utf8' });
  stream.write('pathparam,level,date\n');

  console.log(`Generating ${count.toLocaleString()} rows into ${outPath}...`);

  const levels = ['summary', 'details', 'verbose'];
  const baseDate = new Date('2026-01-01');

  for (let i = 1; i <= count; i++) {
    const level = levels[i % levels.length];
    const dateStr = new Date(baseDate.getTime() + i * 86400000).toISOString().split('T')[0];
    stream.write(`${i},${level},${dateStr}\n`);
  }

  stream.end(() => {
    console.log(` Successfully generated ${count.toLocaleString()} rows in ${outPath}!`);
  });
}

generateCsv();

