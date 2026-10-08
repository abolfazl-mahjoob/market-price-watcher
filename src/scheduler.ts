import type { ObservationReader, PriceSink } from './model.js';

export function retryDelay(attempt: number, random = Math.random()): number {
  if (!Number.isInteger(attempt) || attempt < 1 ||
      !Number.isFinite(random) || random < 0 || random >= 1) {
    throw new RangeError('Invalid retry inputs');
  }
  // Exponential backoff with jitter, capped at 30 seconds.
  return Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 6)) +
    Math.floor(random * 250);
}

export async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(done, ms);
    function done(): void {
      signal.removeEventListener('abort', done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/** One source failure cannot interrupt other source loops. */
export async function runSource(
  code: string,
  reader: ObservationReader,
  sink: PriceSink,
  intervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  let failures = 0;
  try {
    while (!signal.aborted) {
      const started = Date.now();
      try {
        const observations = await reader.read();
        for (const item of observations) await sink.recordPrice(item);
        await sink.recordHealth(code, 'ok');
        failures = 0;
      } catch {
        failures += 1;
        await sink.recordHealth(code, 'error').catch(() => undefined);
        await reader.reset().catch(() => undefined);
      }
      if (signal.aborted) break;
      const wait = failures
        ? retryDelay(failures)
        : Math.max(0, intervalMs - (Date.now() - started));
      await delay(wait, signal);
    }
  } finally {
    await reader.close().catch(() => undefined);
    await sink.recordHealth(code, 'stopped').catch(() => undefined);
  }
}
