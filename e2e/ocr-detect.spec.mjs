// Nhận diện tab Giao / Lấy / Hoàn trên ẢNH CHỤP MÀN HÌNH SPX THẬT (tests/fixtures/ocr-images/).
// Chạy trong trình duyệt thật vì thuật toán đọc điểm ảnh qua <canvas>.
// Cách cũ (chia ảnh làm 3 phần đều) đọc nhầm TOÀN BỘ ảnh "Đã trả hàng" thành "Lấy" (đã đo trên 3/3 ảnh).
import { test, expect } from './fixtures.mjs';

const CASES = [
  // [file, tab đúng (nhìn trên ảnh), ghi chú]
  ['spx-giao-02-10.jpg',            'del',  'Đã giao hàng — 6 dải cân'],
  ['spx-giao-24-10.jpg',            'del',  'Đã giao hàng — 5 dải cân'],
  ['spx-lay-04-10.jpg',             'pick', 'Đã lấy'],
  ['spx-lay-24-10.jpg',             'pick', 'Đã lấy'],
  ['spx-lay-24-10-dao-dong.jpg',    'pick', 'Đã lấy — có "đảo động" camera ở thanh trạng thái'],
  ['spx-tra-hang-24-10.jpg',        'ret',  'Đã trả hàng (gạch chân ở 56,7% bề rộng)'],
  ['spx-tra-hang-24-10-b.jpg',      'ret',  'Đã trả hàng'],
  ['spx-tra-hang-05-10.jpg',        'ret',  'Đã trả hàng']
];

for (const [file, tab, note] of CASES) {
  test(`ảnh thật ${file}: ${note} → "${tab}"`, async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async src => {
      const m = await import('/js/ocr/detect.js');
      const tab = await m.detectActiveTabByOrangeLine(src);
      return { tab, dbg: window.__spxLastTabDetect };
    }, `/tests/fixtures/ocr-images/${file}`);
    expect(out.tab).toBe(tab);
    expect(out.dbg.how).toBe('labels');          // xác định bằng vị trí nhãn, không phải dự phòng chia đều
  });
}
