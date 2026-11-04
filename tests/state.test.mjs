import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from './env.mjs';
const { state, sanitizeRecords, loadState, persistData } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');

test('sanitizeRecords: bỏ mục hỏng, ép kiểu weights, cấp lại id trùng', () => {
  const out = sanitizeRecords([
    { id: 1, date: '2026-10-01', weights: { [WEIGHT_KEYS[0]]: '5', [WEIGHT_KEYS[1]]: -3, [WEIGHT_KEYS[2]]: 'abc' } },
    { id: 1, date: '2026-10-02', weights: {} },          // trùng id
    { id: 2, date: '2026-04-31', weights: {} },          // ngày không có thật
    { id: 3, date: 'x', weights: {} },
    null, 'chuỗi', 42,
    { id: 4, date: '2026-10-03' }                        // thiếu weights
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0].weights[WEIGHT_KEYS[0]], 5);
  assert.equal(out[0].weights[WEIGHT_KEYS[1]], 0);
  assert.equal(out[0].weights[WEIGHT_KEYS[2]], 0);
  WEIGHT_KEYS.forEach(k => assert.equal(typeof out[2].weights[k], 'number'));   // thiếu weights → đủ khoá, giá trị 0
  assert.equal(new Set(out.map(r => r.id)).size, 3, 'id phải duy nhất');
});

test('sanitizeRecords: đầu vào không phải mảng → []', () => {
  for (const v of [null, undefined, {}, 'x', 5]) assert.deepEqual(sanitizeRecords(v), []);
});

test('loadState: máy còn spx_period_mode="day" từ bản cũ bị ép về "month"', () => {
  store.clear(); store.set('spx_period_mode', 'day');
  loadState();
  assert.equal(state.periodMode, 'month');
  assert.equal(store.get('spx_period_mode'), 'month');
});

test('loadState: khôi phục từ vault khi records bị mất', () => {
  store.clear();
  const rec = { id: 11, date: '2026-10-01', weights: Object.fromEntries(WEIGHT_KEYS.map(k => [k, 1])) };
  store.set('spx_backup_vault', JSON.stringify({ delivery: [rec], pickup: [], return: [] }));
  loadState();
  assert.equal(state.appData.delivery.length, 1);
});

test('persistData: chỉ ghi khi dữ liệu đổi; vault chỉ cập nhật khi có dữ liệu', () => {
  store.clear();
  state.appData = { delivery: [], pickup: [], return: [] };
  persistData();                                        // lần đầu
  assert.equal(store.get('spx_backup_vault'), undefined, 'rỗng thì không ghi vault');
  state.appData.delivery.push({ id: 1, date: '2026-10-01', weights: Object.fromEntries(WEIGHT_KEYS.map(k => [k, 2])) });
  assert.equal(persistData(), true);
  assert.ok(store.get('spx_backup_vault'));
  assert.equal(persistData(), false, 'không đổi → không ghi');
});
