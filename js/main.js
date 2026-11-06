import { state, loadState, persistSettings, getSalaryConfig, setSalaryConfig } from './state.js';
import { initTheme, toggleTheme } from './theme.js';
import {
  switchMainTab, switchModalSubTab, setHistFilter,
  setRankTier, initRankUI,
  initRegionUI,
  setPeriodMode, periodPrev, periodNext, openPeriodPicker,
  jumpToMonth, jumpToDate, goToLatest, updatePeriodBarUI,
  syncRankUIForCurrentMonth,
  openAddModal, openEditModal, closeModal,
  openMenuModal, closeMenuModal,
  openHistoryTab,
  openSettingsModal, closeSettingsModal,
  openCoffeeModal, closeCoffeeModal, copyBankNumber,
  toggleThemeFromMenu,
  initPeriodLabelLongPress,
  toggleOcrDebugText,
  openShareTargetModal, closeShareTargetModal,
  openHistoryDatePicker, applyHistoryDateFilter, clearHistoryDateFilter,
  openAllOpportunitiesModal, closeAllOpportunitiesModal,
  showToast,
    isAutoSaveOCR, setAutoSaveOCR, toggleAutoSaveOCR, toggleAutoSaveOCRFromMenu,
  openMissedDaysModal, closeMissedDaysModal, handleMissedDateAction,
  dismissNuocRut
} from './ui.js';
import {
  handleOcrImage, preloadTesseractWorker,
  openOcrLightbox, closeOcrLightbox,
  openBatchOcrModal, closeBatchOcrModal, appendBatchFiles,
  saveBatchAll, importBatchItem, removeBatchItem,
  backToBatch, hasBatchPending, showBackToBatchBtn,
  clearOcrCache,
  initOcrCache, refreshOcrCacheStats,
  handleSharedImage
} from './ocr/index.js';
import { getOcrLogs } from './ocr-cache.js';
import { saveRecord, deleteRecord, clearAllHistory, deleteCurrentMonthHistory } from './entry.js';
import { undoLastDelete } from './undo.js';
import {
  copyDataJson, openPasteJsonModal, closePasteJsonModal,
  confirmImportJsonString, exportData, importData, restoreFromVault,
  checkAutoBackup, downloadBackupFile
} from './backup.js';
import {
  updateAllViews, dismissReminderBanner,
  setAllOppFilter,
  toggleNuocRutSuite
} from './render.js';
import {
  testCloudConnection, pushToCloud, pullFromCloud,
  initCloudUI, clearCloudToken
} from './cloud.js';
import { showAlert, showConfirm } from './dialog.js';
import { WEIGHT_KEYS } from './config.js';
import { requestPrecacheTesseract } from './sw-bridge.js';
import { initErrorHandler } from './error-handler.js';
import { initAds, showBanner } from './ads.js';

// ================ AUTO-CLEAR INPUT ================
function attachAutoClearInputs() {
  document.querySelectorAll('.auto-clear').forEach(input => {
    const el = /** @type {HTMLInputElement} */ (input);
    el.addEventListener('focus', () => { if (el.value === '0') el.value = ''; });
    el.addEventListener('blur',  () => { if (el.value.trim() === '') el.value = '0'; });
  });
}

// ================ SAVE CONFIG THEO THÁNG ================
let manualPointsTimer = null;
function _saveManualPoints() {
  const buuCuc = parseInt(document.getElementById('manualBuuCucInput').value, 10) || 0;
  const taiXe  = parseInt(document.getElementById('manualTaiXeInput').value, 10) || 0;
  const cfg = getSalaryConfig(state.currentMonth);
  setSalaryConfig(state.currentMonth, { ...cfg, buuCuc, taiXe });
  clearTimeout(manualPointsTimer);
  manualPointsTimer = setTimeout(() => updateAllViews(), 300);
}

let salaryTimer = null;
function _saveSalaryConfig() {
  const salary = parseFloat(document.getElementById('salaryBaseInput').value) || 0;
  const cfg = getSalaryConfig(state.currentMonth);
  setSalaryConfig(state.currentMonth, { ...cfg, base: salary });
  clearTimeout(salaryTimer);
  salaryTimer = setTimeout(() => updateAllViews(), 300);
}

// ================ DỌN TRÙNG LẶP ================
function _findDuplicates() {
  const dups = [];
  ['delivery', 'pickup', 'return'].forEach(type => {
    const seen = {};
    state.appData[type].forEach(r => {
      const key = r.date + '|' + WEIGHT_KEYS.map(k => parseInt(r.weights?.[k], 10) || 0).join('_');
      if (seen[key]) {
        dups.push({ type, id: r.id, date: r.date, keptId: seen[key].id });
      } else {
        seen[key] = r;
      }
    });
  });
  return dups;
}

async function _cleanupDuplicates() {
  const dups = _findDuplicates();
  if (dups.length === 0) {
    await showAlert('Tuyệt vời! Không có bản ghi nào bị trùng lặp.', { title: 'Thông báo', okText: 'Đóng' });
    return;
  }
  const summary = { Giao: 0, Lấy: 0, Hoàn: 0 };
  dups.forEach(d => {
    const label = d.type === 'delivery' ? 'Giao' : d.type === 'pickup' ? 'Lấy' : 'Hoàn';
    summary[label]++;
  });
  let msg = `Tìm thấy ${dups.length} bản ghi trùng lặp:\n`;
  Object.keys(summary).forEach(k => {
    if (summary[k] > 0) msg += `• ${k}: ${summary[k]}\n`;
  });
  msg += '\nXóa hết các bản ghi trùng (giữ lại 1 bản gốc)?';

  const ok = await showConfirm(msg, {
    title: 'Dọn bản ghi trùng',
    okText: 'Xóa trùng',
    cancelText: 'Hủy',
    danger: true
  });
  if (!ok) return;

  const idsByType = { delivery: [], pickup: [], return: [] };
  dups.forEach(d => idsByType[d.type].push(d.id));
  Object.keys(idsByType).forEach(type => {
    const ids = idsByType[type];
    state.appData[type] = state.appData[type].filter(r => !ids.includes(r.id));
  });
  updateAllViews();
  await showAlert(`Đã xóa ${dups.length} bản ghi trùng lặp!`, { title: 'Hoàn tất', okText: 'OK' });
}

// ================ OCR CACHE STATS + CLEAR ================
async function _updateOcrCacheStats() {
  const el = document.getElementById('ocrCacheStats');
  if (!el) return;
  try {
    const stats = await refreshOcrCacheStats();
    el.innerText = `RAM: ${stats.ramEntries} · IDB: ${stats.lsEntries} · ~${stats.sizeKB} KB (max ${stats.maxEntries}/${stats.maxSizeKB}KB)`;
  } catch (e) {
    el.innerText = 'Không đọc được thống kê';
  }
}

async function _clearOcrCacheFromSettings() {
  try {
    await clearOcrCache();
    await _updateOcrCacheStats();
  } catch (e) {
    console.error('[OCR Cache] Lỗi xóa:', e);
    await showAlert('Không xóa được cache quét ảnh: ' + e.message, { title: 'Lỗi', okText: 'Đóng' });
  }
}

// ================ XUẤT LOG CHẨN ĐOÁN OCR ================
async function _exportOcrLogs() {
  const btn = document.getElementById('exportOcrLogBtn');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Đang xuất...'; }

  try {
    const logs = await getOcrLogs(100);

    if (!logs || logs.length === 0) {
      showToast('Chưa có log chẩn đoán nào — hãy quét 1 ảnh trước rồi thử lại', 'warning', 3000);
      return;
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmtTime = ts => {
      const d = new Date(ts);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };
    const fmtDateFile = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const tabLabel = t => t === 'del' ? 'Giao' : t === 'pick' ? 'Lấy' : t === 'ret' ? 'Hoàn' : '';

    const SEP  = '═'.repeat(55);
    const THIN = '---';

    const lines = [];
    lines.push(SEP);
    lines.push('SPX TRACKER — NHẬT KÝ CHẨN ĐOÁN OCR');
    lines.push(`Xuất lúc: ${fmtTime(now.getTime())}`);
    lines.push(`Tổng số bản ghi: ${logs.length} (tối đa 100 gần nhất)`);
    lines.push(SEP);
    lines.push('');

    for (const log of logs) {
      const tabText   = tabLabel(log.tab);
      const dateText  = log.date || '';
      const diffText  = log.diff > 0 ? `+${log.diff}` : String(log.diff || 0);
      const rangesTxt = Array.isArray(log.ranges) ? `[${log.ranges.join(', ')}]` : '[]';
      const confTxt   = Array.isArray(log.conf)   ? `[${log.conf.join(', ')}]`   : '[]';

      lines.push(THIN);
      lines.push(`Thời gian: ${fmtTime(log.ts)}`);
      lines.push(`File: ${log.file || 'N/A'}`);
      lines.push(`Tab: ${tabText} - Ngày: ${dateText}`);
      lines.push(`Mode: ${log.mode || ''}`);
      lines.push(`Tổng đọc: ${log.sum || 0} / Tổng thực: ${log.total || 0} (Lệch: ${diffText})`);
      lines.push(`Dải: ${rangesTxt}`);
      lines.push(`Conf: ${confTxt}`);
      lines.push('Raw Text:');
      lines.push(log.rawText || '(không có text)');
      lines.push(THIN);
      lines.push('');
    }

    lines.push(SEP);
    lines.push('HẾT NHẬT KÝ');
    lines.push(SEP);

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `SPX_OCR_Log_${fmtDateFile}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    showToast(`✅ Đã xuất ${logs.length} log chẩn đoán`, 'success', 2500);
  } catch (e) {
    console.error('[ExportOcrLogs] Lỗi:', e);
    showToast('❌ Không xuất được log: ' + (e.message || 'lỗi không xác định'), 'error', 3000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '📤 Xuất log chẩn đoán'; }
  }
}

// ================ HERO COLLAPSIBLE ================
function _toggleHeroMetrics() {
  const wrap = document.getElementById('heroMetricsWrap');
  if (!wrap) return;
  const isExpanded = wrap.classList.toggle('expanded');
  try { localStorage.setItem('spx_hero_expanded', isExpanded ? '1' : '0'); } catch {}
}

function _initHeroExpandState() {
  const wrap = document.getElementById('heroMetricsWrap');
  if (!wrap) return;
  const saved = localStorage.getItem('spx_hero_expanded') === '1';
  if (saved) wrap.classList.add('expanded');
}

// ================ INFO ICON ================
function _showIncomeInfo() {
  showAlert(
    'Lương 1 công = (LCB + Bưu cục + Tài xế) / số ngày tối đa\n\n' +
    '⚡ Tài xế CHỈ được cộng khi đơn Giao ≥ 1.500/tháng.\n' +
    'Nếu < 1.500 → không cộng Tài xế vào lương.\n\n' +
    'Đã tích lũy = Lương 1 công × số công\n\n' +
    'Quy đổi: Giao + Lấy/6 + Hoàn\n' +
    '• Miền Trung: ≥60 = 1 công, ≥30 = 0.5 công\n' +
    '• TP.HCM & HN: ≥80 = 1 công, ≥40 = 0.5 công\n\n' +
    '⚡ Lương được lưu RIÊNG theo từng tháng.\n' +
    'Chuyển tháng để cấu hình tháng đó nhé.',
    { title: 'Cách tính thu nhập', okText: 'Đã hiểu' }
  );
}

// ================ OPEN OCR PICKER ================
let _ocrPreloadTriggered = false;
function _openOcrPicker() {
  if (!_ocrPreloadTriggered) {
    _ocrPreloadTriggered = true;
    preloadTesseractWorker();
    requestPrecacheTesseract();
  }
  const input = document.getElementById('ocrFileInput');
  if (input) input.click();
}

// ================ AUTO-UPDATE ================
let swRegistration = null;
let currentAppVersion = /** @type {HTMLMetaElement|null} */ (document.querySelector('meta[name="spx-app-version"]'))?.content || null;
let waitingWorker = null;

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Lần mở ĐẦU TIÊN (chưa có Service Worker nào kiểm soát trang): SW vừa cài xong sẽ báo SW_UPDATED,
  // nhưng trang này vốn đã chạy đúng bản mới nhất → tải lại ở đây chỉ làm mất toast, form đang nhập,
  // thao tác đang làm trong vài giây đầu. Chỉ bỏ qua đúng 1 lần đó; các bản cập nhật sau vẫn tải lại bình thường.
  let ignoreFirstActivation = !navigator.serviceWorker.controller;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('[PWA] SW registered:', swRegistration.scope);

    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[PWA] SW mới sẵn sàng (waiting)');
          waitingWorker = newWorker;
          showUpdateBanner();
        }
      });
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'SW_UPDATED') {
        if (ignoreFirstActivation) { ignoreFirstActivation = false; return; }
        if (document.querySelector('.modal-shade.active')) { showUpdateBanner(); return; }
        window.location.reload();
      }
    });
  } catch (e) {
    console.warn('[PWA] SW registration failed:', e);
  }
}

async function checkVersion(manual = false) {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      if (manual) showToast('⚠️ Không kiểm tra được — thử lại sau nhé', 'warning', 2500);
      return;
    }
    const data = await res.json();
    const serverVersion = data.version;
    if (!serverVersion) {
      if (manual) showToast('⚠️ Không đọc được version', 'warning', 2500);
      return;
    }

    if (!currentAppVersion) {
      currentAppVersion = serverVersion;
      console.warn('[Update] Thiếu version nhúng trong HTML; tạm dùng version server.');
      if (manual) showToast(`ℹ️ Bản hiện tại: ${serverVersion}`, 'info', 2500);
      return;
    }

    if (serverVersion !== currentAppVersion) {
      console.log('[Update] New version found:', serverVersion, '(current:', currentAppVersion + ')');
      if (swRegistration) {
        try { await swRegistration.update(); } catch {}
      }
      if (swRegistration && swRegistration.waiting) {
        waitingWorker = swRegistration.waiting;
      }
      showUpdateBanner(serverVersion);
      if (manual) showToast(`🎉 Có bản mới ${serverVersion}!`, 'success', 2500);
    } else if (manual) {
      showToast(`✅ Bạn đang dùng bản mới nhất (${serverVersion})`, 'success', 2500);
    }
  } catch (e) {
    if (manual) showToast('⚠️ Không kiểm tra được — kiểm tra kết nối mạng nhé', 'warning', 2500);
  }
}

function showUpdateBanner(newVer) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  const msg = document.getElementById('updateBannerMsg');
  if (msg) msg.textContent = newVer ? `Có bản mới ${newVer}!` : 'Có bản mới!';
  banner.classList.add('active');
}

function hideUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (banner) banner.classList.remove('active');
}

async function applyUpdate() {
  hideUpdateBanner();
  try {
    const worker = waitingWorker
      || (swRegistration && swRegistration.waiting)
      || (swRegistration && swRegistration.installing);

    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => {
        if (document.visibilityState === 'visible') window.location.reload();
      }, 2500);
    } else {
      window.location.reload();
    }
  } catch (e) {
    console.error('[Update] failed:', e);
    window.location.reload();
  }
}

// ================ VISIBILITY-BASED CHECK ================
let _lastAutoCheckTime = 0;
const AUTO_CHECK_THROTTLE_MS = 5 * 60 * 1000;

function _maybeAutoCheck() {
  if (document.hidden) return;
  const now = Date.now();
  if (now - _lastAutoCheckTime < AUTO_CHECK_THROTTLE_MS) return;
  _lastAutoCheckTime = now;
  checkVersion(false);
}
// ================ SHARE TARGET LAUNCH ================
const SHARED_CACHE_NAME = 'spx-shared-files';
const SHARED_QUERY_KEY = 'shared';

function _detectShareTargetLaunch() {
  try {
    const url = new URL(window.location.href);
    const hasSharedQuery = url.searchParams.get(SHARED_QUERY_KEY) === '1';
    const isShareTargetPath = /\/share-target\/?$/.test(url.pathname);
    return hasSharedQuery || isShareTargetPath;
  } catch {
    return false;
  }
}

async function _consumeSharedFiles() {
  if (!('caches' in window)) return [];

  try {
    const cache = await caches.open(SHARED_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length === 0) return [];

    const files = [];
    const consumedKeys = [];

    const metaReq = keys.find(req => req.url.endsWith('/spx-shared-meta'));
    let meta = { count: 0, names: [], types: [] };

    if (metaReq) {
      try {
        const metaRes = await cache.match(metaReq);
        if (metaRes) meta = await metaRes.json();
      } catch (e) {
        console.warn('[ShareTarget] Parse meta lỗi:', e);
      }
      consumedKeys.push(metaReq);
    }

    for (let i = 0; i < (meta.count || 0); i++) {
      const req = keys.find(r => r.url.endsWith(`/spx-shared-file-${i}`));
      if (!req) continue;

      const res = await cache.match(req);
      if (!res) continue;

      const blob = await res.blob();
      const name = meta.names?.[i] || `shared_${i}.jpg`;
      const type = meta.types?.[i] || blob.type || 'image/jpeg';

      const file = new File([blob], name, { type });
      files.push(file);
      consumedKeys.push(req);
    }

    await Promise.all(consumedKeys.map(req => cache.delete(req)));

    const remaining = await cache.keys();
    await Promise.all(
      remaining
        .filter(req => req.url.includes('/spx-shared-'))
        .map(req => cache.delete(req))
    );

    return files;
  } catch (e) {
    console.warn('[ShareTarget] Đọc cache lỗi:', e);
    return [];
  }
}

function _cleanShareQueryFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(SHARED_QUERY_KEY)) {
      url.searchParams.delete(SHARED_QUERY_KEY);
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }
  } catch {}
}

async function _runShareTargetIfNeeded() {
  if (!_detectShareTargetLaunch()) return;

  console.log('[ShareTarget] Phát hiện launch từ chia sẻ ảnh');

  _ocrPreloadTriggered = true;
  preloadTesseractWorker();
  requestPrecacheTesseract();

  await new Promise(r => setTimeout(r, 400));

  const files = await _consumeSharedFiles();
  _cleanShareQueryFromUrl();

  if (files.length === 0) {
    console.warn('[ShareTarget] Không có file trong cache');
    showAlert(
      'Không đọc được ảnh từ chia sẻ.\n\n' +
      'Hãy thử:\n' +
      '• Chia sẻ lại từ Thư viện ảnh\n' +
      '• Hoặc mở app → bấm 📷 để chọn ảnh thủ công',
      { title: '📤 Chia sẻ ảnh', okText: 'Đã hiểu' }
    );
    return;
  }

  console.log(`[ShareTarget] Nhận ${files.length} file — bắt đầu quét`);
  try {
    await handleSharedImage(files);
  } catch (e) {
    console.error('[ShareTarget] Lỗi pipeline:', e);
    showAlert('Lỗi xử lý ảnh chia sẻ: ' + e.message, { title: 'Lỗi', okText: 'Đóng' });
  }
}

// ================ EXPOSE TO WINDOW ================
Object.assign(window, {
  toggleTheme,
  toggleThemeFromMenu,
  isAutoSaveOCR,
  setAutoSaveOCR,
  toggleAutoSaveOCR,
  toggleAutoSaveOCRFromMenu,
  switchMainTab, switchModalSubTab, setHistFilter,
  setRankTier,
  syncRankUIForCurrentMonth,

  applyUpdate,
  checkVersion: () => checkVersion(true),

  setPeriodMode,
  periodPrev,
  periodNext,
  openPeriodPicker,
  jumpToMonth,
  jumpToDate,
  goToLatest,

  showIncomeInfo: _showIncomeInfo,
  toggleOcrDebugText,
  clearOcrCacheFromSettings: _clearOcrCacheFromSettings,
  updateOcrCacheStats: _updateOcrCacheStats,
  exportOcrLogs: _exportOcrLogs,
  dismissReminderBanner,

  openShareTargetModal,
  closeShareTargetModal,
  handleSharedImage,

  openHistoryDatePicker,
  applyHistoryDateFilter,
  clearHistoryDateFilter,

  openAllOpportunitiesModal,
  closeAllOpportunitiesModal,
  setAllOppFilter,

  openOcrPicker: _openOcrPicker,

  // MISSED DAYS MODAL
  openMissedDaysModal,
  closeMissedDaysModal,
  handleMissedDateAction,
  dismissNuocRut,
  // NƯỚC RÚT 5 DẢI
  toggleNuocRutSuite,

  // REGION
  changeRegion: function(regionKey, el) {
    try {
      if (!regionKey || (regionKey !== 'mien' && regionKey !== 'hcm_hn')) return;
      const oldRegion = state.region;
      if (oldRegion === regionKey) return;

      state.region = regionKey;
      try { localStorage.setItem('spx_region', regionKey); } catch (e) { console.warn('[Storage] Không lưu được khu vực:', e); }

      document.querySelectorAll('.region-pill').forEach(p => p.classList.remove('active'));
      if (el) el.classList.add('active');

      updateAllViews();

      const label = regionKey === 'hcm_hn'
        ? 'TP.HCM & Hà Nội (80/40)'
        : 'Miền Trung (60/30)';
      persistSettings();
      showToast(`Đã chọn: ${label}`, 'success', 1800);
    } catch (e) {
      console.error('[Region] error:', e);
      showAlert('Lỗi đổi khu vực: ' + e.message, { title: 'Lỗi', okText: 'Đóng' });
    }
  },

  openAddModal, openEditModal, closeModal,
  openMenuModal, closeMenuModal,
  openHistoryTab,
  openSettingsModal, closeSettingsModal,
  openCoffeeModal, closeCoffeeModal, copyBankNumber,
  handleOcrImage, openOcrLightbox, closeOcrLightbox,
  openBatchOcrModal, closeBatchOcrModal, appendBatchFiles,
  saveBatchAll, importBatchItem, removeBatchItem,
  backToBatch, hasBatchPending, showBackToBatchBtn,
  saveRecord, deleteRecord, clearAllHistory, deleteCurrentMonthHistory, undoLastDelete,
  copyDataJson, openPasteJsonModal, closePasteJsonModal,
  confirmImportJsonString, exportData, importData, restoreFromVault,
  downloadBackupFile,
  testCloudConnection, pushToCloud, pullFromCloud, initCloudUI, clearCloudToken,

  saveManualPoints: _saveManualPoints,
  saveSalaryConfig: _saveSalaryConfig,

  forceSaveConfig: function() {
    const buuCuc = parseInt(document.getElementById('manualBuuCucInput').value, 10) || 0;
    const taiXe  = parseInt(document.getElementById('manualTaiXeInput').value, 10) || 0;
    const salary = parseFloat(document.getElementById('salaryBaseInput').value) || 0;

    setSalaryConfig(state.currentMonth, { base: salary, buuCuc, taiXe });
    try { localStorage.setItem('spx_region', state.region); } catch (e) { console.warn('[Storage] Không lưu được khu vực:', e); }

    clearTimeout(manualPointsTimer);
    clearTimeout(salaryTimer);
    updateAllViews();

    const [y, m] = state.currentMonth.split('-');
    const taiXeNote = taiXe > 0
      ? `\n⚡ Nhớ nhé: Tài xế chỉ được cộng khi đơn Giao ≥ 1.500/tháng.`
      : '';

    showAlert(
      `Đã lưu cấu hình cho Tháng ${parseInt(m, 10)}/${y}!\n\n` +
      `• Lương:   ${salary.toLocaleString('vi-VN')}\n` +
      `• Bưu cục: ${buuCuc.toLocaleString('vi-VN')}\n` +
      `• Tài xế:  ${taiXe.toLocaleString('vi-VN')}\n` +
      `• Khu vực: ${state.region === 'hcm_hn' ? 'TP.HCM & HN' : 'Miền Trung'}` +
      taiXeNote,
      { title: 'Đã lưu cấu hình', okText: 'Tuyệt vời' }
    );
  },

  findDuplicates: _findDuplicates,
  cleanupDuplicates: _cleanupDuplicates,

  toggleHeroMetrics: _toggleHeroMetrics,

  isTesseractCached: () => import('./sw-bridge.js').then(m => m.isTesseractCached()),
  clearTesseractCache: () => import('./sw-bridge.js').then(m => m.clearTesseractCache()),

  debugListOcrCache: () => import('./ocr-cache.js').then(m => m.debugListCache())
});

// ================ HOOK SETTINGS MODAL → UPDATE STATS ================
const _origOpenSettingsModal = openSettingsModal;
window.openSettingsModal = function() {
  _origOpenSettingsModal();
  setTimeout(() => { _updateOcrCacheStats(); }, 100);
};

// ================ CẢNH BÁO KHI KHÔNG GHI ĐƯỢC DỮ LIỆU ================
let _storageWarned = false;
window.addEventListener('spx:storage-error', () => {
  if (_storageWarned) return;
  _storageWarned = true;
  showAlert('Bộ nhớ thiết bị đầy hoặc bị chặn — số liệu mới CHƯA được lưu.\n\nHãy xuất file sao lưu rồi giải phóng bộ nhớ nhé.',
    { title: '⚠️ Không lưu được', okText: 'Đã hiểu' });
});

// ================ PWA SHORTCUT LAUNCH ================
function _handleShortcutLaunch() {
  try {
    const url = new URL(window.location.href);
    const action = url.searchParams.get('action');
    if (action !== 'ocr' && action !== 'history') return;
    url.searchParams.delete('action');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    if (action === 'history') {
      openHistoryTab();
      return;
    }
    _openOcrPicker();
  } catch (e) {
    console.warn('[PWA] Không xử lý được shortcut:', e);
  }
}

// ================ INIT ================
(async function init() {
  // Bật error handler TRƯỚC TIÊN — để bắt mọi lỗi từ loadState() trở đi
  initErrorHandler();

  loadState();
  initTheme();
  initRankUI();
  initRegionUI();
  initPeriodLabelLongPress();

  updatePeriodBarUI();
  _initHeroExpandState();

  attachAutoClearInputs();
  updateAllViews();
  // Quảng cáo: chỉ chạy trên app native (ads.js tự kiểm tra)
  initAds().then(() => setTimeout(showBanner, 1500));

  initOcrCache().catch(e => console.warn('[Init] OCR cache init fail:', e));

  registerSW();
  setTimeout(() => checkVersion(false), 2000);

  document.addEventListener('visibilitychange', _maybeAutoCheck);
  window.addEventListener('focus', _maybeAutoCheck);

  _runShareTargetIfNeeded();
  _handleShortcutLaunch();

  // ⭐ AUTO BACKUP CHECK — sau 5 giây
  const _tryAutoBackup = (left) => {
    const busy = document.querySelector('.modal-shade.active') ||
                 document.getElementById('ocrLoadingOverlay')?.style.display === 'flex';
    if (busy) {
      if (left > 0) setTimeout(() => _tryAutoBackup(left - 1), 60000);
      return;
    }
    checkAutoBackup().catch(e => console.warn('[AutoBackup] check fail:', e));
  };
  setTimeout(() => _tryAutoBackup(5), 5000);
})();