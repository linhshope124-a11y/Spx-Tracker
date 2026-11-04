import { test, expect } from './fixtures.mjs';
import { freezeDate, openHistory, rec, seed } from './helpers.mjs';

test('banner "Chưa cập nhật N ngày" → danh sách ngày → bấm Nhập điền đúng ngày', async ({ page }) => {
  await freezeDate(page, 2026, 10, 8);                              // xét 1..7; có 1, 3, 4, 5 → thiếu 2, 6, 7
  await seed(page, { delivery: [rec(1, '2026-10-01'), rec(3, '2026-10-03'), rec(4, '2026-10-04')], pickup: [rec(5, '2026-10-05')] });
  await page.goto('/');
  await openHistory(page);

  const banner = page.locator('#missedDaysBanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Chưa cập nhật 3 ngày');

  await banner.locator('.missed-days-content').click();
  const items = page.locator('#missedDatesList .missed-date-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('02/10/2026');
  await expect(items.nth(0)).toContainText('Thứ Sáu');

  await items.nth(1).getByRole('button', { name: /Nhập/ }).click();
  await expect(page.locator('#missedDaysModal')).not.toHaveClass(/active/);
  await expect(page.locator('#entryModal')).toHaveClass(/active/);
  await expect(page.locator('#inputDate')).toHaveValue('2026-10-06');
});

test('đủ mọi ngày → không có banner', async ({ page }) => {
  await freezeDate(page, 2026, 10, 4);
  await seed(page, { delivery: [rec(1, '2026-10-01'), rec(2, '2026-10-02'), rec(3, '2026-10-03')] });
  await page.goto('/');
  await openHistory(page);
  await expect(page.locator('#missedDaysBanner')).toBeHidden();
});
