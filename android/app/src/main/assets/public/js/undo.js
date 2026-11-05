// =============================================================
// Hoàn tác (undo) cho thao tác XÓA: bản ghi, cả tháng, toàn bộ.
//
// Cách làm: sau khi đã xóa, `offerUndo()` hiện toast "Hoàn tác" trong vài giây.
// Hoàn tác = CHÈN LẠI đúng các bản ghi đã xóa (giữ id, giữ vị trí cũ), KHÔNG khôi phục cả
// snapshot — nên nếu trong lúc chờ người dùng đã nhập thêm bản ghi khác thì không bị mất.
// Chỉ nhớ 1 thao tác gần nhất, nằm trong bộ nhớ (tải lại trang là hết).
// =============================================================
import { state, persistData } from './state.js';
import { updateAllViews } from './render.js';
import { showToast } from './ui.js';

export const UNDO_MS = 6000;
const TYPES = ['delivery', 'pickup', 'return'];

/** @type {{ items: {type:string, record:any, index:number}[], timer: any } | null} */
let _pending = null;

const el = id => document.getElementById(id);

function hideToast() {
  const t = el('undoToast');
  if (t) t.classList.remove('active');
}

export function hasPendingUndo() { return _pending !== null; }

/** Bỏ lời đề nghị hoàn tác hiện tại (không hoàn tác gì). */
export function dismissUndo() {
  if (_pending) clearTimeout(_pending.timer);
  _pending = null;
  hideToast();
}

/**
 * Gọi SAU KHI đã xóa xong.
 * @param {{type:string, record:any, index:number}[]} items  bản ghi đã xóa + vị trí cũ trong mảng của loại đó
 * @param {string} message  nội dung toast (vd "Đã xóa bản ghi")
 */
export function offerUndo(items, message, ms = UNDO_MS) {
  dismissUndo();                                   // thao tác xóa mới thay thế lời đề nghị cũ
  if (!items.length) return;
  _pending = { items, timer: setTimeout(dismissUndo, ms) };

  const toast = el('undoToast');
  if (!toast) { showToast(message, 'success'); return; }   // HTML cũ chưa có toast riêng
  const msg = el('undoToastMsg');
  if (msg) msg.textContent = message;
  const bar = el('undoToastBar');
  if (bar) {                                       // thanh đếm ngược; chạy lại animation mỗi lần
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = `undoCountdown ${ms}ms linear forwards`;
  }
  toast.classList.add('active');
}

/** Nút "Hoàn tác". @returns {boolean} có gì để hoàn tác không */
export function undoLastDelete() {
  if (!_pending) return false;
  const { items } = _pending;
  dismissUndo();

  let restored = 0;
  for (const type of TYPES) {
    const arr = state.appData[type];
    const have = new Set(arr.map(r => r.id));
    items.filter(i => i.type === type)
      .sort((a, b) => a.index - b.index)           // chèn theo thứ tự tăng dần → khôi phục đúng vị trí cũ
      .forEach(({ record, index }) => {
        if (have.has(record.id)) return;           // đã có lại (vd nạp lại backup) → không nhân đôi
        arr.splice(Math.min(index, arr.length), 0, record);
        have.add(record.id);
        restored++;
      });
  }
  persistData();                                   // ghi ngay (tạo lại cả vault nếu trước đó đã xóa)
  updateAllViews();
  showToast(restored ? `Đã hoàn tác (${restored} bản ghi)` : 'Không có gì để hoàn tác', restored ? 'success' : 'warning', 2200);
  return true;
}
