import * as path from 'path';
import { BulkComparator } from '../utils/api/bulkComparator';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const getArg = (prefix: string, defaultValue: string) => {
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.substring(prefix.length) : defaultValue;
  };

  const csvFile = getArg('--csv=', 'data/bulk-api-sample.csv');
  const qaUrl = getArg('--qa=', 'https://dummyjson.com/products/:pathparam?level=:level&date=:date');
  const prodUrl = getArg('--prod=', 'https://dummyjson.com/products/:pathparam?level=:level&date=:date');
  const concurrency = parseInt(getArg('--concurrency=', '25'), 10);
  const maxRows = args.find((a) => a.startsWith('--maxRows='))
    ? parseInt(getArg('--maxRows=', '0'), 10)
    : undefined;
  const ignore = getArg('--ignore=', 'timestamp,serverTime,traceId,date')
    .split(',')
    .filter(Boolean);
  const delayMs = args.find((a) => a.startsWith('--delay='))
    ? parseInt(getArg('--delay=', '0'), 10)
    : undefined;

  const token = getArg('--token=', '');
  if (token) process.env.API_AUTH_TOKEN = token;
  const apiKey = getArg('--apikey=', '');
  if (apiKey) process.env.API_KEY = apiKey;

  const comparator = new BulkComparator();
  await comparator.execute({
    csvFilePath: path.resolve(process.cwd(), csvFile),
    qaUrlTemplate: qaUrl,
    prodUrlTemplate: prodUrl,
    concurrency,
    delayMs,
    maxRows,
    ignoreFields: ignore,
    reportTitle: 'bulk-api-qa-vs-prod',
  });
}

main().catch((err) => {
  console.error('Fatal error during bulk comparison:', err);
  process.exit(1);
});

