import { test, expect } from './fixtures.mjs';
import { freezeDate, rec, seed } from './helpers.mjs';

const payload = JSON.stringify({ version: 1, data: { delivery: [rec(10, '2026-10-05', 7)], pickup: [], return: [] } });

test('nạp dữ liệu khi máy đang có dữ liệu: Esc = HỦY; "Thêm vào" gộp, không mất dữ liệu cũ', async ({ page }) => {
  await freezeDate(page, 2026, 10, 8);
  await seed(page, { delivery: [rec(1, '2026-10-01'), rec(2, '2026-10-02')] });
  await page.goto('/');
  await page.evaluate(() => window.openPasteJsonModal());          // (đường vào Cài đặt → Dán nằm sâu trong menu)
  await page.locator('#jsonPasteInput').fill(payload);

  await page.getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByRole('button', { name: /Thêm vào/ })).toBeVisible();
  await page.keyboard.press('Escape');                              // chạm ngoài / Esc phải là HỦY
  await expect(page.getByRole('button', { name: /Thêm vào/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('spx_dual_records')).delivery.length)).toBe(2);

  await page.getByRole('button', { name: 'Khôi phục' }).click();
  await page.getByRole('button', { name: /Thêm vào/ }).click();
  await page.locator('#dialogOkBtn').click();                       // hộp thoại "Hoàn tất"
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('spx_dual_records')).delivery.length)).toBe(3);
});
