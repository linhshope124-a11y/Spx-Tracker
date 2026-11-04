// =============================================================
// OCR — cổng vào duy nhất. main.js / entry.js chỉ import từ './ocr/index.js'.
//
// Chiều phụ thuộc (không có vòng — tests/repo.test.mjs kiểm tra):
//   abort ← worker, preprocess ← parser ← progress ← form ← batch ← processor
// =============================================================

export { getOcrCacheStats, initOcrCache, refreshOcrCacheStats } from '../ocr-cache.js';
export { cancelOcr, clearOcrCache, appendBatchFiles, handleOcrImage, handleSharedImage } from './processor.js';
export { preloadTesseractWorker } from './worker.js';
export { copyOcrLog } from './progress.js';
export { fillModalFromResult, openCompareModal, applyConfidenceHighlight, openOcrLightbox, closeOcrLightbox } from './form.js';
export { openBatchOcrModal, closeBatchOcrModal, completeActiveBatchItem, removeBatchItem, importBatchItem, backToBatch, showBackToBatchBtn, hasBatchPending, saveBatchAll } from './batch.js';
