// Tính năng: bộ đếm "ngày chưa cập nhật" (tab Nhật ký) + xóa dữ liệu của tháng đang xem.
import { store, made, alerts, flush } from './env.mjs';
globalThis.__autoEls = true;
import test, { mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { state } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');
const R = await import('../js/render.js');
const E = await import('../js/entry.js');
const UI = await import('../js/ui.js');

const $ = id => document.getElementById(id);
const w = n => Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0]));
let nextId = 1;
const rec = (date, n = 5) => ({ id: nextId++, date, weights: w(n) });
const tick = () => new Promise(r => setTimeout(r, 0));
const btn = txt => made.filter(e => e.tag === 'button').find(e => String(e.textContent).includes(txt));
const at = (y, m, d) => mock.timers.enable({ apis: ['Date'], now: new Date(y, m - 1, d, 12, 0, 0) });

afterEach(async () => { mock.timers.reset(); await flush(); });
beforeEach(() => {
  store.clear(); made.length = 0; alerts.length = 0;
  R.setHistFilters({ date: null });
  state.currentMonth = '2026-10';
  state.appData = {
    delivery: [rec('2026-10-01'), rec('2026-10-03'), rec('2026-10-04'), rec('2026-09-10'), rec('2026-09-11')],
    pickup:   [rec('2026-10-05')],      // ngày 5/10 chỉ có bản ghi "Lấy" → vẫn tính là đã cập nhật
    return:   [rec('2026-09-30')]
  };
});

// ───────────── getMissedDaysInCurrentMonth ─────────────
test('tháng hiện tại: tính đến HÔM QUA (ngày 2 chưa có bản ghi; hôm nay chưa tính)', () => {
  // có: 1, 3, 4, 5 → hôm nay 6/10, xét ngày 1..5 → thiếu ngày 2
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6, 9, 0)), 1);
  // hôm nay 8/10: xét 1..7 → thiếu 2, 6, 7
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 8, 9, 0)), 3);
});

test('ngày 1 của tháng: chưa có ngày nào để tính', () => {
  state.currentMonth = '2026-11';
  state.appData.delivery.push(rec('2026-11-01'));
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 10, 1, 8, 0)), 0);
});

test('tháng đã qua: tính cả tháng (30 ngày − 3 ngày có dữ liệu = 27)', () => {
  state.currentMonth = '2026-09';
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6)), 27);
});

test('tháng tương lai, hoặc tháng chưa có bản ghi nào → 0', () => {
  state.currentMonth = '2026-12';
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6)), 0);
  state.currentMonth = '2026-08';                       // quá khứ nhưng không có bản ghi
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6)), 0);
});

test('đủ mọi ngày → 0; năm nhuận được tính đúng số ngày', () => {
  state.currentMonth = '2024-02';
  state.appData = { delivery: Array.from({ length: 29 }, (_, i) => rec(`2024-02-${String(i + 1).padStart(2, '0')}`)), pickup: [], return: [] };
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6)), 0);
  state.appData.delivery.pop();                         // bỏ ngày 29/2
  assert.equal(R.getMissedDaysInCurrentMonth(new Date(2026, 9, 6)), 1);
});

// ───────────── renderHistory: banner + nhãn nút ─────────────
test('renderHistory: hiện banner đúng số ngày và nhãn nút theo tháng đang xem', () => {
  at(2026, 10, 8);
  R.renderHistory();
  assert.equal($('missedDaysBanner').style.display, 'flex');
  assert.match($('missedDaysText').innerHTML, /Chưa cập nhật <b>3 ngày<\/b>/);
  assert.equal($('btnDeleteMonth').textContent, '🗑️ Xóa dữ liệu tháng 10/2026');
});

test('renderHistory: ẩn banner khi đang lọc 1 ngày; đổi tháng thì nhãn nút đổi theo', () => {
  at(2026, 10, 8);
  R.setHistFilters({ date: '2026-10-03' });
  R.renderHistory();
  assert.equal($('missedDaysBanner').style.display, 'none');
  R.setHistFilters({ date: null });
  state.currentMonth = '2026-09';
  R.renderHistory();
  assert.equal($('btnDeleteMonth').textContent, '🗑️ Xóa dữ liệu tháng 9/2026');
});

test('renderHistory: không có ngày sót → banner ẩn', () => {
  at(2026, 10, 6);
  state.appData.delivery.push(rec('2026-10-02'));
  R.renderHistory();
  assert.equal($('missedDaysBanner').style.display, 'none');
});

// ───────────── deleteCurrentMonthHistory ─────────────
const monthCount = (month) => ['delivery', 'pickup', 'return'].reduce((n, t) => n + state.appData[t].filter(r => r.date.startsWith(month + '-')).length, 0);

test('xóa tháng: tháng không có dữ liệu → chỉ báo, không đụng gì', async () => {
  state.currentMonth = '2026-08';
  await E.deleteCurrentMonthHistory();
  assert.ok(alerts.length > 0);
  assert.equal(monthCount('2026-10') + monthCount('2026-09'), 7);
});

test('xóa tháng: Hủy → giữ nguyên', async () => {
  const p = E.deleteCurrentMonthHistory(); await tick();
  btn('Hủy bỏ').onclick();
  await p;
  assert.equal(monthCount('2026-10'), 4);
});

test('xóa tháng: chạm ra ngoài hộp thoại = Hủy', async () => {
  const p = E.deleteCurrentMonthHistory(); await tick();
  const shade = made.find(e => e.tag === 'div' && String(e.className || '').includes('dialog-shade'));
  shade.onclick({ target: shade });
  await p;
  assert.equal(monthCount('2026-10'), 4);
});

test('xóa tháng: "Xóa vĩnh viễn" chỉ xóa tháng đang xem, cả 3 loại, giữ nguyên tháng khác', async () => {
  const p = E.deleteCurrentMonthHistory(); await tick();
  btn('Xóa vĩnh viễn').onclick();
  await p;
  assert.equal(monthCount('2026-10'), 0);
  assert.equal(state.appData.pickup.length, 0);                     // bản ghi "Lấy" của tháng 10 cũng mất
  assert.equal(monthCount('2026-09'), 3);                           // 2 Giao + 1 Hoàn của tháng 9 còn nguyên
  assert.equal(state.appData.return.length, 1);
});

test('xóa tháng: không đụng các tháng khác trong cùng năm', async () => {
  state.currentMonth = '2026-01';
  state.appData = { delivery: [rec('2026-01-05'), rec('2026-10-05'), rec('2026-11-05'), rec('2026-12-05')], pickup: [], return: [] };
  const p = E.deleteCurrentMonthHistory(); await tick();
  btn('Xóa vĩnh viễn').onclick();
  await p;
  assert.deepEqual(state.appData.delivery.map(r => r.date), ['2026-10-05', '2026-11-05', '2026-12-05']);
});

test('xóa tháng: "Sao lưu & Xóa" tải file trước, chỉ xóa khi bấm Xác nhận xóa', async () => {
  globalThis.__confirmAnswer = false;                               // lần 1: người dùng chưa thấy file → Hủy
  let p = E.deleteCurrentMonthHistory(); await tick();
  btn('Sao lưu & Xóa').onclick();
  await p;
  const anchor = made.find(e => e.tag === 'a' && String(e.download || '').startsWith('SPX_BeforeDeleteMonth'));
  assert.ok(anchor, 'phải tải file sao lưu');
  assert.equal(monthCount('2026-10'), 4, 'chưa xác nhận → chưa xóa');

  made.length = 0;
  globalThis.__confirmAnswer = true;                                // lần 2: xác nhận
  p = E.deleteCurrentMonthHistory(); await tick();
  btn('Sao lưu & Xóa').onclick();
  await p;
  assert.equal(monthCount('2026-10'), 0);
  assert.equal(monthCount('2026-09'), 3);
});

// ───────────── danh sách ngày chưa cập nhật (getMissedDatesList + modal) ─────────────
test('getMissedDatesList: trả đủ ngày/tháng/năm và thứ trong tuần; khớp bộ đếm', () => {
  const now = new Date(2026, 9, 8, 9, 0);                   // 8/10/2026 → xét 1..7; có 1, 3, 4, 5 → thiếu 2, 6, 7
  const list = R.getMissedDatesList(now);
  assert.deepEqual(list.map(d => d.iso), ['2026-10-02', '2026-10-06', '2026-10-07']);
  assert.deepEqual(list.map(d => d.dayOfWeek), ['Thứ Sáu', 'Thứ Ba', 'Thứ Tư']);
  assert.deepEqual([list[0].day, list[0].month, list[0].year], [2, 10, 2026]);
  assert.equal(R.getMissedDaysInCurrentMonth(now), list.length);
});

test('getMissedDatesList: tháng tương lai / tháng chưa có bản ghi → mảng rỗng', () => {
  state.currentMonth = '2026-12';
  assert.deepEqual(R.getMissedDatesList(new Date(2026, 9, 8)), []);
  state.currentMonth = '2026-08';
  assert.deepEqual(R.getMissedDatesList(new Date(2026, 9, 8)), []);
});

test('openMissedDaysModal: vẽ từng ngày thiếu với nút Nhập / Quét và mở modal', () => {
  at(2026, 10, 8);
  UI.openMissedDaysModal();
  const html = $('missedDatesList').innerHTML;
  for (const iso of ['2026-10-02', '2026-10-06', '2026-10-07']) {
    assert.ok(html.includes(`handleMissedDateAction('manual', '${iso}')`), `thiếu nút Nhập ${iso}`);
    assert.ok(html.includes(`handleMissedDateAction('scan', '${iso}')`), `thiếu nút Quét ${iso}`);
  }
  assert.match(html, /02\/10\/2026/);
  assert.match(html, /Thứ Sáu/);
  assert.equal($('missedDaysModal').classList.contains('active'), true);
});

test('openMissedDaysModal: không có ngày thiếu → thông báo, không có nút', () => {
  at(2026, 10, 6);
  state.appData.delivery.push(rec('2026-10-02'));
  UI.openMissedDaysModal();
  assert.ok(!$('missedDatesList').innerHTML.includes('handleMissedDateAction'));
  assert.match($('missedDatesList').innerHTML, /Tuyệt vời/);
});

test('handleMissedDateAction("manual"): đóng danh sách, mở form nhập với đúng ngày đã chọn', () => {
  at(2026, 10, 8);
  UI.openMissedDaysModal();
  UI.handleMissedDateAction('manual', '2026-10-06');
  assert.equal($('missedDaysModal').classList.contains('active'), false);
  assert.equal($('inputDate').value, '2026-10-06');
});

test('handleMissedDateAction("scan"): đóng danh sách và mở chọn ảnh', () => {
  let opened = 0;
  globalThis.openOcrPicker = () => { opened++; };
  at(2026, 10, 8);
  UI.openMissedDaysModal();
  UI.handleMissedDateAction('scan', '2026-10-06');
  assert.equal(opened, 1);
  assert.equal($('missedDaysModal').classList.contains('active'), false);
  delete globalThis.openOcrPicker;
});
