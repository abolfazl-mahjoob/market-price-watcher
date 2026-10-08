import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { BrowserHost, BrowserSourceReader } from '../src/browser.js';
import type { SourceConfig } from '../src/config.js';

test('real Chromium reuses a DOM page; recovery starts a fresh context', async () => {
  let navigationCount = 0;
  const server = createServer((_request, response) => {
    navigationCount++;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><body>
      <span id="buy">۱۲٬۳۴۵ تومان</span>
      <span id="sell">۱۲,۳۴۷ تومان</span>
      <script>setTimeout(() => {
        document.getElementById('buy').textContent = '۱۲,۳۴۶ تومان';
      }, 100);</script>
    </body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const source: SourceConfig = {
    code: 'demo',
    url: `http://127.0.0.1:${address.port}/prices`,
    intervalMs: 1000, timeoutMs: 5000, allowLocalhost: true,
    instruments: [{ code: 'gold', buySelector: '#buy', sellSelector: '#sell' }],
  };
  const host = new BrowserHost();
  const reader = new BrowserSourceReader(source, host);
  try {
    const first = await reader.read();
    assert.equal(first[0]?.sell, '12347.00');
    await new Promise(resolve => setTimeout(resolve, 250));
    const second = await reader.read();
    assert.equal(second[0]?.buy, '12346.00');
    assert.equal(navigationCount, 1, 'a successful price tick must NOT reload');
    await reader.reset();
    const recovered = await reader.read();
    assert.ok(recovered.length === 1);
    assert.equal(navigationCount, 2, 'recovery opens a fresh browser page');
  } finally {
    await reader.close();
    await host.close();
    server.close();
    await once(server, 'close');
  }
});
