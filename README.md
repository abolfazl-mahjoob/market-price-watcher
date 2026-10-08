# Market Price Watcher

**Resilient multi-source market-data polling with TypeScript, Playwright and PostgreSQL.**

Adapted from the engineering challenges of Zarnoush's private market price
watcher and rewritten into an isolated reference project with synthetic
local-only examples. No proprietary source code, credentials, selectors,
session files or financial feed data were copied.

[![Quality gate](https://github.com/abolfazl-mahjoob/market-price-watcher/actions/workflows/ci.yml/badge.svg)](https://github.com/abolfazl-mahjoob/market-price-watcher/actions/workflows/ci.yml)

## Engineering features

- Reuses **one Chromium browser** with independent contexts and long-lived
  pages per source — **no reload on each poll**.
- Parses Persian, Arabic and Western digits, currency suffixes and grouped
  decimals with fixed-point `bigint` (no IEEE-754 monetary rounding).
- PostgreSQL `NUMERIC` current quotes and append-only **changed** price
  history, committed atomically with transaction-scoped advisory locks.
- Rejects out-of-order readings and deduplicates unchanged values.
- Isolates failing sources, adds capped retry backoff, graceful shutdown
  and per-source health.
- Includes unit tests, real Chromium DOM-mutation tests, and PostgreSQL
  concurrency integration tests in CI.

## Try it

Node.js 22+ and a local PostgreSQL service are required.

```bash
docker compose up -d postgres
npm install
npx playwright install chromium
export DATABASE_URL=postgresql://watcher:watcher_dev@localhost:5432/watcher
npm run migrate
npm run build
npm test
```

A sample config is in [config/examples.json](config/examples.json). It
targets a **local synthetic HTML fixture** at `127.0.0.1:4000`, not an
actual website. See [Architecture](docs/architecture.md) before adapting
it to a source you are authorized to monitor.

```bash
# In one terminal: launch the sample fixture
node examples/fixture-server.mjs
# In another terminal, after exporting DATABASE_URL:
WATCHER_CONFIG=./config/examples.json npm start
```

Prices are written to `current_prices`, `price_ticks` and
`source_health`.

## Important limits

This is a **reference implementation**, not a production trading
connector. It intentionally excludes private site login/cookies,
website-specific selectors, public source submission, CAPTCHA bypass,
currency conversion and live financial feeds. Only collect data from
sources that permit automated access. Read the threat model and
trade-offs in [the architecture document](docs/architecture.md).

The MIT license covers the new standalone code; rights to any
independently owned source integrations remain separate.
