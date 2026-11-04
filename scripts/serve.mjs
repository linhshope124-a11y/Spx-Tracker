// Máy chủ tĩnh tối giản (không cần cài gói) để chạy app / e2e tại http://localhost:4173
//   node scripts/serve.mjs            (đổi cổng: PORT=8080 node scripts/serve.mjs)
// localhost được coi là "secure context" nên Service Worker + PWA hoạt động như khi deploy HTTPS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 4173;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end('403'); return; }   // chống ../
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + rel); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',                                  // luôn lấy bản mới khi phát triển/test
      ...(path.basename(file) === 'sw.js' ? { 'service-worker-allowed': '/' } : {})
    });
    res.end(data);
  });
}).listen(port, () => console.log(`SPX Tracker: http://localhost:${port}`));
