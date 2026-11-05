// =============================================================
// OCR · form.js
// Điền form nhập từ kết quả OCR: tô độ tin cậy, banner cảnh báo, so sánh với bản ghi có sẵn, xem ảnh phóng to.
// =============================================================

import { state } from '../state.js';
import { formatDateDisplay, escapeHtml } from '../utils.js';
import { openAddModal, openEditModal, switchModalSubTab, showToast } from '../ui.js';
import { showAlert } from '../dialog.js';
import { getTypeFromResult, getTypeLabel, validateDistribution } from './parser.js';
import { getLastOcrLog, injectCopyLogButton, setLastOcrLog } from './progress.js';

// ==================== FIX WARNING BANNER ====================
function showFixWarning(fixInfo) {
  const old = document.getElementById('fixWarningBanner');
  if (old) old.remove();

  const labels = {
    '0_2':'>0 - 2 kg', '2_4':'>2 - 4 kg', '4_6':'>4 - 6 kg', '6_8':'>6 - 8 kg',
    '8_10':'>8 - 10 kg', '10_12':'>10 - 12 kg', '12_15':'>12 - 15 kg', 'over_15':'>15 kg'
  };
  const label = labels[fixInfo.key] || fixInfo.key;
  const dir = fixInfo.delta > 0 ? 'tăng' : 'giảm';
  const deltaAbs = Math.abs(fixInfo.delta);

  const isHeavy = fixInfo.isRisky;

  const banner = document.createElement('div');
  banner.id = 'fixWarningBanner';
  banner.style.cssText = `
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 2px solid ${isHeavy ? '#dc2626' : '#ea580c'};
    background: ${isHeavy ? '#fef2f2' : '#fff7ed'};
    color: ${isHeavy ? '#991b1b' : '#9a3412'};
    animation: fixPulse 1.4s ease-in-out 3;
  `;
  banner.innerHTML = `
    <div style="font-size:13.5px;font-weight:800;margin-bottom:6px;letter-spacing:-0.01em">
      ${isHeavy ? '🚨' : '⚠️'} App đã ĐOÁN LẠI SỐ
    </div>
    <div style="font-size:12.5px;line-height:1.55;font-weight:600">
      Dải <b>${label}</b>: OCR đọc <b>${fixInfo.oldVal}</b> → app tự sửa thành <b>${fixInfo.newVal}</b>
      (${dir} ${deltaAbs} đơn, ký tự ${fixInfo.from} → ${fixInfo.to})
    </div>
    <div style="font-size:11.5px;margin-top:8px;padding-top:8px;border-top:1px dashed ${isHeavy ? 'rgba(153,27,27,0.3)' : 'rgba(154,52,18,0.3)'};font-weight:700">
      👉 <b>BẮT BUỘC</b> đối chiếu ảnh gốc bên dưới trước khi Lưu
    </div>
  `;

  // Inject CSS animation (chỉ 1 lần)
  if (!document.getElementById('fixWarningStyle')) {
    const style = document.createElement('style');
    style.id = 'fixWarningStyle';
    style.textContent = `
      @keyframes fixPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
        50%      { transform: scale(1.015); box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  const tabs = document.getElementById('modalSubTabGroup');
  if (tabs && tabs.parentNode) {
    tabs.parentNode.insertBefore(banner, tabs);
  }
}

// ==================== FILL MODAL ====================
export function fillModalFromResult(item) {
  const r = item.result;
  state.lastOcrImageDataUrl = r.fullDataUrl || '';
  state.isOcrScan = true;

  const distCheck = validateDistribution(r.weights);

  const modeStr = r.mode ? `[mode: ${r.mode}]` : '';
  const sumStr = r.expectedTotal !== null
    ? `[Sum: ${r.totalFound} / Total: ${r.expectedTotal} — diff: ${Math.abs(r.expectedTotal - r.totalFound)}]`
    : `[Sum: ${r.totalFound} / Total: (không đọc được)]`;
  setLastOcrLog(`${modeStr}\n${sumStr}\n\n${r.rawText || '(không có text)'}`);

  const debugEl = document.getElementById('ocrDebugText');
  if (debugEl) {
    debugEl.innerText = getLastOcrLog();
    debugEl.style.display = 'none';
  }

  openAddModal();
  document.getElementById('inputDate').value = r.parsedDate;
  switchModalSubTab(r.detectedColorType);

  // ⭐ Hiện banner cảnh báo nếu post-process đã fix số
  if (r.fixInfo) {
    showFixWarning(r.fixInfo);
  }

  const prefix = r.detectedColorType === 'del' ? 'del_inp'
               : r.detectedColorType === 'pick' ? 'pick_inp'
               : 'ret_inp';
  Object.keys(r.weights).forEach(k => {
    const el = document.getElementById(prefix + '_' + k);
    if (el) el.value = r.weights[k];
  });

  applyConfidenceHighlight(r.confidences, r.detectedColorType);

  setTimeout(() => injectCopyLogButton(), 100);

  const typeText = getTypeLabel(r);
  let msg = `${typeText} ${formatDateDisplay(r.parsedDate)} · ${r.totalFound} đơn`;

  if (r.expectedTotal !== null && r.totalFound !== r.expectedTotal) {
    msg += ` · lệch ${Math.abs(r.expectedTotal - r.totalFound)}`;
  }

  let lowCount = 0, midCount = 0;
  Object.values(r.confidences).forEach(c => {
    if (c == null) return;
    if (c < 70) lowCount++;
    else if (c < 85) midCount++;
  });

  let toastType = 'success';
  if (lowCount > 0) { msg += ' · có dải đỏ'; toastType = 'error'; }
  else if (midCount > 0) { msg += ' · có dải vàng'; toastType = 'warning'; }
  if (!distCheck.ok) { msg += ' · ⚠️ phân bố bất thường'; toastType = 'error'; }

  // ⭐ Nếu post-process fix → cảnh báo mạnh
  if (r.fixInfo) {
    msg += ' · 🔧 app đã sửa số';
    toastType = 'error';
  }

  if (!distCheck.ok) {
    showDistributionWarning(distCheck, r.detectedColorType);
  }

  showToast(msg + ' — kiểm tra và lưu', toastType, 3500);
}

// ==================== DISTRIBUTION WARNING ====================
function showDistributionWarning(distCheck, detectedType) {
  const old = document.getElementById('distWarningBanner');
  if (old) old.remove();

  const prefix = detectedType === 'del' ? 'del_inp'
               : detectedType === 'pick' ? 'pick_inp' : 'ret_inp';

  const suffixMap = {
    '0_2':'0_2','2_4':'2_4','4_6':'4_6','6_8':'6_8',
    '8_10':'8_10','10_12':'10_12','12_15':'12_15','over_15':'over_15'
  };
  distCheck.suspectKeys.forEach(k => {
    const inp = document.getElementById(prefix + '_' + suffixMap[k]);
    if (!inp) return;
    inp.classList.add('conf-suspect');
  });

  const banner = document.createElement('div');
  banner.id = 'distWarningBanner';
  banner.className = 'dist-warning-banner';
  banner.innerHTML = `
    <div class="dist-warning-title">⚠️ Phân bố bất thường</div>
    <ul class="dist-warning-list">
      ${distCheck.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
    </ul>
    <div class="dist-warning-hint">Đối chiếu với ảnh gốc bên dưới trước khi lưu</div>
  `;

  const tabs = document.getElementById('modalSubTabGroup');
  if (tabs && tabs.parentNode) {
    tabs.parentNode.insertBefore(banner, tabs);
  }
}

// ==================== COMPARE ====================
function buildCompareText(ocrW, existingW) {
  const suffixToWeight = {
    '0_2':'w0_2','2_4':'w2_4','4_6':'w4_6','6_8':'w6_8',
    '8_10':'w8_10','10_12':'w10_12','12_15':'w12_15','over_15':'wover_15'
  };
  const labels = {
    '0_2':'>0-2kg','2_4':'>2-4','4_6':'>4-6','6_8':'>6-8',
    '8_10':'>8-10','10_12':'>10-12','12_15':'>12-15','over_15':'>15'
  };
  let diffs = [];
  let matches = 0;
  Object.keys(suffixToWeight).forEach(k => {
    const ocr = parseInt(ocrW[k], 10) || 0;
    const ex  = parseInt(existingW[suffixToWeight[k]], 10) || 0;
    if (ocr !== ex) diffs.push(`${labels[k]}: Đã lưu ${ex} ← OCR ${ocr}`);
    else if (ocr > 0 || ex > 0) matches++;
  });
  if (diffs.length === 0) return { text: `✅ Khớp hoàn toàn (${matches} dải)`, diffs: 0 };
  return {
    text: `⚠️ ${diffs.length} dải KHÁC BIỆT:\n\n${diffs.join('\n')}\n\n→ Xem ảnh gốc để đối chiếu.`,
    diffs: diffs.length
  };
}

export function openCompareModal(batchItem, existingRecord) {
  const r = batchItem.result;
  const type = getTypeFromResult(r);
  if (!type) {
    fillModalFromResult(batchItem);
    return;
  }

  openEditModal(type, existingRecord.id);

  setTimeout(() => {
    const previewBox = document.getElementById('ocrPreviewBox');
    const previewImg = document.getElementById('ocrPreviewImg');
    if (previewBox && previewImg && r.fullDataUrl) {
      previewImg.src = r.fullDataUrl;
      previewBox.style.display = 'block';
    }
    setTimeout(() => injectCopyLogButton(), 100);

    const cmp = buildCompareText(r.weights, existingRecord.weights);
    const dateStr = formatDateDisplay(r.parsedDate);
    let msg = `📊 SO SÁNH NGÀY ${dateStr}\n\n`;
    msg += `📁 Dữ liệu ĐÃ LƯU được hiển thị trong ô nhập.\n`;
    msg += `📷 Ảnh OCR được hiển thị bên dưới.\n\n`;
    msg += cmp.text;
    showAlert(msg, { title: 'So sánh dữ liệu', okText: 'Đóng' });
  }, 200);
}

// ==================== HIGHLIGHT ====================
export function applyConfidenceHighlight(confMap, detectedType) {
  const prefix = detectedType === 'del' ? 'del_inp'
               : detectedType === 'pick' ? 'pick_inp' : 'ret_inp';
  const keys = ['0_2','2_4','4_6','6_8','8_10','10_12','12_15','over_15'];
  keys.forEach(k => {
    const input = document.getElementById(prefix + '_' + k);
    if (!input) return;
    input.classList.remove('conf-high', 'conf-mid', 'conf-low');
    const parent = input.closest('.weight-input-item');
    if (parent) {
      const old = parent.querySelector('.conf-badge');
      if (old) old.remove();
    }
    if (confMap[k] == null) return;
    const conf = confMap[k];
    const level = conf >= 85 ? 'high' : conf >= 70 ? 'mid' : 'low';
    input.classList.add('conf-' + level);
    if (parent) {
      const badge = document.createElement('span');
      badge.className = 'conf-badge ' + level;
      badge.textContent = Math.round(conf) + '%';
      parent.appendChild(badge);
    }
  });
}

// ==================== LIGHTBOX ====================
export function openOcrLightbox() {
  const src = document.getElementById('ocrPreviewImg').src;
  if (!src) return;
  document.getElementById('ocrLightboxImg').src = src;
  document.getElementById('ocrLightbox').classList.add('active');
}

export function closeOcrLightbox() {
  document.getElementById('ocrLightbox').classList.remove('active');
}
