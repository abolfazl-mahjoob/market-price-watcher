import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { BrowserHost, BrowserSourceReader } from './browser.js';
import { validateSources } from './config.js';
import { runSource } from './scheduler.js';
import { PostgresPriceStore } from './store.js';

async function main(): Promise<void> {
  const filename = process.env.WATCHER_CONFIG || './config/examples.json';
  const sources = validateSources(JSON.parse(await readFile(filename, 'utf8')) as unknown);
  if (!sources.length) throw new Error('No sources configured');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const host = new BrowserHost();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10,
    connectionTimeoutMillis: 5000 });
  const sink = new PostgresPriceStore(pool);
  const stopped = new AbortController();

  process.once('SIGINT', () => stopped.abort());
  process.once('SIGTERM', () => stopped.abort());
  console.info(JSON.stringify({ event: 'watcher-started', sources: sources.map(s => s.code) }));
  try {
    await Promise.allSettled(
      sources.map(s => runSource(
        s.code, new BrowserSourceReader(s, host), sink, s.intervalMs, stopped.signal,
      )),
    );
  } finally {
    stopped.abort();
    await host.close();
    await pool.end();
  }
}
main().catch(error => {
  console.error('watcher-failed', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
});
