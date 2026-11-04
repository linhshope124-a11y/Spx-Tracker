import { test, expect } from './fixtures.mjs';
import { collectProblems, freezeDate, openHistory, openTab } from './helpers.mjs';

test('nhập tay 1 bản ghi: lưu, hiện trong Nhật ký, còn nguyên sau khi tải lại', async ({ page }) => {
  const problems = collectProblems(page);
  await freezeDate(page, 2026, 10, 17);
  await page.goto('/');

  await openTab(page, 'delivery');
  await page.locator('#tab-delivery .btn-cta-manual').click();
  await expect(page.getByRole('dialog', { name: /.+/ }).first()).toBeVisible();      // modal có role="dialog" (trình đọc màn hình)
  await expect(page.locator('#inputDate')).toHaveValue('2026-10-17');

  await page.locator('#del_inp_0_2').fill('12');
  await page.locator('#del_inp_2_4').fill('3');
  await page.getByRole('button', { name: 'Lưu dữ liệu' }).click();
  await expect(page.locator('#entryModal')).not.toHaveClass(/active/);

  await openHistory(page);
  await expect(page.locator('.hist-del-btn')).toHaveCount(1);
  await expect(page.locator('#historyEntries')).toContainText('17/10/2026');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spx_dual_records')));
  expect(saved.delivery).toHaveLength(1);
  expect(saved.delivery[0].date).toBe('2026-10-17');

  await page.reload();
  await openHistory(page);
  await expect(page.locator('.hist-del-btn')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('lưu form trống → hộp thoại báo thiếu dữ liệu, không tạo bản ghi', async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'delivery');
  await page.locator('#tab-delivery .btn-cta-manual').click();
  await page.getByRole('button', { name: 'Lưu dữ liệu' }).click();
  await expect(page.locator('#dialogModal')).toHaveClass(/active/);
  await page.locator('#dialogOkBtn').click();
  await expect(page.locator('#entryModal')).toHaveClass(/active/);                    // form vẫn mở để người dùng sửa
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spx_dual_records') || '{"delivery":[]}'));
  expect(saved.delivery).toHaveLength(0);
});
