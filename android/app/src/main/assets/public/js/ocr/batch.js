// =============================================================
// OCR · batch.js
// Lô ảnh OCR: trạng thái, modal danh sách, nhập từng ảnh, lưu tất cả.
// =============================================================

import { state } from '../state.js';
import { WEIGHT_KEYS } from '../config.js';
import { getTodayIso, formatDateDisplay, generateId, isValidIsoDate, escapeHtml } from '../utils.js';
import { showToast } from '../ui.js';
import { updateAllViews } from '../render.js';
import { fillModalFromResult, openCompareModal } from './form.js';
import { EMPTY_THUMB } from './preprocess.js';
import { buildWeights, getTypeFromResult, validateDistribution } from './parser.js';

// ==================== BATCH STATE ====================
let batchResults = [];

export function getBatchResults() { return batchResults; }
export function setBatchResults(list) { batchResults = list; }
export function appendBatchResults(list) { batchResults.push(...list); }
// Gọi khi bắt đầu lô mới: form nhập hiện tại (nếu có) không còn thuộc ảnh nào trong lô
export function clearActiveBatchItem() { _activeBatchItem = null; }

export function findExactDuplicate(r) {
  const type = getTypeFromResult(r);
  if (!type) return null;
  const weights = buildWeights(r);
  return state.appData[type].find(rec =>
    rec.date === r.parsedDate &&
    WEIGHT_KEYS.every(k => (parseInt(rec.weights[k], 10) || 0) === (parseInt(weights[k], 10) || 0))
  ) || null;
}

// ==================== BATCH SUMMARY CHIPS ====================
/**
 * Điền 3 chip summary vào đầu batch modal.
 * @param {{ saved:number, dup:number, need:number }} summary
 */
function _renderBatchSummary(summary) {
  const wrap       = document.getElementById('batchSummary');
  const chipSaved  = document.getElementById('batchSummarySaved');
  const chipDup    = document.getElementById('batchSummaryDup');
  const chipNeed   = document.getElementById('batchSummaryNeed');
  const cntSaved   = document.getElementById('batchSummarySavedCount');
  const cntDup     = document.getElementById('batchSummaryDupCount');
  const cntNeed    = document.getElementById('batchSummaryNeedCount');

  if (!wrap) return;

  const s = summary || { saved: 0, dup: 0, need: 0 };

  if (cntSaved) cntSaved.innerText = String(s.saved);
  if (cntDup)   cntDup.innerText   = String(s.dup);
  if (cntNeed)  cntNeed.innerText  = String(s.need);

  if (chipSaved) chipSaved.style.display = s.saved > 0 ? '' : 'none';
  if (chipDup)   chipDup.style.display   = s.dup   > 0 ? '' : 'none';
  if (chipNeed)  chipNeed.style.display  = s.need  > 0 ? '' : 'none';

  const anyVisible = s.saved > 0 || s.dup > 0 || s.need > 0;
  wrap.style.display = anyVisible ? '' : 'none';
}

// ==================== BATCH MODAL ====================
export function openBatchOcrModal(summary) {
  _renderBatchSummary(summary);
  renderBatchList();
  document.getElementById('batchOcrModal').classList.add('active');
}

export function closeBatchOcrModal() {
  document.getElementById('batchOcrModal').classList.remove('active');
}

function renderBatchList() {
  const list = document.getElementById('batchList');
  list.innerHTML = '';
  document.getElementById('batchCount').innerText = String(batchResults.length);

  if (batchResults.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">Không có ảnh nào.</div>';
    return;
  }

  const typeMap = {
    del:  ['Giao', 'tag-delivery'],
    pick: ['Lấy',  'tag-pickup'],
    ret:  ['Hoàn', 'tag-return']
  };

  batchResults.forEach((item, idx) => {
    const div = document.createElement('div');
    if (item.error) {
      div.className = 'batch-item error';
      div.innerHTML = `
        <div class="batch-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">⚠️</div>
        <div class="batch-info">
          <div class="batch-title">${escapeHtml(item.file)}</div>
          <div class="batch-meta" style="color:var(--danger)">Lỗi: ${escapeHtml(item.error)}</div>
        </div>
        <div class="batch-actions">
          <button class="batch-btn batch-btn-remove" onclick="removeBatchItem(${idx})">Bỏ</button>
        </div>`;
    } else {
      const r = item.result;
      const [typeLabel, typeClass] = typeMap[r.detectedColorType] || ['?', 'tag-delivery'];
      let lowCount = 0, midCount = 0;
      Object.values(r.confidences).forEach(c => {
        if (c == null) return;
        if (c < 70) lowCount++;
        else if (c < 85) midCount++;
      });
      const distCheck = validateDistribution(r.weights);
      const confIcon  = lowCount > 0 ? ' 🔴' : midCount > 0 ? ' 🟡' : ' 🟢';
      const warnIcon  = (r.expectedTotal !== null && r.totalFound !== r.expectedTotal) ? ' ⚠️' : '';
      const distIcon  = !distCheck.ok ? ' 🟠' : '';
      const fixIcon   = r.fixInfo ? (r.fixInfo.isRisky ? ' 🚨' : ' 🔧') : '';
      const cacheIcon = item.fromCache ? ' ⚡' : '';
      const type = getTypeFromResult(r);
      const existing = type ? state.appData[type].find(rec => rec.date === r.parsedDate) : null;
      const actionBtn = existing
        ? `<button class="batch-btn batch-btn-compare" onclick="importBatchItem(${idx})">🔍 So sánh</button>`
        : `<button class="batch-btn batch-btn-import" onclick="importBatchItem(${idx})">📝 Nhập</button>`;
      const existingBadge = existing
        ? ` <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--warning-bg);border:1px solid var(--warning-bd);color:var(--warning);font-weight:700">Đã có</span>`
        : '';
      const thumbSrc = item.thumbnail || EMPTY_THUMB;
      div.className = 'batch-item';
      div.innerHTML = `
        <img class="batch-thumb" src="${thumbSrc}" alt="">
        <div class="batch-info">
          <div class="batch-title">
            <span class="hist-badge-tag ${typeClass}">${typeLabel}</span>
            <span>${formatDateDisplay(r.parsedDate)}${confIcon}${warnIcon}${distIcon}${fixIcon}${cacheIcon}${existingBadge}</span>
          </div>
          <div class="batch-meta">${escapeHtml(item.file)}</div>
          <div class="batch-total">${r.totalFound} đơn</div>
        </div>
        <div class="batch-actions">
          ${actionBtn}
          <button class="batch-btn batch-btn-remove" onclick="removeBatchItem(${idx})">Bỏ</button>
        </div>`;
    }
    list.appendChild(div);
  });
}

// Ảnh trong batch đang được mở ở form nhập/sửa (null = form không mở từ batch)
let _activeBatchItem = null;

// Form nhập đóng (X hoặc lưu xong) → hủy liên kết, để lần nhập tay sau không bị tính là "từ batch"
window.addEventListener('spx:entry-closed', () => { _activeBatchItem = null; });

/**
 * Gọi khi LƯU THÀNH CÔNG từ form đang mở bởi 1 ảnh batch: bỏ ảnh đó khỏi batch.
 * @returns {boolean} true nếu form này đang mở từ batch
 */
export function completeActiveBatchItem() {
  if (!_activeBatchItem) return false;
  const idx = batchResults.indexOf(_activeBatchItem);
  if (idx !== -1) batchResults.splice(idx, 1);
  _activeBatchItem = null;
  showBackToBatchBtn(false);
  return true;
}

export function removeBatchItem(idx) {
  if (batchResults[idx] && batchResults[idx] === _activeBatchItem) _activeBatchItem = null;
  batchResults.splice(idx, 1);
  if (batchResults.length === 0) { closeBatchOcrModal(); return; }
  renderBatchList();
}

export function importBatchItem(idx) {
  const item = batchResults[idx];
  if (!item || item.error) return;
  const r = item.result;
  const type = getTypeFromResult(r);
  const existing = type ? state.appData[type].find(rec => rec.date === r.parsedDate) : null;
  closeBatchOcrModal();
  if (existing) openCompareModal(item, existing);
  else fillModalFromResult(item);
  _activeBatchItem = item;   // gán SAU khi mở form (mở form không phát sự kiện đóng)
  showBackToBatchBtn(true);
}

export function backToBatch() {
  if (batchResults.length === 0) {
    showToast('Batch đã trống', 'warning');
    showBackToBatchBtn(false);
    return;
  }
  _activeBatchItem = null;
  const entryModal = document.getElementById('entryModal');
  if (entryModal) entryModal.classList.remove('active');
  showBackToBatchBtn(false);
  openBatchOcrModal();
}

export function showBackToBatchBtn(show) {
  const btn = document.getElementById('backToBatchBtn');
  if (btn) btn.style.display = show ? 'inline-flex' : 'none';
}

export function hasBatchPending() { return batchResults.length > 0; }

// ==================== SAVE BATCH ====================
/**
 * Lưu tất cả ảnh "an toàn". Ảnh cần người xem (ngày sai, phân bố lạ, cùng ngày nhưng khác số,
 * ảnh lỗi) được GIỮ LẠI trong batch — không bị xóa im lặng như trước.
 */
export async function saveBatchAll() {
  const valid = batchResults.filter(r => !r.error);
  if (valid.length === 0) { showToast('Không có dữ liệu hợp lệ', 'error'); return; }

  const today = getTodayIso();
  const sigOf = (type, date, w) => type + '|' + date + '|' + WEIGHT_KEYS.map(k => parseInt(w[k], 10) || 0).join('_');

  const seen = new Set();             // chữ ký đã lưu trong lượt này
  const toSave = [];                  // { item, type, weights }
  const dropped = new Set();          // ảnh trùng HOÀN TOÀN → bỏ khỏi batch
  let dupCount = 0;
  let reviewCount = 0;

  for (const item of valid) {
    const r = item.result;
    const type = getTypeFromResult(r);

    // Ngày phải là ngày thật, không ở tương lai — nếu không sanitizeRecords sẽ xóa khi tải lại
    if (!type || !isValidIsoDate(r.parsedDate) || r.parsedDate > today) { reviewCount++; continue; }

    const weights = buildWeights(r);
    const sig = sigOf(type, r.parsedDate, weights);

    // Trùng hoàn toàn (cùng ngày + cùng số) với bản đã có / ảnh đã xử lý → bỏ
    if (seen.has(sig) || state.appData[type].some(rec => sigOf(type, rec.date, rec.weights) === sig)) {
      dropped.add(item); dupCount++; continue;
    }

    // Cùng loại + cùng ngày nhưng KHÁC số → giữ lại để người dùng bấm "So sánh"
    const sameDayExisting = state.appData[type].some(rec => rec.date === r.parsedDate);
    const sameDayInBatch  = toSave.some(x => x.type === type && x.item.result.parsedDate === r.parsedDate);
    if (sameDayExisting || sameDayInBatch) { reviewCount++; continue; }

    if (!validateDistribution(r.weights).ok) { reviewCount++; continue; }

    seen.add(sig);
    toSave.push({ item, type, weights });
  }

  if (toSave.length === 0 && dropped.size === 0) {
    showToast(
      reviewCount > 0 ? `Không có ảnh nào tự lưu được — ${reviewCount} ảnh cần xem lại` : 'Không có gì để lưu',
      'warning', 3000
    );
    return;
  }

  toSave.forEach(({ item, type, weights }) => {
    state.appData[type].unshift({ id: generateId(), date: item.result.parsedDate, weights });
  });

  const done = new Set(toSave.map(x => x.item));
  batchResults = batchResults.filter(it => !done.has(it) && !dropped.has(it));
  updateAllViews();

  let doneMsg = `Đã lưu ${toSave.length} bản ghi`;
  if (dupCount > 0) doneMsg += ` · bỏ ${dupCount} ảnh trùng`;

  if (batchResults.length === 0) {
    showBackToBatchBtn(false);
    closeBatchOcrModal();
    showToast(doneMsg, 'success', 3000);
  } else {
    renderBatchList();
    showToast(doneMsg + ` · còn ${batchResults.length} ảnh cần xem`, 'warning', 3500);
  }
}
