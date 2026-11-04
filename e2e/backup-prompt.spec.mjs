import { test, expect } from './fixtures.mjs';
import { freezeDate, rec, seed } from './helpers.mjs';

test('nhắc backup định kỳ: hiện sau vài giây; "Để sau" thì hôm nay không hỏi lại', async ({ page }) => {
  await freezeDate(page, 2026, 10, 8);
  await seed(page, { delivery: [rec(1, '2026-10-01')] });
  await page.addInitScript(() => localStorage.removeItem('spx_last_auto_backup'));   // giả lập "chưa backup lần nào"
  await page.goto('/');

  const dialog = page.locator('#dialogModal');
  await expect(dialog).toHaveClass(/active/, { timeout: 12_000 });
  await expect(page.locator('#dialogMessage')).toContainText('chưa backup');
  await page.locator('#dialogCancelBtn').click();                         // "Để sau"
  await expect(dialog).not.toHaveClass(/active/);

  await page.reload();
  await page.waitForTimeout(7_000);                                       // quá thời điểm nhắc (5s)
  await expect(dialog).not.toHaveClass(/active/);
});
