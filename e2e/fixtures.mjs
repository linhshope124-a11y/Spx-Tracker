// Fixture dùng chung: mọi test đều dùng `test` từ đây thay vì '@playwright/test'.
import { test as base, expect } from '@playwright/test';

// Nhắc "Đã 7 ngày chưa backup" là hành vi đúng của app, nhưng nó bật hộp thoại sau ~5 giây và sẽ chặn
// các thao tác kế tiếp của test (đã gặp: che mất nút "Hoàn tác"). Đánh dấu "vừa backup" để test ổn định.
export const AUTO_BACKUP_LAST_KEY = 'spx_last_auto_backup';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(key => {
      try { if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now())); } catch {}
    }, AUTO_BACKUP_LAST_KEY);
    await use(page);
  }
});
export { expect };
