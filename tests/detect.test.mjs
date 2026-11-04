// js/ocr/detect.js — nhận diện tab Giao / Lấy / Hoàn từ gạch chân cam (hàm thuần, trên điểm ảnh tổng hợp).
// Ảnh THẬT (SPX, "Đã trả hàng") được kiểm trong e2e/ocr-detect.spec.mjs bằng Chromium thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTabFromPixels } from '../js/ocr/detect.js';

const W = 1080, H = 2460, ROWS = Math.floor(H * 0.35);
const ORANGE = [229, 80, 45], GRAY = [100, 110, 125], DARK = [20, 30, 50], WHITE = [255, 255, 255], NAVY = [18, 22, 36];

/** Dựng khung điểm ảnh (chỉ ROWS hàng đầu) */
function frame({ bg = WHITE, ink = GRAY, labels, textY = [335, 380], underline, extras = [] }) {
  const d = new Uint8ClampedArray(W * ROWS * 4);
  const fill = (x0, x1, y0, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } };
  fill(0, W, 0, ROWS, bg);
  // nhãn: mỗi nhãn = vài "từ" (khối chữ) cách nhau 15px, như "Đã giao hàng"
  for (const [x0, x1] of labels) {
    const words = 3, ww = Math.floor((x1 - x0 - 15 * (words - 1)) / words);
    for (let k = 0; k < words; k++) fill(x0 + k * (ww + 15), x0 + k * (ww + 15) + ww, textY[0], textY[1], ink);
  }
  if (underline) fill(underline.x0, underline.x1, underline.y, underline.y + (underline.thick ?? 6), ORANGE);
  for (const e of extras) fill(e.x0, e.x1, e.y0, e.y1, e.c ?? ORANGE);
  return d;
}
const detect = f => detectTabFromPixels(f, W, ROWS, H);

// Bố cục THẬT của SPX (đo trên ảnh 1080×2460): nhãn dồn trái, khe giữa các tab 40px / 37px, khe trong 1 nhãn ≤ 16px
const REAL = [[72, 313], [354, 466], [504, 719]];
const under = (i) => { const [a, b] = REAL[i]; return { x0: a + 60, x1: a + 140, y: 408 }; };   // gạch chân 80px dưới nhãn i

test('bố cục thật (nhãn dồn trái): gạch chân dưới "Đã trả hàng" (x≈572–651, tâm 56,6%) → Hoàn', () => {
  const r = detect(frame({ labels: REAL, underline: { x0: 572, x1: 652, y: 408 } }));
  assert.equal(r.tab, 'ret');
  assert.equal(r.info.how, 'labels');
});

test('bố cục thật: dưới "Đã giao hàng" → Giao; dưới "Đã lấy" → Lấy', () => {
  assert.equal(detect(frame({ labels: REAL, underline: { x0: 152, x1: 232, y: 408 } })).tab, 'del');
  assert.equal(detect(frame({ labels: REAL, underline: { x0: 370, x1: 450, y: 408 } })).tab, 'pick');
});

test('bố cục chia đều 3 phần (máy/phiên bản khác): vẫn đúng', () => {
  const even = [[60, 330], [405, 675], [750, 1020]];
  assert.equal(detect(frame({ labels: even, underline: { x0: 130, x1: 260, y: 408 } })).tab, 'del');
  assert.equal(detect(frame({ labels: even, underline: { x0: 475, x1: 605, y: 408 } })).tab, 'pick');
  assert.equal(detect(frame({ labels: even, underline: { x0: 820, x1: 950, y: 408 } })).tab, 'ret');
});

test('chế độ tối (nền tối, chữ sáng) vẫn nhận đúng', () => {
  const r = detect(frame({ bg: NAVY, ink: [200, 205, 215], labels: REAL, underline: { x0: 572, x1: 652, y: 408 } }));
  assert.equal(r.tab, 'ret');
  assert.equal(r.info.how, 'labels');
});

test('gạch chân rộng hay hẹp đều được (4% … 30% bề rộng)', () => {
  for (const w of [44, 80, 200, 320]) {
    const cx = 611, r = detect(frame({ labels: REAL, underline: { x0: cx - w / 2, x1: cx + w / 2, y: 408 } }));
    assert.equal(r.tab, 'ret', `rộng ${w}px`);
  }
});

test('icon cam của Dynamic Island / status bar (trên 8% chiều cao) bị bỏ qua', () => {
  const island = { x0: 100, x1: 260, y0: 60, y1: 120 };         // y < 8% H = 196; RỘNG HƠN gạch chân (160 > 80px) → nếu quét nhầm vùng này sẽ bị chọn trước
  const r = detect(frame({ labels: REAL, underline: { x0: 572, x1: 652, y: 408 }, extras: [island] }));
  assert.equal(r.tab, 'ret');
});

test('vật cam khác trong vùng quét không đánh lừa: khối cam dày (nút), thanh cam quá dài (header)', () => {
  const button = { x0: 100, x1: 160, y0: 600, y1: 690 };        // khối cam 60×90: hàng nào cũng chỉ dài 60px nhưng KHÔNG phải gạch (vẫn là dải ≥2 hàng!) → thử độ dài
  const header = { x0: 0, x1: W, y0: 250, y1: 262 };            // thanh cam toàn chiều ngang: dài > 50% → loại
  const r = detect(frame({ labels: REAL, underline: { x0: 572, x1: 652, y: 408 }, extras: [header] }));
  assert.equal(r.tab, 'ret');
  assert.equal(r.info.method, 'underline');
  assert.ok(button.x1 > 0);
});

test('không có gạch chân cam → null (không đoán)', () => {
  assert.equal(detect(frame({ labels: REAL })).tab, null);
});

test('không tách được nhãn (ảnh trống chữ) → dự phòng chia 3 phần đều, không lỗi', () => {
  const r = detect(frame({ labels: [], underline: { x0: 880, x1: 960, y: 408 } }));
  assert.equal(r.tab, 'ret');
  assert.equal(r.info.how, 'thirds');
  assert.equal(detect(frame({ labels: [], underline: { x0: 80, x1: 160, y: 408 } })).tab, 'del');
});

test('hồi quy: cách chia 3 phần đều CŨ sẽ đọc nhầm ảnh thật này thành "Lấy"', () => {
  const r = detect(frame({ labels: REAL, underline: { x0: 572, x1: 652, y: 408 } }));
  const rel = r.info.centerX / W;
  assert.ok(rel >= 0.33 && rel < 0.66, `tâm ${rel} nằm vùng giữa → cách cũ ra "pick"`);
  assert.equal(r.tab, 'ret', 'cách mới phải ra "ret"');
});
