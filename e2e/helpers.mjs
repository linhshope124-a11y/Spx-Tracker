import { WEIGHT_KEYS } from '../js/config.js';

export const STORAGE = { records: 'spx_dual_records' };

/** Tạo bản ghi: n đơn ở dải cân đầu tiên (đủ để kiểm tra hiển thị / xóa / hoàn tác). */
export const rec = (id, date, n = 5) => ({ id, date, weights: Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0])) });

/** Gieo dữ liệu vào localStorage TRƯỚC khi app chạy (chỉ lần đầu — không ghi đè sau khi tải lại trang). */
export async function seed(page, { delivery = [], pickup = [], ret = [] } = {}) {
  await page.addInitScript(([key, data]) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.setItem('__seeded', '1');
    }
  }, [STORAGE.records, { delivery, pickup, return: ret }]);
}

/** Cố định ngày hiện tại của trang (timer vẫn chạy thật). */
export const freezeDate = (page, y, m, d, hh = 10) => page.clock.setFixedTime(new Date(y, m - 1, d, hh, 0, 0));

/** Lỗi console/JS/HTTP cùng origin trong lúc chạy — test phải thấy mảng rỗng. */
export function collectProblems(page) {
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('response', r => {
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url()).origin && r.status() >= 400) problems.push(`HTTP ${r.status()} ${u.pathname}`);
  });
  return problems;
}

export const openTab = (page, tab) => page.locator(`.nav-btn[data-tab="${tab}"]`).click();

/** Mở tab Nhật ký bằng nút ở thanh trên (khớp chính xác tên — còn có nút "Xóa toàn bộ nhật ký"). */
export const openHistory = page => page.getByRole('button', { name: 'Nhật ký', exact: true }).click();
