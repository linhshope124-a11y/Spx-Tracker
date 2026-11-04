// Hướng dẫn sử dụng: mở từ Menu phải ra TRANG HƯỚNG DẪN (lỗi cũ: ra lại chính app vì guide.html là bản sao index.html).
import { test, expect } from './fixtures.mjs';
import { collectProblems } from './helpers.mjs';

const openGuide = async page => {
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.locator('a[href="./guide.html"]').click();
  await expect(page).toHaveURL(/guide\.html$/);
};

test('Menu → Hướng dẫn sử dụng: mở đúng trang hướng dẫn, mở được từng mục, quay lại được app', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await openGuide(page);

  await expect(page).toHaveTitle(/Hướng dẫn/);
  await expect(page.locator('.g-title')).toHaveText('Hướng dẫn sử dụng');
  await expect(page.locator('#tab-overview')).toHaveCount(0);                    // không phải giao diện app

  const sec = page.locator('#sec-9');                                            // "Xóa dữ liệu & Hoàn tác"
  await sec.locator('.g-acc-head').click();
  await expect(sec).toContainText('Hoàn tác (6 giây)');
  await expect(page.locator('#sec-12 .g-acc-title')).toContainText('Ngày chưa cập nhật');

  await page.locator('.g-back-btn').click();                                     // quay lại app
  await expect(page).toHaveURL(/\/(index\.html)?$/);
  await expect(page.locator('#tab-overview')).toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test('hướng dẫn mở được cả khi OFFLINE (đã precache, không phụ thuộc font ngoài)', async ({ page, context }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => { const k = (await caches.keys()).find(n => n.startsWith('spx-tracker-')); return k ? (await (await caches.open(k)).match('/guide.html')) !== undefined : false; }).catch(() => false), { timeout: 20_000 }).toBe(true);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await openGuide(page);
  await expect(page.locator('.g-title')).toHaveText('Hướng dẫn sử dụng');
  await context.setOffline(false);
});

test('ô tìm kiếm trong hướng dẫn lọc đúng mục', async ({ page }) => {
  await page.goto('/guide.html');
  await page.locator('#gSearchToggle').click();
  await page.locator('input[type="search"], .g-search-input, #gSearchInput').first().fill('hoàn tác');
  await expect(page.locator('#sec-9')).toBeVisible();
  await expect(page.locator('#sec-1')).toBeHidden();
});
