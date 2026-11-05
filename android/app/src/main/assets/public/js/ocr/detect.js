// =============================================================
// OCR · detect.js
// Nhận diện tab (Giao / Lấy / Hoàn) từ gạch chân màu cam trên ảnh chụp màn hình SPX.
//
// Cách làm (không dựa vào bố cục cố định):
//   1. Tìm gạch chân cam: đoạn cam LIÊN TỤC ngang, dày ≥ 2 hàng, rộng 2%–50% bề rộng ảnh
//      (bỏ qua icon cam của Dynamic Island / thanh trạng thái ở trên 8% chiều cao).
//   2. Đọc hàng nhãn ngay phía trên gạch chân, tìm 2 khoảng trống LỚN NHẤT giữa các nhãn
//      → chia thành 3 nhóm = 3 tab; gạch chân nằm dưới nhóm nào thì đó là tab đang chọn.
//   3. Không tách được nhãn (lạ bố cục / ảnh cắt) → dự phòng: chia ảnh làm 3 phần đều nhau.
// Lý do đổi: ở bản SPX hiện tại các nhãn "Đã giao hàng | Đã lấy | Đã trả hàng" dồn về bên trái,
// gạch chân của tab thứ 3 nằm ở 56,6% bề rộng → cách chia 3 phần đều (33%/66%) đọc nhầm thành "Lấy".
// =============================================================

const ORANGE = (r, g, b) => r > 200 && g >= 40 && g <= 160 && b <= 110 && (r - g) > 60;
/** @type {('del'|'pick'|'ret')[]} */
const TABS = ['del', 'pick', 'ret'];   // Giao, Lấy, Hoàn

/**
 * Thuần logic trên điểm ảnh (không DOM) — dùng được trong test.
 * @param {Uint8ClampedArray|number[]} rgba  điểm ảnh RGBA của `rows` hàng đầu tiên (rộng W)
 * @param {number} W     chiều rộng ảnh
 * @param {number} rows  số hàng có trong rgba
 * @param {number} H     chiều cao đầy đủ của ảnh (để tính vùng quét theo %)
 * @returns {{ tab: 'del'|'pick'|'ret'|null, info: object }}
 */
export function detectTabFromPixels(rgba, W, rows, H) {
  const yStart = Math.floor(H * 0.08);                       // bỏ status bar + Dynamic Island
  const yEnd = Math.min(rows, Math.floor(H * 0.35));
  const at = (x, y) => (y * W + x) * 4;

  // ---- 1) gạch chân: đoạn cam liên tục dài nhất trên từng hàng ----
  let totalOrange = 0;
  const rowRuns = [];
  for (let y = yStart; y < yEnd; y++) {
    let bestLen = 0, bestStart = 0, cur = 0, curStart = 0;
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (ORANGE(rgba[i], rgba[i + 1], rgba[i + 2])) {
        totalOrange++;
        if (cur === 0) curStart = x;
        cur++;
        if (cur > bestLen) { bestLen = cur; bestStart = curStart; }
      } else cur = 0;
    }
    rowRuns.push({ y, start: bestStart, len: bestLen });
  }
  if (totalOrange < 30) return { tab: null, info: { reason: 'no-orange', totalOrange } };

  const minRun = Math.max(24, Math.round(W * 0.02));
  const maxRun = Math.round(W * 0.5);
  const lines = [];
  let cur = null;
  for (const r of rowRuns) {
    const ok = r.len >= minRun && r.len <= maxRun;
    if (ok && cur && r.y === cur.lastY + 1 && Math.abs(r.start + r.len / 2 - cur.cx) < cur.len) {
      cur.rows++; cur.lastY = r.y;
      if (r.len > cur.len) { cur.len = r.len; cur.start = r.start; cur.cx = r.start + r.len / 2; }
    } else if (ok) {
      cur = { top: r.y, lastY: r.y, rows: 1, len: r.len, start: r.start, cx: r.start + r.len / 2 };
      lines.push(cur);
    } else cur = null;
  }
  const line = lines.filter(l => l.rows >= 2).sort((a, b) => b.len - a.len || a.top - b.top)[0];

  let centerX, method, lineTop = null;
  if (line) {
    centerX = line.cx; method = 'underline'; lineTop = line.top;
  } else {
    // Dự phòng: cột có nhiều điểm cam nhất (cửa sổ ±60px)
    method = 'column-peak';
    const col = new Array(W).fill(0);
    for (let y = yStart; y < yEnd; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (ORANGE(rgba[i], rgba[i + 1], rgba[i + 2])) col[x]++;
    }
    let maxSum = 0; centerX = W / 2;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = Math.max(0, x - 60); k <= Math.min(W - 1, x + 60); k++) s += col[k];
      if (s > maxSum) { maxSum = s; centerX = x; }
    }
  }

  // ---- 2) nhãn tab phía trên gạch chân ----
  /** @type {'del'|'pick'|'ret'|null} */
  let tab = null;
  let how = 'thirds', groups = null;
  if (lineTop !== null) {
    const y1 = lineTop - 6;
    const y0 = Math.max(0, y1 - Math.max(20, Math.round(H * 0.03)));
    if (y1 > y0 && rows > y1) {
      const lumAt = i => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const hist = new Uint32Array(256);
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) hist[Math.min(255, lumAt(at(x, y)) | 0)]++;
      let acc = 0, bg = 255; const half = ((y1 - y0) * W) / 2;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= half) { bg = v; break; } }   // nền = độ sáng trung vị (đúng cả chế độ tối)

      const ink = new Uint8Array(W);
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const i = at(x, y);
        if (Math.abs(lumAt(i) - bg) > 45 && !ORANGE(rgba[i], rgba[i + 1], rgba[i + 2])) ink[x] = 1;
      }
      const xs = [];
      for (let x = 0; x < W; x++) if (ink[x]) xs.push(x);
      if (xs.length >= 20) {
        const gaps = [];
        for (let i = 0; i < xs.length - 1; i++) { const g = xs[i + 1] - xs[i] - 1; if (g > 0) gaps.push({ g, l: xs[i], r: xs[i + 1] }); }
        gaps.sort((a, b) => b.g - a.g);
        const [g1, g2, g3] = gaps;
        // 2 khoảng trống giữa các tab phải rõ ràng hơn hẳn khoảng giữa các từ trong 1 nhãn
        if (g1 && g2 && g2.g >= Math.max(10, W * 0.012) && (!g3 || g2.g >= g3.g * 1.5)) {
          const cuts = [g1, g2].sort((a, b) => a.l - b.l);
          const gs = [[xs[0], cuts[0].l], [cuts[0].r, cuts[1].l], [cuts[1].r, xs[xs.length - 1]]];
          if (gs.every(([a, b]) => b - a >= W * 0.03)) {                       // mỗi nhãn đủ rộng
            const dist = gs.map(([a, b]) => (centerX < a ? a - centerX : centerX > b ? centerX - b : 0));
            const idx = dist.indexOf(Math.min(...dist));
            if (dist[idx] <= W * 0.04) { tab = TABS[idx]; how = 'labels'; groups = gs; }
          }
        }
      }
    }
  }

  // ---- 3) dự phòng: chia 3 phần đều nhau ----
  if (!tab) {
    const rel = centerX / W;
    tab = rel < 0.33 ? 'del' : rel < 0.66 ? 'pick' : 'ret';
  }
  return { tab, info: { centerX: Math.round(centerX), relPct: +(centerX / W * 100).toFixed(1), method, how, groups, lineTop, totalOrange } };
}

// ==================== DOM: nạp ảnh → điểm ảnh → detectTabFromPixels ====================
export function detectActiveTabByOrangeLine(imageSource) {
  if (typeof window !== 'undefined') window.__spxLastTabDetect = null;

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = img.width, H = img.height;
        const rows = Math.max(1, Math.floor(H * 0.35));
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, W, rows).data;
        canvas.width = canvas.height = 0;                      // trả bộ nhớ canvas ngay

        const { tab, info } = detectTabFromPixels(data, W, rows, H);
        if (typeof window !== 'undefined') window.__spxLastTabDetect = { imgW: W, imgH: H, tab, ...info };
        resolve(tab);
      } catch (e) {
        console.warn('[OCR] detectActiveTab error:', e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageSource;
  });
}
