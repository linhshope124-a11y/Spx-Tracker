// =============================================================
// OCR · preprocess.js
// Tiền xử lý ảnh: đọc file, thumbnail, phóng to + Otsu, hash nội dung.
// =============================================================

import { MAX_CANVAS_PX } from '../config.js';
import { checkAborted } from './abort.js';

// ==================== HELPERS ====================
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Không đọc được file'));
    r.readAsDataURL(file);
  });
}

export function makeThumbnail(dataUrl, maxW = 96) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale  = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      } catch { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

// ==================== OTSU ====================
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, wF = 0;
  let maxVar = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
  }
  return threshold;
}

// ==================== PREPROCESSING ====================
export async function preprocessImage(rawDataUrl, options = {}, signal) {
  checkAborted(signal);
  const { upscale = 2.0, useOtsu = true, threshold = 145, raw = false } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        checkAborted(signal);
        // Giới hạn diện tích canvas (iOS Safari ~16.7M px; vượt là canvas rỗng/crash) khi ảnh gốc lớn
        let scale = Math.min(4, upscale);
        const srcPx = img.width * img.height;
        if (srcPx * scale * scale > MAX_CANVAS_PX) scale = Math.sqrt(MAX_CANVAS_PX / srcPx);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.floor(img.width  * scale);
        canvas.height = Math.floor(img.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        if (raw) {
          for (let i = 0; i < data.length; i += 4) {
            const g = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
            data[i] = data[i+1] = data[i+2] = g;
          }
        } else {
          const gray = new Uint8Array(data.length / 4);
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
          }
          const th = useOtsu ? otsuThreshold(gray) : threshold;
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const val = gray[j] > th ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = val;
            data[i+3] = 255;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const out = { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
        canvas.width = canvas.height = 0;   // trả bộ nhớ canvas ngay (Safari giữ lại nếu không reset)
        resolve(out);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = rawDataUrl;
  });
}

export const EMPTY_THUMB = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHJlY3Qgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0iI2U1ZTdlYiIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNlNWU3ZWIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==';

// ==================== HASH BLOB ====================
export async function hashBlob(file) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return 'fb_' + file.size + '_' + (file.name || '').length + '_' + (file.lastModified || 0);
  }
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'fb_' + Date.now().toString(16) + '_' + file.size + '_' + (file.name || '').length;
  }
}
