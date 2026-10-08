import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSources } from '../src/config.js';

const src = {
  code: 'demo', url: 'https://prices.example.org/live',
  intervalMs: 1000, timeoutMs: 2000,
  instruments: [{ code: 'gold', buySelector: '.buy', sellSelector: '.sell' }],
};
test('valid config has stable source identity', () => {
  assert.deepEqual(validateSources({ sources: [src] })[0], src);
});
test('rejects invalid and duplicate source config', () => {
  const invalid = [
    { ...src, code: 'BAD' },
    { ...src, intervalMs: 10 },
    { ...src, timeoutMs: 1 },
    { ...src, url: 'ftp://prices.example.org' },
    { ...src, url: 'http://prices.example.org' },
    { ...src, url: 'https://alice:pass@prices.example.org' },
    { ...src, url: 'https://prices.example.org/path#frag' },
    { ...src, instruments: [{ code: 'gold' }] },
    { ...src, instruments: [] },
  ];
  for (const source of invalid) assert.throws(() => validateSources({ sources: [source] }));
  assert.throws(() => validateSources({ sources: [src, src] }));
  assert.throws(() => validateSources({}));
  assert.throws(() => validateSources({ sources: {} }));
});
test('local fixtures require an explicit opt-in', () => {
  const s = { ...src, url: 'http://127.0.0.1:4000/prices' };
  assert.throws(() => validateSources({ sources: [s] }));
  assert.equal(validateSources({ sources: [{ ...s, allowLocalhost: true }] }).length, 1);
});
