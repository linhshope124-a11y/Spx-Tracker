import { store, made, alerts } from './env.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const { state } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');
const B = await import('../js/backup.js');

const w = n => Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0]));
const rec = (id, date, n) => ({ id, date, weights: w(n) });
const tick = () => new Promise(r => setTimeout(r, 0));
const btn = txt => made.filter(e => e.tag === 'button').find(e => String(e.textContent).includes(txt));
const shade = () => made.find(e => e.tag === 'div' && String(e.className || '').includes('dialog-shade'));
const payload = () => ({ version: 1, data: { delivery: [
  rec(1000, '2026-10-01', 5),     // trùng hẳn bản ghi có sẵn
  rec(1001, '2026-10-02', 99),    // CÙNG id 1001 nhưng nội dung khác (đã sửa sau khi backup)
  rec(2000, '2026-10-03', 7)      // mới
], pickup: [], return: [] } });

beforeEach(() => {
  store.clear();
  state.appData = { delivery: [rec(1000, '2026-10-01', 5), rec(1001, '2026-10-02', 6)], pickup: [], return: [] };
  state.salaryByMonth = {}; state.rankByMonth = {};
  made.length = 0; alerts.length = 0;
});

test('chạm ra ngoài hộp thoại = HỦY, dữ liệu giữ nguyên', async () => {
  const p = B.runImport(payload()); await tick();
  shade().onclick({ target: shade() });
  const out = await p;
  assert.equal(out.status, 'cancel');
  assert.equal(state.appData.delivery.length, 2);
});

test('nút "Hủy" cũng hủy', async () => {
  const p = B.runImport(payload()); await tick();
  btn('Hủy').onclick();
  assert.equal((await p).status, 'cancel');
});

test('THÊM VÀO: bỏ bản trùng hẳn, cấp id mới cho id va chạm', async () => {
  const p = B.runImport(payload()); await tick();
  btn('Thêm vào').onclick();
  const out = await p;
  assert.equal(out.status, 'ok');
  assert.equal(out.mode, 'merge');
  assert.deepEqual([out.result.addedCount, out.result.removedCount], [2, 1]);
  const ids = state.appData.delivery.map(r => r.id);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, 'không được còn id trùng');
});

test('GHI ĐÈ: thay toàn bộ', async () => {
  const p = B.runImport(payload()); await tick();
  btn('Ghi đè').onclick();
  const out = await p;
  assert.equal(out.mode, 'overwrite');
  assert.equal(state.appData.delivery.length, 3);
});

test('máy đang trống: nạp thẳng (không hỏi)', async () => {
  state.appData = { delivery: [], pickup: [], return: [] };
  const out = await B.runImport(payload());
  assert.equal(out.status, 'ok');
  assert.equal(state.appData.delivery.length, 3);
});

for (const [label, bad] of [['null', null], ['mảng', []], ['object lạ', { foo: 1 }], ['chuỗi', 'abc'], ['data là mảng', { data: [1, 2] }]]) {
  test(`định dạng sai (${label}) → invalid, không đụng dữ liệu`, async () => {
    const out = await B.runImport(bad);
    assert.equal(out.status, 'invalid');
    assert.equal(state.appData.delivery.length, 2);
    assert.ok(alerts.length > 0);
  });
}

test('file 0 bản ghi → empty, KHÔNG xóa dữ liệu hiện tại', async () => {
  const out = await B.runImport({ data: { delivery: [], pickup: [], return: [] } });
  assert.equal(out.status, 'empty');
  assert.equal(state.appData.delivery.length, 2);
});

test('settings từ file không đáng tin được chuẩn hoá', async () => {
  state.appData = { delivery: [], pickup: [], return: [] };
  const evil = { data: payload().data, settings: {
    theme: '"><img src=x onerror=alert(1)>',
    region: 'hack',
    salaryByMonth: ['x'],
    rankByMonth: { '2026-10': { name: 'Bạc', bonus: 5 }, 'abc': { name: 'x', bonus: 1 }, '2026-11': { name: 'none', bonus: 0.1 } }
  } };
  const out = await B.runImport(evil);
  assert.equal(out.status, 'ok');
  assert.equal(store.get('spx_theme'), undefined, 'theme lạ bị bỏ qua');
  assert.notEqual(state.region, 'hack');
  assert.deepEqual(state.salaryByMonth, {});
  assert.deepEqual(state.rankByMonth, { '2026-10': { name: 'Bạc', bonus: 1 } });
});

test('payload hợp lệ vẫn nhận cả dạng trần {delivery, pickup, return}', async () => {
  state.appData = { delivery: [], pickup: [], return: [] };
  const out = await B.runImport({ delivery: [rec(5, '2026-10-05', 3)], pickup: [], return: [] });
  assert.equal(out.status, 'ok');
  assert.equal(state.appData.delivery.length, 1);
});

test('countPayloadRecords', () => {
  assert.equal(B.countPayloadRecords(payload()), 3);
  assert.equal(B.countPayloadRecords(null), 0);
  assert.equal(B.countPayloadRecords({ data: [1] }), 0);
});
