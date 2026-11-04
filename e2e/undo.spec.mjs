import { test, expect } from './fixtures.mjs';
import { collectProblems, freezeDate, openHistory, rec, seed } from './helpers.mjs';

const data = () => ({ delivery: [rec(3, '2026-10-03'), rec(2, '2026-10-02'), rec(1, '2026-10-01')] });

test('xóa 1 bản ghi → toast "Hoàn tác" → bấm hoàn tác → bản ghi trở lại', async ({ page }) => {
  const problems = collectProblems(page);
  await freezeDate(page, 2026, 10, 8);
  await seed(page, data());
  await page.goto('/');
  await openHistory(page);

  const rows = page.locator('.hist-del-btn');
  await expect(rows).toHaveCount(3);
  await rows.first().click();
  await page.locator('#dialogOkBtn').click();                       // xác nhận Xóa
  await expect(rows).toHaveCount(2);

  const toast = page.locator('#undoToast');
  await expect(toast).toHaveClass(/active/);
  await expect(toast).toContainText('Đã xóa bản ghi');
  await toast.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(rows).toHaveCount(3);
  await expect(toast).not.toHaveClass(/active/);

  await page.reload();                                              // đã ghi xuống localStorage
  await openHistory(page);
  await expect(rows).toHaveCount(3);
  expect(problems).toEqual([]);
});

test('xóa dữ liệu cả tháng → Hoàn tác khôi phục toàn bộ', async ({ page }) => {
  await freezeDate(page, 2026, 10, 8);
  await seed(page, data());
  await page.goto('/');
  await openHistory(page);

  await expect(page.locator('#btnDeleteMonth')).toContainText('tháng 10/2026');
  await page.locator('#btnDeleteMonth').click();
  await page.getByRole('button', { name: /Xóa vĩnh viễn/ }).click();
  await expect(page.locator('.hist-del-btn')).toHaveCount(0);
  await expect(page.locator('#undoToast')).toContainText('3 bản ghi');

  await page.locator('#undoToast').getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.locator('.hist-del-btn')).toHaveCount(3);
});

test('hộp thoại xóa tháng: chạm ra ngoài = Hủy, dữ liệu giữ nguyên', async ({ page }) => {
  await freezeDate(page, 2026, 10, 8);
  await seed(page, data());
  await page.goto('/');
  await openHistory(page);
  await page.locator('#btnDeleteMonth').click();
  await expect(page.getByRole('button', { name: /Xóa vĩnh viễn/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Xóa vĩnh viễn/ })).toHaveCount(0);
  await expect(page.locator('.hist-del-btn')).toHaveCount(3);
});
