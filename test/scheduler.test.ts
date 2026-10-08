import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delay, retryDelay, runSource } from '../src/scheduler.js';
import type { ObservationReader, PriceSink, SourceStatus } from '../src/model.js';

test('retry delay doubles with a capped upper bound and bounded jitter', () => {
  assert.equal(retryDelay(1, 0), 1000);
  assert.equal(retryDelay(2, 0), 2000);
  assert.equal(retryDelay(4, 0), 8000);
  assert.ok(retryDelay(100, 0.99) <= 30249);
  assert.throws(() => retryDelay(0, 0));
  assert.throws(() => retryDelay(1, Number.NaN));
});
test('delay resolves when signalled rather than waiting for timer', async () => {
  const controller = new AbortController();
  const value = delay(60000, controller.signal);
  controller.abort();
  await value;
});
test('source loop recovers from failure, records health and closes cleanly', async () => {
  const stop = new AbortController();
  const status: SourceStatus[] = [];
  const price = {
    sourceCode: 's', instrumentCode: 'g', buy: '12.00', sell: null,
    observedAt: new Date(),
  };
  let attempt = 0;
  let reset = 0;
  let closed = 0;
  const reader: ObservationReader = {
    async read() {
      attempt += 1;
      if (attempt === 1) throw new Error('browser disconnected');
      return [price];
    },
    async reset() { reset += 1; },
    async close() { closed += 1; },
  };
  const sink: PriceSink = {
    async recordPrice() { return true; },
    async recordHealth(_source, state) {
      status.push(state);
      if (state === 'ok') stop.abort();
    },
  };
  await runSource('s', reader, sink, 1000, stop.signal);
  assert.equal(reset, 1);
  assert.equal(closed, 1);
  assert.deepEqual(status, ['error', 'ok', 'stopped']);
});
