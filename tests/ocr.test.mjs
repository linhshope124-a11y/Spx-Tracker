import { flush } from './env.mjs';
globalThis.__autoEls = true;
import test, { mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { state } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');
const O = await import('../js/ocr/index.js');                       // API công khai (cổng vào)
const { parseOcrText, extractDateStrict, postProcessFixDigits, identifyRangeKey } = await import('../js/ocr/parser.js');
const { getBatchResults, setBatchResults } = await import('../js/ocr/batch.js');

const at = (y, m, d) => mock.timers.enable({ apis: ['Date'], now: new Date(y, m - 1, d, 12, 0, 0) });
afterEach(async () => { mock.timers.reset(); await flush(); });

// ───────────── extractDateStrict ─────────────
test('ngày: các định dạng thường gặp', () => {
  at(2026, 10, 17);
  assert.equal(extractDateStrict('Ngày 17/10/2026'), '2026-10-17');
  assert.equal(extractDateStrict('17.10.26'), '2026-10-17');
  assert.equal(extractDateStrict('Ngày 06/10'), '2026-10-06');
  assert.equal(extractDateStrict('Lấy 06/10'), '2026-10-06');
});

test('ngày ISO (yyyy-mm-dd) không bị đọc thành "26-10-17"', () => {
  at(2026, 10, 17);
  for (const t of ['2026-10-17', '2026/10/17 Tổng 15', 'Cập nhật 2026.10.17 14:30']) assert.equal(extractDateStrict(t), '2026-10-17', t);
});

test('ngày dính chữ do OCR vẫn đọc được ("Giao06/10")', () => {
  at(2026, 10, 17);
  assert.equal(extractDateStrict('Giao06/10'), '2026-10-06');
  assert.equal(extractDateStrict('Ngay06/10/2026'), '2026-10-06');
});

test('ngày không có thật → null (không để lọt "31/04")', () => {
  at(2026, 10, 17);
  for (const t of ['Ngày 31/04', '31/04/2026', '30/02', '2026-13-45']) assert.equal(extractDateStrict(t), null, t);
});

test('không có ngày; số có dấu ngăn cách nghìn không bị nhận là ngày', () => {
  at(2026, 10, 17);
  for (const t of ['Tổng 1.500 đơn', 'Tổng: 12.345 Đơn', '']) assert.equal(extractDateStrict(t), null, JSON.stringify(t));
});

test('dải cân dạng "2-4", "12-15" không bị nhận là ngày', () => {
  at(2026, 10, 17);
  assert.equal(extractDateStrict('>2-4kg 10 Đơn 12-15kg 3 Đơn 06/10'), '2026-10-06');
  assert.equal(extractDateStrict('>2-4kg 10 Đơn 12-15kg 3 Đơn'), null);
});

test('ảnh không ghi năm: ngày ở tương lai thuộc năm trước ("30/12" chụp đầu tháng 1)', () => {
  at(2027, 1, 2);
  assert.equal(extractDateStrict('Ngày 30/12'), '2026-12-30');
  assert.equal(extractDateStrict('Ngày 01/01'), '2027-01-01');
  mock.timers.reset();
  at(2026, 10, 17);
  assert.equal(extractDateStrict('Ngày 30/12'), '2025-12-30');
});

// ───────────── identifyRangeKey / parseOcrText ─────────────
test('identifyRangeKey: khớp đúng; chấp nhận số cuối bị đọc sai; loại cặp số vô lý', () => {
  assert.equal(identifyRangeKey(0, 2), '0_2');
  assert.equal(identifyRangeKey(12, 15), '12_15');
  assert.equal(identifyRangeKey(15, 999), 'over_15');
  assert.equal(identifyRangeKey(12, 16), '12_15');
  assert.equal(identifyRangeKey(15, 10), null);
  assert.equal(identifyRangeKey(3, 50), null);
});

test('parseOcrText: dòng ngày "06-10-2026" không bị coi là dải cân (không làm lệch số liệu)', () => {
  const p = parseOcrText('06-10-2026\nTổng: 15\n0 - 2 kg 10 Đơn\n2 - 4 kg 5 Đơn\n');
  assert.equal(p.weights['0_2'], 10);
  assert.equal(p.weights['2_4'], 5);
  assert.equal(p.weights['6_8'], 0);
  assert.equal(p.totalFound, 15);
  assert.equal(p.expectedTotal, 15);
});

// ───────────── postProcessFixDigits ─────────────
const parsed = (w, exp) => ({
  weights: { '0_2': 0, '2_4': 0, '4_6': 0, '6_8': 0, '8_10': 0, '10_12': 0, '12_15': 0, 'over_15': 0, ...w },
  confidences: {}, expectedTotal: exp, totalFound: Object.values(w).reduce((a, b) => a + b, 0), mode: 'x'
});

test('sửa chữ số: nghiệm duy nhất → tự sửa (13 → 19)', () => {
  const f = postProcessFixDigits(parsed({ '0_2': 13, '2_4': 20 }, 39));
  assert.deepEqual([f.fixInfo.key, f.fixInfo.oldVal, f.fixInfo.newVal], ['0_2', 13, 19]);
  assert.equal(f.totalFound, 39);
});

test('sửa chữ số: nhiều nghiệm cùng khớp tổng → KHÔNG đoán', () => {
  assert.equal(postProcessFixDigits(parsed({ '0_2': 13, '2_4': 13 }, 32)), null);
});

test('sửa chữ số: đã khớp / chưa có Tổng → không làm gì', () => {
  assert.equal(postProcessFixDigits(parsed({ '0_2': 10 }, 10)), null);
  assert.equal(postProcessFixDigits(parsed({ '0_2': 10 }, null)), null);
});

// ───────────── lô ảnh (batch) ─────────────
const W = o => Object.fromEntries(WEIGHT_KEYS.map(k => [k, o[k.slice(1)] || 0]));   // 'w0_2' → '0_2'
const item = (date, w, extra = {}) => ({ file: 'a.jpg', thumbnail: '', error: null, result: {
  detectedColorType: 'del', tabDetected: true, dateFound: true, parsedDate: date,
  weights: { '0_2': 0, '2_4': 0, '4_6': 0, '6_8': 0, '8_10': 0, '10_12': 0, '12_15': 0, 'over_15': 0, ...w },
  confidences: {}, expectedTotal: 100, totalFound: 100, mode: 'x', rawText: '', fullDataUrl: '', fixInfo: null, ...extra } });
const good = { '0_2': 60, '2_4': 25, '4_6': 10, '6_8': 5 };

beforeEach(() => { state.appData = { delivery: [{ id: 1000, date: '2026-10-01', weights: W({ '0_2': 5 }) }], pickup: [], return: [] }; });

test('saveBatchAll: chỉ lưu ảnh an toàn, GIỮ LẠI ảnh cần xem', async () => {
  at(2026, 10, 17);
  const A = item('2026-10-10', good);                          // lưu được
  const B = item('2026-10-01', { '0_2': 5 });                  // trùng hoàn toàn bản có sẵn → bỏ
  const C = item('2026-10-01', good);                          // cùng ngày, khác số → giữ
  const D = item('2026-04-31', good);                          // ngày không có thật → giữ
  const E = item('2027-01-01', good);                          // tương lai → giữ
  const F = { file: 'bad.jpg', thumbnail: '', result: null, error: 'Image load failed' };
  const G = item('2026-10-10', { ...good, '0_2': 61 });        // cùng ngày với A, khác số → giữ
  setBatchResults([A, B, C, D, E, F, G]);
  await O.saveBatchAll();
  const left = getBatchResults();
  assert.equal(state.appData.delivery.length, 2);
  assert.ok(state.appData.delivery.some(r => r.date === '2026-10-10'));
  assert.ok(!state.appData.delivery.some(r => r.date === '2026-04-31' || r.date === '2027-01-01'));
  assert.ok(!left.includes(A) && !left.includes(B));
  for (const x of [C, D, E, F, G]) assert.ok(left.includes(x));
  assert.equal(left.length, 5);
});

test('nhập từng ảnh: lưu xong thì ảnh rời lô; gọi lần 2 không bỏ nhầm ảnh khác', () => {
  const X = item('2026-10-12', good), Y = item('2026-10-13', good);
  setBatchResults([X, Y]);
  O.importBatchItem(0);
  assert.equal(O.completeActiveBatchItem(), true);
  assert.deepEqual(getBatchResults(), [Y]);
  assert.equal(O.completeActiveBatchItem(), false);
  assert.equal(getBatchResults().length, 1);
});

test('đóng form bằng X → hủy liên kết ảnh lô; nhập tay sau đó không bị tính là "từ lô"', () => {
  const Y = item('2026-10-13', good);
  setBatchResults([Y]);
  O.importBatchItem(0);
  window.dispatchEvent(new Event('spx:entry-closed'));
  assert.equal(O.completeActiveBatchItem(), false);
  assert.equal(getBatchResults().length, 1);
});

test('quay lại lô rồi nhập tay → không bỏ nhầm ảnh', () => {
  setBatchResults([item('2026-10-13', good)]);
  O.importBatchItem(0);
  O.backToBatch();
  assert.equal(O.completeActiveBatchItem(), false);
  assert.equal(getBatchResults().length, 1);
});
