import { test, expect } from './fixtures.mjs';
import { collectProblems } from './helpers.mjs';

test('app tải sạch: không lỗi JS/console, không file 404, mọi hàm onclick đã sẵn sàng', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await expect(page.locator('#tab-overview')).toHaveClass(/active/);

  // Tương đương kiểm tra tĩnh onclick ↔ window nhưng trên trình duyệt thật (kể cả HTML sinh động từ JS)
  const missing = await page.evaluate(() => {
    const skip = new Set(['if', 'parseInt', 'parseFloat']);
    const names = new Set();
    document.querySelectorAll('[onclick]').forEach(el => {
      for (const m of el.getAttribute('onclick').matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
    });
    return [...names].filter(n => !skip.has(n) && typeof window[n] !== 'function');
  });
  expect(missing).toEqual([]);
  expect(problems).toEqual([]);
});

test('thanh điều hướng đổi tab đúng', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['delivery', 'pickup', 'return', 'overview']) {
    await page.locator(`.nav-btn[data-tab="${tab}"]`).click();
    await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
  }
});
