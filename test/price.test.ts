import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMinor, midpoint, parsePrice, InvalidPriceError } from '../src/price.js';

test('Persian, Arabic and Latin digits preserve fixed decimal precision', () => {
  assert.equal(parsePrice('۱۲٬۳۴۵٬۶۷۸ ریال'), '12345678.00');
  assert.equal(parsePrice('١٢,٣٤٥.٦٧ تومان'), '12345.67');
  assert.equal(parsePrice('1,200.5'), '1200.50');
  assert.equal(parsePrice('۹۹'), '99.00');
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
});
test('rejects unknown symbols, invalid groupings, negative and malformed prices', () => {
  for (const bad of [
    '۱۲,۳۴', '1.234', '1e12', '$123', 'abc123', '-12',
    '0', '0.00', '12/34', '1,23,456', '1.2.3', '۱۲٫۳۰',
    '999999999999999999999',
  ]) assert.throws(() => parsePrice(bad), InvalidPriceError, bad);
});
test('midpoint performs half-up integer arithmetic, never IEEE-754 money math', () => {
  assert.equal(midpoint('100.00', '100.01'), '100.01');
  assert.equal(midpoint('9007199254740993.11', '9007199254740993.13'),
    '9007199254740993.12');
  assert.equal(midpoint('100.00', null), '100.00');
  assert.equal(midpoint(null, null), null);
  assert.equal(formatMinor(0n), '0.00');
  assert.throws(() => formatMinor(-1n), InvalidPriceError);
});
