/* Мини-сервер для TurnikMan: только статика, без зависимостей.
   Слушает 0.0.0.0, чтобы открываться в превью и на телефоне по локальной сети. */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = path.resolve(__dirname, '..', 'www');
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 — нет такого файла: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache, no-store, must-revalidate',
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
    };

    // поддержка Range — пригодится, если файлы начнут открывать в WebView
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          'content-length': end - start + 1,
          'content-range': `bytes ${start}-${end}/${stat.size}`,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TurnikMan → http://${HOST}:${PORT}  (корень: ${ROOT})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
