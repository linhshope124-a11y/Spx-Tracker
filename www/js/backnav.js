// Nút/cử chỉ Back kiểu Android:
//  1) MainActivity.java gọi window.__spxBack() trước: có popup đang mở thì đóng popup trên cùng.
//  2) Từ Chính sách bảo mật / Hướng dẫn quay về thì mở lại Menu (đúng chỗ người dùng vừa rời đi).
const REOPEN_KEY = 'spx-reopen-menu';

/** Trả về true nếu đã xử lý (đóng 1 popup). */
export function handleBack() {
  const open = Array.from(document.querySelectorAll('.modal-shade.active'));
  if (!open.length) return false;
  const top = open[open.length - 1];
  if (top.id === 'dialogModal' && typeof window.dialogCancel === 'function') {
    window.dialogCancel();
    return true;
  }
  const closeBtn = top.querySelector('.modal-close-btn');
  if (closeBtn instanceof HTMLElement) closeBtn.click();
  else top.classList.remove('active');
  return true;
}

export function initBackNav() {
  window.__spxBack = handleBack;
  // Bấm link sang trang phụ từ Menu → nhớ để mở lại Menu khi quay về
  document.addEventListener('click', (e) => {
    const t = e.target;
    const a = t instanceof Element ? t.closest('#menuModal a[href]') : null;
    if (!a) return;
    try { sessionStorage.setItem(REOPEN_KEY, '1'); } catch (_) { /* bỏ qua */ }
  });
}

export function reopenMenuIfNeeded(openMenu) {
  let flag = null;
  try {
    flag = sessionStorage.getItem(REOPEN_KEY);
    sessionStorage.removeItem(REOPEN_KEY);
  } catch (_) { /* bỏ qua */ }
  if (flag === '1') openMenu();
}
