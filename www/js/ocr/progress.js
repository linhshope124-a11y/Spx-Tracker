// =============================================================
// OCR · progress.js
// Thanh tiến trình + nút Hủy + toast tổng kết + log OCR (Copy log).
// =============================================================

import { showToast } from '../ui.js';

// ==================== LOG STORAGE ====================
let _lastOcrLog = '';

export function getLastOcrLog() { return _lastOcrLog; }
export function setLastOcrLog(v) { _lastOcrLog = v; }

// ==================== PROGRESS BAR ====================
/**
 * Cập nhật progress bar trong OCR overlay.
 * @param {number} pct - 0..100
 * @param {string} [label] - text hiển thị bên dưới bar (VD: "Ảnh 2/5")
 */
export function updateOcrProgress(pct, label) {
  const fill = document.getElementById('ocrProgressFill');
  const text = document.getElementById('ocrProgressText');
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (fill) fill.style.width = clamped + '%';
  if (text) text.innerText = label ? `${clamped}% · ${label}` : clamped + '%';
}

export function resetOcrProgress() {
  updateOcrProgress(0, '');
}

// ==================== COPY LOG ====================
export async function copyOcrLog() {
  const debugEl = document.getElementById('ocrDebugText');
  let text = (debugEl && debugEl.innerText) ? debugEl.innerText.trim() : '';
  if (!text) text = (_lastOcrLog || '').trim();

  if (!text) {
    showToast('Không có log để copy', 'warning', 1500);
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Đã copy log (' + text.length + ' ký tự)', 'success', 1800);
      return;
    }
  } catch (e) {
    console.warn('[OCR] Clipboard API fail:', e);
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) {
      showToast('Đã copy log (' + text.length + ' ký tự)', 'success', 1800);
    } else {
      showToast('Không copy được — thử giữ tay vào log', 'error', 2500);
    }
  } catch (e) {
    showToast('Không copy được: ' + e.message, 'error', 2500);
  }
}

export function injectCopyLogButton() {
  const toggleBtn = document.getElementById('ocrDebugToggle');
  if (!toggleBtn) return;

  const old = document.getElementById('ocrCopyLogBtn');
  if (old) old.remove();

  const copyBtn = document.createElement('button');
  copyBtn.id = 'ocrCopyLogBtn';
  copyBtn.type = 'button';
  copyBtn.innerText = '📋 Copy log';
  copyBtn.style.cssText = `
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-weight: 600;
    margin-left: 6px;
  `;
  copyBtn.onclick = () => copyOcrLog();

  toggleBtn.parentNode.appendChild(copyBtn);
}

// ==================== CANCEL BUTTON ====================
export function ensureCancelButton(onCancel) {
  const overlay = document.getElementById('ocrLoadingOverlay');
  if (!overlay) return;

  if (overlay.querySelector('.ocr-cancel-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'ocr-cancel-btn';
  btn.innerText = '✕ Hủy';
  btn.style.cssText = `
    margin-top: 22px;
    padding: 10px 26px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    backdrop-filter: blur(4px);
  `;
  btn.onclick = () => { if (onCancel) onCancel(); };
  overlay.appendChild(btn);
}

// ==================== INTERNAL: showSummaryToast ====================
export function showSummaryToast(saved, dup, need, delay = 0) {
  const parts = [];
  if (saved > 0) parts.push(`✅ ${saved} tự lưu`);
  if (dup > 0)   parts.push(`⚠️ ${dup} trùng`);
  if (need > 0)  parts.push(`📝 ${need} cần xử lý`);
  if (parts.length === 0) return;

  const msg = parts.join(' · ');
  const type = need > 0 ? 'warning' : (dup > 0 ? 'warning' : 'success');
  setTimeout(() => showToast(msg, type, 3500), delay);
}
