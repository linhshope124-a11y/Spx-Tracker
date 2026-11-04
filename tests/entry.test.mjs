import { store, made, alerts, flush } from './env.mjs';
globalThis.__autoEls = true;
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { state, persistData } = await import('../js/state.js');
const { WEIGHT_KEYS, WEIGHT_SUFFIXES } = await import('../js/config.js');
const E = await import('../js/entry.js');

const $ = id => document.getElementById(id);
const w = n => Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0]));
const rec = (id, date, n) => ({ id, date, weights: w(n) });
const tick = () => new Promise(r => setTimeout(r, 0));
const btn = txt => made.filter(e => e.tag === 'button').find(e => String(e.textContent).includes(txt));

afterEach(flush);

beforeEach(() => {
  store.clear(); made.length = 0; alerts.length = 0;
  state.appData = { delivery: [rec(1000, '2026-10-01', 5)], pickup: [], return: [] };
  $('inputDate').value = '2026-10-01'; $('editEntryId').value = ''; $('editEntryType').value = '';
  for (const p of ['del_inp', 'pick_inp', 'ret_inp']) WEIGHT_SUFFIXES.forEach(s => { $(`${p}_${s}`).value = '0'; });
});

test('sửa bản ghi: không cho lưu toàn số 0', async () => {
  $('editEntryId').value = '1000'; $('editEntryType').value = 'delivery';
  await E.saveRecord();
  assert.ok(alerts.length > 0);
  assert.equal(state.appData.delivery[0].weights[WEIGHT_KEYS[0]], 5);
});

test('có editId nhưng thiếu editType → báo lỗi, KHÔNG tạo bản ghi rác', async () => {
  $('editEntryId').value = '1000'; $('editEntryType').value = '';
  $('del_inp_0_2').value = '9';
  await E.saveRecord();
  assert.ok(alerts.length > 0);
  assert.equal(state.appData.delivery.length, 1);
});

test('thêm mới: lưu đúng, chặn trùng hoàn toàn', async () => {
  $('inputDate').value = '2026-10-02'; $('del_inp_0_2').value = '8';
  await E.saveRecord();
  assert.equal(state.appData.delivery.length, 2);
  $('del_inp_0_2').value = '8';
  await E.saveRecord();                                   // y hệt → bị chặn
  assert.equal(state.appData.delivery.length, 2);
});

test('thêm mới: ngày không có thật bị từ chối', async () => {
  $('inputDate').value = '2026-04-31'; $('del_inp_0_2').value = '8';
  await E.saveRecord();
  assert.equal(state.appData.delivery.length, 1);
});

test('xóa toàn bộ: ghi NGAY xuống localStorage, xóa vault, không kích hoạt auto-backup Cloud', async () => {
  state.appData = { delivery: [rec(1, '2026-10-01', 5), rec(2, '2026-10-02', 6)], pickup: [], return: [] };
  persistData();
  let changed = 0; window.addEventListener('spx:datachanged', () => changed++);
  const p = E.clearAllHistory(); await tick();
  btn('xóa luôn').onclick();
  await p;
  assert.equal(JSON.parse(store.get('spx_dual_records')).delivery.length, 0);
  assert.equal(store.get('spx_backup_vault'), undefined);
  assert.equal(changed, 0);
});

test('xóa toàn bộ: bấm Hủy thì giữ nguyên', async () => {
  state.appData = { delivery: [rec(1, '2026-10-01', 5)], pickup: [], return: [] };
  const p = E.clearAllHistory(); await tick();
  btn('Hủy').onclick();
  await p;
  assert.equal(state.appData.delivery.length, 1);
});
