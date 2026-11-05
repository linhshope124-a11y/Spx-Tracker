// =============================================================
// OCR · abort.js
// Điều khiển hủy OCR (AbortController) — tầng thấp nhất, mọi module OCR khác đều có thể dùng.
// =============================================================

let _ocrAbortController = null;

export function newAbortController() {
  _ocrAbortController = new AbortController();
  return _ocrAbortController;
}

export function checkAborted(signal) {
  if (signal && signal.aborted) throw new Error('OCR_CANCELLED');
}

export function clearAbortController(ctrl) {
  if (_ocrAbortController === ctrl) _ocrAbortController = null;
}

/** Ngắt lượt OCR đang chạy (nếu có). @returns {boolean} có lượt đang chạy hay không */
export function abortCurrentOcr() {
  if (!_ocrAbortController) return false;
  _ocrAbortController.abort();
  _ocrAbortController = null;
  return true;
}
