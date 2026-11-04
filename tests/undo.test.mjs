// js/undo.js — "Hoàn tác" sau khi xóa bản ghi / cả tháng / toàn bộ.
import { store, made, alerts, flush } from './env.mjs';
globalThis.__autoEls = true;
import test, { mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { state } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');
const E = await import('../js/entry.js');
const U = await import('../js/undo.js');

const $ = id => document.getElementById(id);
const w = n => Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0]));
const rec = (id, date, n = 5) => ({ id, date, weights: w(n) });
const tick = () => new Promise(r => setTimeout(r, 0));
const btn = txt => made.filter(e => e.tag === 'button').find(e => String(e.textContent).includes(txt));
const ids = type => state.appData[type].map(r => r.id);

beforeEach(() => {
  store.clear(); made.length = 0; alerts.length = 0;
  globalThis.__confirmAnswer = true;                       // xác nhận "Xóa" trong showConfirm
  state.currentMonth = '2026-10';
  state.appData = {
    delivery: [rec(5, '2026-10-05'), rec(4, '2026-10-04'), rec(3, '2026-09-30'), rec(2, '2026-10-02'), rec(1, '2026-10-01')],
    pickup:   [rec(11, '2026-10-03'), rec(10, '2026-09-10')],
    return:   [rec(21, '2026-10-06')]
  };
  U.dismissUndo();
});
afterEach(async () => { mock.timers.reset(); U.dismissUndo(); await flush(); });

test('xóa bản ghi → hiện toast "Hoàn tác"; bấm hoàn tác → bản ghi trở lại ĐÚNG vị trí cũ', async () => {
  await E.deleteRecord('delivery', 2);
  assert.deepEqual(ids('delivery'), [5, 4, 3, 1]);
  assert.equal(U.hasPendingUndo(), true);
  assert.equal($('undoToast').classList.contains('active'), true);
  assert.equal($('undoToastMsg').textContent, 'Đã xóa bản ghi');
  assert.equal(U.undoLastDelete(), true);
  assert.deepEqual(ids('delivery'), [5, 4, 3, 2, 1]);
  assert.equal(U.hasPendingUndo(), false);
  assert.equal($('undoToast').classList.contains('active'), false);
});

test('hủy ở hộp thoại xác nhận → không xóa, không có toast hoàn tác', async () => {
  globalThis.__confirmAnswer = false;
  await E.deleteRecord('delivery', 2);
  assert.equal(state.appData.delivery.length, 5);
  assert.equal(U.hasPendingUndo(), false);
});

test('hoàn tác KHÔNG làm mất bản ghi nhập thêm trong lúc chờ (chỉ chèn lại bản đã xóa)', async () => {
  await E.deleteRecord('delivery', 4);
  state.appData.delivery.unshift(rec(99, '2026-10-07', 9));    // người dùng nhập thêm trong lúc toast còn hiện
  U.undoLastDelete();
  assert.deepEqual(ids('delivery').sort((a, b) => a - b), [1, 2, 3, 4, 5, 99]);
});

test('hoàn tác không nhân đôi nếu bản ghi đã có lại (id trùng)', async () => {
  await E.deleteRecord('delivery', 3);
  state.appData.delivery.push(rec(3, '2026-09-30'));           // vd nạp lại backup
  U.undoLastDelete();
  assert.equal(ids('delivery').filter(i => i === 3).length, 1);
});

test('hết 6 giây → toast tự tắt và không hoàn tác được nữa', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  await E.deleteRecord('delivery', 2);
  assert.equal(U.hasPendingUndo(), true);
  mock.timers.tick(U.UNDO_MS - 1);
  assert.equal(U.hasPendingUndo(), true);
  mock.timers.tick(1);
  assert.equal(U.hasPendingUndo(), false);
  assert.equal($('undoToast').classList.contains('active'), false);
  assert.equal(U.undoLastDelete(), false);
  assert.deepEqual(ids('delivery'), [5, 4, 3, 1]);
});

test('xóa lần nữa thay thế lời đề nghị cũ: chỉ hoàn tác được thao tác GẦN NHẤT', async () => {
  await E.deleteRecord('delivery', 5);
  await E.deleteRecord('return', 21);
  U.undoLastDelete();
  assert.deepEqual(ids('return'), [21]);
  assert.ok(!ids('delivery').includes(5), 'thao tác xóa trước đó không còn hoàn tác được');
});

test('xóa cả tháng → hoàn tác khôi phục cả 3 loại, đúng thứ tự cũ, giữ nguyên tháng khác', async () => {
  const p = E.deleteCurrentMonthHistory(); await tick();
  btn('Xóa vĩnh viễn').onclick();
  await p;
  assert.deepEqual(ids('delivery'), [3]);
  assert.deepEqual(ids('pickup'), [10]);
  assert.deepEqual(ids('return'), []);
  assert.match($('undoToastMsg').textContent, /tháng 10\/2026 \(6 bản ghi\)/);
  U.undoLastDelete();
  assert.deepEqual(ids('delivery'), [5, 4, 3, 2, 1]);
  assert.deepEqual(ids('pickup'), [11, 10]);
  assert.deepEqual(ids('return'), [21]);
});

test('xóa toàn bộ → hoàn tác khôi phục tất cả và ghi lại xuống localStorage (cả vault)', async () => {
  const p = E.clearAllHistory(); await tick();
  btn('xóa luôn').onclick();
  await p;
  assert.equal(state.appData.delivery.length + state.appData.pickup.length + state.appData.return.length, 0);
  assert.equal(store.get('spx_backup_vault'), undefined);
  assert.equal(U.hasPendingUndo(), true);
  U.undoLastDelete();
  assert.deepEqual(ids('delivery'), [5, 4, 3, 2, 1]);
  assert.equal(JSON.parse(store.get('spx_dual_records')).delivery.length, 5);
  assert.ok(store.get('spx_backup_vault'), 'vault được tạo lại');
});

test('offerUndo không có gì để hoàn tác → không hiện toast', () => {
  U.offerUndo([], 'x');
  assert.equal(U.hasPendingUndo(), false);
  assert.equal($('undoToast').classList.contains('active'), false);
});

test('toast hiển thị thanh đếm ngược theo đúng thời lượng', async () => {
  await E.deleteRecord('delivery', 1);
  assert.match($('undoToastBar').style.animation, new RegExp(`undoCountdown ${U.UNDO_MS}ms`));
});
