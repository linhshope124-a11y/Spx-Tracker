// =============================================================
// OCR · processor.js
// Điều phối OCR: xử lý 1 ảnh (nhiều lượt) → cả lô → tự lưu/đưa vào lô cần xem; điểm vào cho ảnh chọn từ máy/chia sẻ.
// =============================================================

import { state } from '../state.js';
import { getTodayIso, formatDateDisplay, generateId, isValidIsoDate } from '../utils.js';
import { WEIGHT_SUFFIXES } from '../config.js';
import { showToast, isAutoSaveOCR } from '../ui.js';
import { updateAllViews } from '../render.js';
import { cacheGetAsync, cacheSet, clearOcrCache as _clearOcrCacheImpl, saveOcrLog } from '../ocr-cache.js';
import { abortCurrentOcr, checkAborted, clearAbortController, newAbortController } from './abort.js';
import { appendBatchResults, clearActiveBatchItem, findExactDuplicate, openBatchOcrModal, setBatchResults } from './batch.js';
import { detectActiveTabByOrangeLine } from './detect.js';
import { ocrRecognize, resetTesseractWorker } from './worker.js';
import { fillModalFromResult } from './form.js';
import { hashBlob, makeThumbnail, preprocessImage, readFileAsDataURL } from './preprocess.js';
import { buildWeights, extractDate, extractDateStrict, getTypeFromResult, getTypeLabel, parseOcrText, postProcessFixDigits, validateDistribution } from './parser.js';
import { ensureCancelButton, resetOcrProgress, showSummaryToast, updateOcrProgress } from './progress.js';

// ==================== CONFIG ====================
const DISABLE_AUTO_SAVE = false;

const DRY_RUN_OCR       = false;

/** Hủy lượt OCR đang chạy. @returns {boolean} có lượt đang chạy hay không */
export function cancelOcr() {
  if (!abortCurrentOcr()) return false;
  // abort chỉ dừng phần "chờ" — job Tesseract đang chạy vẫn tiếp tục ngốn CPU và chặn hàng đợi
  // của lần quét sau. Terminate worker để dừng hẳn (lần sau sẽ tự tạo lại, tài nguyên đã cache).
  resetTesseractWorker().catch(() => {});
  return true;
}

let pendingAppend = false;

// ==================== AUTO-SAVE ====================
async function tryAutoSave(r) {
  if (DISABLE_AUTO_SAVE) return false;
  if (!isAutoSaveOCR()) return false;
  if (String(r.mode || '').includes('+fix')) return false;

  const type = getTypeFromResult(r);
  if (!type) return false;

  const confs = Object.values(r.confidences).filter(c => c != null);
  if (confs.length === 0) return false;
  const allHigh = confs.every(c => c >= 85);
  if (!allHigh) return false;

  // Chỉ tự lưu khi đã ĐỐI CHIẾU được: đọc được Tổng và khớp, thấy tab, thấy ngày
  if (r.expectedTotal === null || r.expectedTotal !== r.totalFound) return false;
  if (r.tabDetected !== true || r.dateFound !== true) return false;
  if (r.totalFound <= 0) return false;
  // Ngày OCR đọc ra phải là ngày thật và không ở tương lai (nếu không → để người dùng xem lại)
  if (!isValidIsoDate(r.parsedDate) || r.parsedDate > getTodayIso()) return false;

  const dist = validateDistribution(r.weights);
  if (!dist.ok) return false;

  if (DRY_RUN_OCR) return false;

  const weights = buildWeights(r);
  const newId = generateId();

  state.appData[type].unshift({ id: newId, date: r.parsedDate, weights });
  updateAllViews();
  return true;
}

// ==================== XÓA CACHE OCR ====================
export async function clearOcrCache() {
  return _clearOcrCacheImpl();
}

// ==================== PIPELINE ====================
async function _runOcrFromFiles(files, wasAppend = false) {
  if (!files || files.length === 0) return;

  const ctrl = newAbortController();
  const signal = ctrl.signal;

  const overlay = document.getElementById('ocrLoadingOverlay');
  const statusTitle = document.getElementById('ocrStatusTitle');
  const statusDesc  = document.getElementById('ocrStatusDesc');

  if (overlay) overlay.style.display = 'flex';
  ensureCancelButton(cancelOcr);
  resetOcrProgress();

  try {
    const results = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
      checkAborted(signal);
      if (statusTitle) statusTitle.innerText = `Ảnh ${i + 1}/${totalFiles}`;
      if (statusDesc)  statusDesc.innerText  = 'Đang xử lý...';

      // Progress: đóng góp 0-80% cho OCR từng ảnh (20% cuối để lưu/validate)
      const basePct   = (i / totalFiles) * 80;
      const stepPct   = (1 / totalFiles) * 80;
      updateOcrProgress(basePct, `Ảnh ${i + 1}/${totalFiles}`);

      // Một ảnh lỗi (không giải mã được, OCR lỗi...) KHÔNG được làm hỏng cả lô:
      // ghi nhận lỗi cho ảnh đó rồi xử lý tiếp các ảnh còn lại. Chỉ riêng "hủy" mới dừng toàn bộ.
      let item;
      try {
        item = await processOneFile(files[i], signal, (passPct) => {
          // passPct 0..100 trong ảnh hiện tại
          updateOcrProgress(basePct + (passPct / 100) * stepPct, `Ảnh ${i + 1}/${totalFiles}`);
        });
      } catch (err) {
        if (err && err.message === 'OCR_CANCELLED') throw err;
        console.warn('[OCR] Lỗi ở ảnh', files[i]?.name, err);
        item = {
          file: files[i]?.name || `ảnh ${i + 1}`,
          thumbnail: '',
          result: null,
          error: (err && err.message) || 'Lỗi không xác định'
        };
      }
      results.push(item);
    }

    // Bước validate/lưu chiếm 80-100%
    updateOcrProgress(85, 'Đang kiểm tra...');

    if (overlay) overlay.style.display = 'none';
    resetOcrProgress();

    const autoSaved     = [];
    const duplicates    = [];
    const needAttention = [];

    for (const item of results) {
      if (item.error) { needAttention.push(item); continue; }
      const r = item.result;

      if (findExactDuplicate(r)) {
        duplicates.push(item);
        continue;
      }

      if (await tryAutoSave(r)) {
        autoSaved.push(item);
      } else {
        needAttention.push(item);
      }
    }

    const summary = {
      saved: autoSaved.length,
      dup:   duplicates.length,
      need:  needAttention.length
    };

    if (needAttention.length > 0) {
      if (wasAppend) {
        appendBatchResults(needAttention);
        openBatchOcrModal(summary);
        showSummaryToast(autoSaved.length, duplicates.length, needAttention.length);
        return;
      }

      if (files.length === 1) {
        const item = needAttention[0];
        if (item.error) {
          showToast('Không đọc được ảnh: ' + item.error, 'error', 3000);
          return;
        }
        fillModalFromResult(item);
        return;
      }

      setBatchResults(needAttention);
      clearActiveBatchItem();
      openBatchOcrModal(summary);
      showSummaryToast(autoSaved.length, duplicates.length, needAttention.length, 400);
      return;
    }

    if (files.length === 1) {
      const item = results[0];
      const r = item.result;

      if (duplicates.length === 1) {
        showToast(
          `Ảnh đã tồn tại — ${getTypeLabel(r)} ${formatDateDisplay(r.parsedDate)}: ${r.totalFound} đơn`,
          'warning', 2500
        );
        return;
      }

      if (autoSaved.length === 1) {
        showToast(
          `Đã tự động lưu ${getTypeLabel(r)} ${formatDateDisplay(r.parsedDate)}: ${r.totalFound} đơn`,
          'success', 2500
        );
      }
      return;
    }

    import('../ads.js').then(m => m.showInterstitial()).catch(() => {});

    if (autoSaved.length > 0 || duplicates.length > 0) {
      showSummaryToast(autoSaved.length, duplicates.length, 0);
    }
  } catch (err) {
    if (overlay) overlay.style.display = 'none';
    resetOcrProgress();

    if (err.message === 'OCR_CANCELLED') {
      showToast('Đã hủy OCR', 'warning', 2000);
      return;
    }

    console.error('[OCR] Pipeline error:', err);
    showToast('Lỗi khi quét ảnh: ' + err.message, 'error', 3000);
  } finally {
    clearAbortController(ctrl);
  }
}
// =============================================================
// OCR ENGINE — PART 3/3
// _processOneFileInternal (đổi tên từ processOneFile cũ) · Wrapper log · Entry points
// =============================================================

// ==================== PROCESS ONE FILE — 6-PASS SMART PIPELINE ====================
async function _processOneFileInternal(file, signal, onProgress) {
  checkAborted(signal);

  const hash = await hashBlob(file);
  const cached = await cacheGetAsync(hash);

  if (cached) {
    checkAborted(signal);
    if (onProgress) onProgress(100);
    const rawDataUrl = await readFileAsDataURL(file);
    const cachedResult = { ...cached.result, fullDataUrl: rawDataUrl };
    return {
      file: file.name,
      thumbnail: cached.thumbnail,
      result: cachedResult,
      error: null,
      fromCache: true
    };
  }

  checkAborted(signal);
  const rawDataUrl = await readFileAsDataURL(file);

  checkAborted(signal);
  const thumbnail = await makeThumbnail(rawDataUrl, 96);

  checkAborted(signal);
  const detectedType = await detectActiveTabByOrangeLine(rawDataUrl);

  checkAborted(signal);
  const statusDesc = document.getElementById('ocrStatusDesc');

  let bestResult = null;
  let bestText = '';
  let bestDiff = 9999;
  let knownTotal = null;   // 'Tổng' đọc được ở BẤT KỲ lần quét nào
  let passCount = 0;
  const TOTAL_PASSES = 6;

  function _reportProgress() {
    if (onProgress) onProgress(Math.min(100, Math.round((passCount / TOTAL_PASSES) * 100)));
  }

  async function runPass(label, opt) {
    checkAborted(signal);
    if (statusDesc) statusDesc.innerText = `Quét ${label}...`;
    const pre = await preprocessImage(rawDataUrl, opt, signal);
    checkAborted(signal);
    const text = await ocrRecognize(pre.dataUrl, signal);
    const parsed = parseOcrText(text);
    if (parsed.expectedTotal === null && knownTotal !== null) parsed.expectedTotal = knownTotal;
    if (parsed.expectedTotal !== null && knownTotal === null) knownTotal = parsed.expectedTotal;
    // Kết quả tốt nhất trước đó chưa có "Tổng" để đối chiếu → chấm lại với Tổng vừa đọc được
    if (bestResult && bestResult.expectedTotal === null && knownTotal !== null) {
      bestResult.expectedTotal = knownTotal;
      bestDiff = Math.abs(bestResult.totalFound - knownTotal);
    }
    const diff = parsed.expectedTotal !== null
      ? Math.abs(parsed.totalFound - parsed.expectedTotal)
      : 9999;
    if (!bestResult || diff < bestDiff) {
      bestResult = parsed;
      bestText = text;
      bestDiff = diff;
    }
    passCount++;
    _reportProgress();
    return diff;
  }

  // Còn nên quét thêm không?
  //  - Đã khớp tổng (diff 0) → thôi.
  //  - Chưa đọc được "Tổng" ở lượt nào (diff 9999) → thử thêm tối đa 3 lượt (một cách tiền xử lý khác
  //    có thể đọc được), không quét đủ 6 lượt với ảnh không phải màn hình SPX.
  function _shouldRunMore() {
    if (bestDiff === 0) return false;
    if (bestDiff === 9999) return passCount < 3;
    return true;
  }

  // Pass 1: Otsu @ 2.0 — baseline
  await runPass('1/6', { upscale: 2.0, useOtsu: true });

  // Pass 2: Threshold 70 @ 2.0 — giữ nét đuôi 9
  if (_shouldRunMore()) {
    await runPass('2/6', { upscale: 2.0, useOtsu: false, threshold: 70 });
  }

  // Pass 3: RAW @ 2.0
  if (_shouldRunMore()) {
    await runPass('3/6', { upscale: 2.0, raw: true });
  }

  // Pass 4: RAW @ 1.5 — scale diversity
  if (_shouldRunMore()) {
    await runPass('4/6', { upscale: 1.5, raw: true });
  }

  // Pass 5: Otsu @ 2.25 — scale diversity
  if (_shouldRunMore()) {
    await runPass('5/6', { upscale: 2.25, useOtsu: true });
  }

  // Pass 6: Otsu @ 1.75 — scale diversity
  if (_shouldRunMore()) {
    await runPass('6/6', { upscale: 1.75, useOtsu: true });
  }

  // Post-process: đoán chữ số nếu vẫn lệch
  if (bestResult && bestDiff > 0) {
    const fixed = postProcessFixDigits(bestResult);
    if (fixed) { bestResult = fixed; bestDiff = 0; }
  }

  // Fallback nếu không pass nào chạy
  if (!bestResult) {
    const pre = await preprocessImage(rawDataUrl, { upscale: 2.0, useOtsu: true }, signal);
    const text = await ocrRecognize(pre.dataUrl, signal);
    bestResult = parseOcrText(text);
    bestText = text;
  }

  // Báo 100% sau khi xong hoàn toàn (kể cả fix)
  if (onProgress) onProgress(100);

  const result = {
    detectedColorType: detectedType || 'del',
    tabDetected: !!detectedType,                       // false → 'del' chỉ là mặc định
    dateFound: extractDateStrict(bestText) !== null,   // false → ngày chỉ là 'hôm nay' mặc định
    parsedDate: extractDate(bestText),
    weights: bestResult.weights,
    confidences: bestResult.confidences,
    expectedTotal: bestResult.expectedTotal,
    totalFound: bestResult.totalFound,
    mode: bestResult.mode,
    rawText: bestText,
    fullDataUrl: rawDataUrl,
    fixInfo: bestResult.fixInfo || null
  };

  // Chỉ cache kết quả đã đối chiếu được. Kết quả lệch/đoán mà cache thì quét lại ảnh đó
  // sẽ luôn ra đúng bản sai cũ (và ngày "hôm nay" mặc định bị đóng băng).
  const verified = !result.fixInfo
    && result.expectedTotal !== null
    && result.totalFound === result.expectedTotal
    && result.tabDetected && result.dateFound;
  if (verified) {
    cacheSet(hash, {
      thumbnail,
      result: { ...result, fullDataUrl: '' }
    });
  }

  return { file: file.name, thumbnail, result, error: null };
}

// ==================== WRAPPER: GHI LOG CHẨN ĐOÁN ====================
/**
 * Wrapper quanh _processOneFileInternal — CHỈ để ghi log chẩn đoán vào IndexedDB (store 'logs').
 *
 * - Cache hit → log success=true, mode có suffix "[cache]"
 * - Pipeline bình thường → log success=true
 * - Lỗi (throw) → log success=false + message, rồi NÉM LẠI để _runOcrFromFiles bắt như cũ
 *
 * saveOcrLog() không bao giờ throw (đã có try/catch nội bộ), nên wrapper không làm hỏng pipeline.
 */
async function processOneFile(file, signal, onProgress) {
  try {
    const out = await _processOneFileInternal(file, signal, onProgress);
    const r = out.result;

    const ranges = WEIGHT_SUFFIXES.map(k => Number(r?.weights?.[k]) || 0);
    const conf   = WEIGHT_SUFFIXES.map(k => {
      const v = r?.confidences?.[k];
      return typeof v === 'number' ? v : 0;
    });

    const baseMode = String(r?.mode || '');
    const mode = out.fromCache
      ? (baseMode ? baseMode + ' [cache]' : '[cache]')
      : baseMode;

    const sum   = Number(r?.totalFound) || 0;
    const total = Number.isFinite(r?.expectedTotal) ? r.expectedTotal : 0;
    const diff  = total !== 0 ? (sum - total) : 0;

    await saveOcrLog({
      file: out.file,
      tab: r?.detectedColorType,
      date: r?.parsedDate,
      mode,
      sum,
      total,
      diff,
      ranges,
      conf,
      rawText: r?.rawText || '',
      success: true
    });

    return out;
  } catch (err) {
    await saveOcrLog({
      file: (file && file.name) || String(file || ''),
      success: false,
      rawText: (err && err.message) || 'Unknown error'
    });
    throw err;
  }
}

// ==================== ENTRY: APPEND BATCH FILES ====================
export function appendBatchFiles() {
  pendingAppend = true;
  document.getElementById('ocrFileInput').click();
}

// ==================== ENTRY: INPUT FILE ====================
export async function handleOcrImage(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (files.length === 0) { pendingAppend = false; return; }

  const wasAppend = pendingAppend;
  pendingAppend = false;

  await _runOcrFromFiles(files, wasAppend);
}

// ==================== ENTRY: SHARE TARGET ====================
export async function handleSharedImage(sharedFiles) {
  const arr = Array.from(sharedFiles || []);
  if (arr.length === 0) {
    showToast('Không nhận được ảnh từ chia sẻ', 'warning', 2500);
    return;
  }

  const images = arr.filter(f => f && f.type && f.type.startsWith('image/'));
  const skipped = arr.length - images.length;

  if (images.length === 0) {
    showToast(
      skipped > 0 ? 'Chia sẻ không chứa ảnh — bỏ qua' : 'Không có file hợp lệ',
      'error', 3000
    );
    return;
  }

  if (skipped > 0) {
    showToast(`Bỏ qua ${skipped} mục không phải ảnh`, 'warning', 2000);
  }

  await _runOcrFromFiles(images, false);
}