import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresPriceStore } from '../src/store.js';
import type { PriceObservation } from '../src/model.js';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('Use a disposable DATABASE_URL for PostgreSQL integration tests');
const pool = new Pool({ connectionString: connection, max: 12 });
const store = new PostgresPriceStore(pool);
const t = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms));
function observation(price: string, ms: number, source = 'demo'): PriceObservation {
  return { sourceCode: source, instrumentCode: 'gold',
    buy: price, sell: null, observedAt: t(ms) };
}
before(async () => {
  await pool.query('SELECT 1');
});
beforeEach(async () => {
  await pool.query('TRUNCATE price_ticks,current_prices,source_health RESTART IDENTITY');
});
after(async () => { await pool.end(); });

test('initial value, unchanged value and changed value produce two history ticks', async () => {
  assert.equal(await store.recordPrice(observation('100.00', 1)), true);
  assert.equal(await store.recordPrice(observation('100.00', 2)), false);
  assert.equal(await store.recordPrice(observation('101.00', 3)), true);
  const history = await pool.query(
    'SELECT buy_price::text FROM price_ticks ORDER BY id',
  );
  assert.deepEqual(history.rows.map(x => x.buy_price), ['100.00', '101.00']);
  const current = await pool.query(
    "SELECT buy_price::text, observed_at FROM current_prices WHERE source_code='demo'",
  );
  assert.equal(current.rows[0].buy_price, '101.00');
  assert.equal(current.rows[0].observed_at.getTime(), t(3).getTime());
});

test('late or equal-time events never overwrite newer observations', async () => {
  assert.equal(await store.recordPrice(observation('200.00', 99)), true);
  assert.equal(await store.recordPrice(observation('999.00', 1)), false);
  assert.equal(await store.recordPrice(observation('1000.00', 99)), false);
  const value = await pool.query("SELECT buy_price::text FROM current_prices");
  assert.equal(value.rows[0].buy_price, '200.00');
  assert.equal((await pool.query('SELECT * FROM price_ticks')).rowCount, 1);
});

test('concurrent writers serialize and converge on the latest timestamp', async () => {
  const writes = Array.from({ length: 45 }, (_unused, i) =>
    observation(`${100 + i}.00`, i + 1));
  await Promise.all(writes.reverse().map(value => store.recordPrice(value)));
  const data = await pool.query('SELECT buy_price::text, observed_at FROM current_prices');
  assert.equal(data.rows[0].buy_price, '144.00');
  assert.equal(data.rows[0].observed_at.getTime(), t(45).getTime());
  const ticks = await pool.query('SELECT observed_at FROM price_ticks ORDER BY id');
  assert.ok(ticks.rowCount && ticks.rowCount >= 1 && ticks.rowCount <= 45);
  for (let i = 1; i < ticks.rows.length; i++) {
    assert.ok(ticks.rows[i].observed_at > ticks.rows[i - 1].observed_at);
  }
});

test('separate sources are isolated by compound key', async () => {
  await store.recordPrice(observation('100.00', 1, 'first'));
  await store.recordPrice(observation('200.00', 1, 'second'));
  assert.equal((await pool.query('SELECT * FROM current_prices')).rowCount, 2);
});

test('failed validation never writes history', async () => {
  await assert.rejects(store.recordPrice({ ...observation('10.00', 1), buy: null }));
  assert.equal((await pool.query('SELECT * FROM price_ticks')).rowCount, 0);
});

test('health tracking records failures and resets counters after recovery', async () => {
  await store.recordHealth('demo', 'error');
  await store.recordHealth('demo', 'error');
  const failed = await pool.query(
    "SELECT status,consecutive_failures FROM source_health WHERE source_code='demo'",
  );
  assert.deepEqual(failed.rows, [{ status: 'error', consecutive_failures: 2 }]);
  await store.recordHealth('demo', 'ok');
  await store.recordHealth('demo', 'stopped');
  const recovered = await pool.query(
    "SELECT status,consecutive_failures,last_success_at FROM source_health WHERE source_code='demo'",
  );
  assert.equal(recovered.rows[0].status, 'stopped');
  assert.equal(recovered.rows[0].consecutive_failures, 0);
  assert.ok(recovered.rows[0].last_success_at);
});
