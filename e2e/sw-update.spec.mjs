// Hồi quy: sau khi phát hành bản mới, Service Worker mới phải precache file MỚI, không lấy bản cũ từ
// bộ nhớ đệm HTTP của trình duyệt. Hosting kiểu GitHub Pages gửi `Cache-Control: max-age=600` cho mọi file;
// `cache.addAll(urls)` mặc định tôn trọng max-age đó → có thể cất vào cache MỚI một style.css CŨ
// (triệu chứng thật: HTML/JS mới nhưng thiếu CSS → nút "Xóa dữ liệu tháng", toast "Hoàn tác" hiện thô, không định dạng).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve(dir) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });   // như GitHub Pages
      res.end(data);
    });
  });
  return new Promise(r => srv.listen(0, () => r(srv)));
}

test('phát hành bản mới: cache mới chứa CSS MỚI dù hosting cho phép cache HTTP 10 phút', async ({ browser }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spx-deploy-'));
  fs.cpSync(root, tmp, { recursive: true, filter: s => !/node_modules|test-results|playwright-report|\.git/.test(s) });
  const srv = await serve(tmp);
  const base = `http://localhost:${srv.address().port}`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const oldCache = `spx-tracker-${JSON.parse(fs.readFileSync(path.join(tmp, 'version.json'), 'utf8')).version}`;
    await page.goto(base + '/');
    await expect.poll(() => page.evaluate(async n => (await caches.keys()).includes(n) && (await (await caches.open(n)).keys()).length, oldCache).catch(() => 0), { timeout: 20_000 }).toBeGreaterThan(20);

    // "Phát hành" bản mới ngay sau đó (trong vòng 10 phút): đổi CSS + đổi tên cache
    fs.appendFileSync(path.join(tmp, 'css/style.css'), '\n/* DEPLOY-2 marker */\n');
    const sw = fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8').replace(/const CACHE\s*=\s*'[^']+'/, "const CACHE = 'spx-tracker-v99.9'");
    fs.writeFileSync(path.join(tmp, 'sw.js'), sw);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));

    await expect.poll(() => page.evaluate(async () => {
      const c = await caches.open('spx-tracker-v99.9');
      const r = await c.match('/css/style.css');
      return r ? (await r.text()).includes('DEPLOY-2 marker') : null;
    }), { timeout: 20_000, message: 'cache của bản mới đang chứa style.css CŨ' }).toBe(true);
  } finally {
    await ctx.close();
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
