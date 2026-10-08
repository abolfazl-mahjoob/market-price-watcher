import { createServer } from 'node:http';
const server = createServer((request, response) => {
  if (request.url !== '/prices') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html lang="fa"><body>
    <h1>Synthetic demo — NOT live market data</h1>
    <div data-price="buy">۱۲٬۳۴۵ ریال</div>
    <div data-price="sell">۱۲٬۳۵۵ ریال</div>
    <script>
      setInterval(() => {
        const node = document.querySelector('[data-price="buy"]');
        node.textContent = node.textContent === '۱۲٬۳۴۵ ریال'
          ? '۱۲٬۳۴۶ ریال' : '۱۲٬۳۴۵ ریال';
      }, 3000);
    </script>
  </body></html>`);
});
server.listen(4000, '127.0.0.1', () => {
  console.log('Local synthetic price fixture: http://127.0.0.1:4000/prices');
});
