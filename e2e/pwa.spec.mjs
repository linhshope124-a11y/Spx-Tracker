import fs from 'node:fs';
import { test, expect } from './fixtures.mjs';
import { collectProblems } from './helpers.mjs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const core = [...read('sw.js').match(/const CORE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const version = JSON.parse(read('version.json')).version;
const cacheName = `spx-tracker-${version}`;
const toPath = p => (p === './' ? '/' : '/' + p.slice(2));

// Trang có thể tự tải lại 1 lần khi Service Worker kích hoạt lần đầu → bọc try, thử lại.
const cachedPaths = page => page.evaluate(async name => {
  if (!(await caches.keys()).includes(name)) return [];
  return (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname);
}, cacheName).catch(() => []);

async function waitInstalled(page) {
  await page.goto('/');
  await expect.poll(async () => (await cachedPaths(page)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(core.length);
}

test('Service Worker cài được và precache ĐỦ mọi file trong CORE (và không cache version.json)', async ({ page }) => {
  await waitInstalled(page);
  const cached = await cachedPaths(page);
  expect(core.map(toPath).filter(p => !cached.includes(p))).toEqual([]);
  expect(cached).not.toContain('/version.json');
});

test('offline: tải lại trang vẫn chạy hoàn toàn bằng cache (không lỗi, các hàm đã nạp)', async ({ page, context }) => {
  const problems = collectProblems(page);
  await waitInstalled(page);
  await page.reload();                                   // để trang được Service Worker kiểm soát
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#tab-overview')).toHaveClass(/active/);
  expect(await page.evaluate(() => typeof window.openAddModal)).toBe('function');
  await context.setOffline(false);
  expect(problems.filter(p => !/Failed to fetch|net::ERR_INTERNET_DISCONNECTED/.test(p))).toEqual([]);
});

test('manifest hợp lệ: tên, icon tải được, có icon maskable riêng', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href, page.url()).href);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBeTruthy();
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, page.url()).href);
    expect(r.ok(), icon.src).toBeTruthy();
    expect(r.headers()['content-type']).toMatch(/image\//);
  }
  expect(m.icons.some(i => i.purpose === 'maskable')).toBeTruthy();
});

test('mở app lần đầu KHÔNG tự tải lại khi Service Worker vừa cài xong (không mất toast / form đang nhập)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__noReloadMarker = true; });
  await expect.poll(async () => (await cachedPaths(page)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(core.length);
  await page.waitForTimeout(2500);                                   // đủ thời gian để thông báo kích hoạt SW tới trang
  expect(await page.evaluate(() => window.__noReloadMarker === true)).toBe(true);
});
