// Luồng quét ảnh ĐẦY ĐỦ trong Chromium thật: chọn ảnh → tiền xử lý canvas → nhận diện tab (ảnh THẬT) → đọc chữ → parser → lưu.
// Chỉ Tesseract.js (tải từ CDN) được thay bằng bản giả trả về văn bản có sẵn trong tests/fixtures/ocr/ — nhờ vậy chạy được offline
// và kiểm được phần "dán keo" giữa các module (detect + parser + form + tự lưu) mà test đơn vị không với tới.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures.mjs';
import { freezeDate } from './helpers.mjs';
import { WEIGHT_KEYS } from '../js/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = f => path.join(root, 'tests/fixtures/ocr-images', f);
const fixture = n => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/ocr', n + '.json'), 'utf8'));
const KEYS = ['0_2', '2_4', '4_6', '6_8', '8_10', '10_12', '12_15', 'over_15'];
const STORE_TYPE = { del: 'delivery', pick: 'pickup', ret: 'return' };

const STUB = `window.Tesseract = { PSM: { SINGLE_BLOCK: 6 },
  createWorker: async () => ({ setParameters: async () => {}, recognize: async () => { const q = window.__stubSeq; const t = q ? (q[window.__stubI++] ?? q[q.length - 1]) : window.__stubOcrText; return { data: { text: t || '' } }; }, terminate: async () => {} }) };`;

test.use({ serviceWorkers: 'block' });          // để page.route chặn được request CDN (SW không can thiệp)

async function openAndScan(page, files, text) {
  await page.route('**/tesseract.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await freezeDate(page, 2026, 10, 25);
  await page.goto('/');
  await page.evaluate(t => { window.__stubI = 0; if (Array.isArray(t)) window.__stubSeq = t; else window.__stubOcrText = t; }, text);
  await page.setInputFiles('#ocrFileInput', files.map(img));
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('spx_dual_records') || '{"delivery":[],"pickup":[],"return":[]}'));
const total = d => d.delivery.length + d.pickup.length + d.return.length;

/** Chờ kết quả: 'saved' (tự lưu) | 'modal' (cần người dùng xem) */
async function outcome(page) {
  let r = 'pending';
  await expect.poll(async () => {
    const d = await saved(page);
    if (total(d) > 0) r = 'saved';
    else if (await page.locator('#entryModal.active, #batchOcrModal.active').count()) r = 'modal';
    return r;
  }, { timeout: 45_000, message: 'OCR không ra kết quả (không lưu, không mở form)' }).not.toBe('pending');
  return r;
}

const CASES = [
  // [ảnh thật, văn bản OCR, tab đúng, đáp án {dải: số đơn}, ngày]
  ['spx-tra-hang-24-10.jpg',     fixture('app-that-tra-hang-24-10').rawText,         'ret',  { '0_2': 1, '4_6': 1 }, '2026-10-24'],  // log THẬT từ app (vie)
  ['spx-tra-hang-24-10-b.jpg',   fixture('app-that-tra-hang-24-10').rawText,         'ret',  { '0_2': 1, '4_6': 1 }, '2026-10-24'],
  ['spx-tra-hang-05-10.jpg',     fixture('anh-that-tra-hang-05-10').rawText,         'ret',  { '0_2': 49 },          '2026-10-05'],
  ['spx-lay-04-10.jpg',          fixture('anh-that-lay-04-10').rawText,              'pick', { '0_2': 52, '8_10': 1 }, '2026-10-04'],
  ['spx-lay-24-10.jpg',          fixture('anh-that-lay-24-10').rawText,              'pick', { '0_2': 30 },          '2026-10-24'],
  ['spx-lay-24-10-dao-dong.jpg', fixture('anh-that-lay-24-10-dao-dong').rawText,     'pick', { '0_2': 30 },          '2026-10-24'],
  ['spx-giao-24-10.jpg',         fixture('giao-24-10-chep-tay').rawText,             'del',  { '0_2': 81, '2_4': 4, '4_6': 4, '6_8': 1, '8_10': 2 }, '2026-10-24']
];

for (const [file, text, tab, weights, date] of CASES) {
  test(`quét ${file} → lưu ĐÚNG loại "${STORE_TYPE[tab]}", ngày ${date}, số đơn ${JSON.stringify(weights)}`, async ({ page }) => {
    await openAndScan(page, [file], text);
    if (await outcome(page) === 'modal') {                               // cần xem: form nhập đã điền sẵn → bấm Lưu như người dùng
      await page.getByRole('button', { name: 'Lưu dữ liệu' }).click();
      await expect.poll(async () => total(await saved(page))).toBe(1);
    }
    const d = await saved(page);
    expect(total(d), 'chỉ đúng 1 bản ghi').toBe(1);
    const list = d[STORE_TYPE[tab]];
    expect(list, `bản ghi phải nằm ở "${STORE_TYPE[tab]}" (lỗi cũ: ảnh Hoàn bị lưu vào Lấy)`).toHaveLength(1);
    expect(list[0].date).toBe(date);
    KEYS.forEach((k, i) => expect(list[0].weights[WEIGHT_KEYS[i]], `dải ${k}`).toBe(weights[k] || 0));
  });
}

test('ảnh bị đọc hỏng số (Tổng 119 nhưng các dải không khớp): KHÔNG tự lưu, mở form cho người dùng xem', async ({ page }) => {
  await openAndScan(page, ['spx-giao-02-10.jpg'], fixture('anh-that-giao-02-10-so-bi-doc-hong').rawText);
  expect(await outcome(page)).toBe('modal');
  expect(total(await saved(page))).toBe(0);
});

test('quét 3 ảnh cùng lúc: mỗi ảnh vào đúng loại / ngày, không lẫn, không trùng', async ({ page }) => {
  // Ảnh tốt (tổng khớp) chỉ cần 1 lượt nhận dạng → ảnh thứ k nhận văn bản thứ k.
  const files = ['spx-lay-04-10.jpg', 'spx-tra-hang-05-10.jpg', 'spx-lay-24-10.jpg'];
  const texts = [fixture('anh-that-lay-04-10').rawText, fixture('anh-that-tra-hang-05-10').rawText, fixture('anh-that-lay-24-10').rawText];
  await openAndScan(page, files, texts);
  await expect.poll(async () => total(await saved(page)), { timeout: 45_000 }).toBe(3);   // cả 3 đều đã đối chiếu khớp → tự lưu
  const d = await saved(page);
  expect(d.pickup.map(r => r.date).sort()).toEqual(['2026-10-04', '2026-10-24']);
  expect(d.return.map(r => r.date)).toEqual(['2026-10-05']);
  expect(d.delivery).toHaveLength(0);
});

test('đủ 3 tab của ngày 24/10 (Giao + Lấy + Hoàn) quét cùng lúc → mỗi loại 1 bản ghi đúng', async ({ page }) => {
  const files = ['spx-giao-24-10.jpg', 'spx-lay-24-10.jpg', 'spx-tra-hang-24-10.jpg'];
  const texts = [fixture('giao-24-10-chep-tay').rawText, fixture('anh-that-lay-24-10').rawText, fixture('app-that-tra-hang-24-10').rawText];
  await openAndScan(page, files, texts);
  await expect.poll(async () => total(await saved(page)), { timeout: 45_000 }).toBe(3);
  const d = await saved(page);
  expect([d.delivery.length, d.pickup.length, d.return.length]).toEqual([1, 1, 1]);
  expect([d.delivery[0].date, d.pickup[0].date, d.return[0].date]).toEqual(['2026-10-24', '2026-10-24', '2026-10-24']);
});
