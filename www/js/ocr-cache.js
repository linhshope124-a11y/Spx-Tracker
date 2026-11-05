// =============================================================
// OCR Cache v2 — Two-tier LRU + IndexedDB persistent
// - L1: in-memory Map (max 20 entries)
// - L2: IndexedDB (max 200 entries, có index ts để evict)
// - v3: store 'logs' cho nhật ký chẩn đoán OCR (100 bản ghi gần nhất)
// - API giữ nguyên như bản localStorage cũ
// =============================================================

import { showConfirm } from './dialog.js';
import { showToast } from './ui.js';
import { OCR_PIPELINE_VERSION } from './config.js';

// ==================== CONFIG ====================
const OCR_CACHE_VERSION = 'v1';          // ⚠️ đổi khi cấu trúc cache đổi (VD: đổi schema value)
// OCR_PIPELINE_VERSION import từ config.js — đổi khi parser/pipeline đổi → bỏ kết quả OCR cũ
// Cache key: `${OCR_CACHE_VERSION}-${OCR_PIPELINE_VERSION}_<hash>` = v1-p1_<hash>

const DB_NAME = 'spx_ocr_cache';
const DB_VERSION = 3;   // 3: thêm store 'logs' cho nhật ký chẩn đoán OCR
const STORE_NAME = 'entries';
const LOG_STORE_NAME = 'logs';
const MEM_MAX = 20;         // entries giữ trong RAM
const DB_MAX = 200;         // entries giữ trong IDB
const DB_MAX_BYTES = 8 * 1024 * 1024;   // 8MB (IDB không giới hạn như localStorage)
const LOG_MAX = 100;                    // giữ tối đa 100 bản ghi log gần nhất
const LOG_RAW_MAX = 50 * 1024;          // 50KB cap cho rawText mỗi log (tránh quota)

// ==================== STATE ====================
let _db = null;
let _dbPromise = null;
const _mem = new Map();     // LRU: key → { value, ts }
let _migrationDone = false;

// ==================== OPEN DB ====================
function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { _dbPromise = null; return reject(new Error('IndexedDB không khả dụng')); }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('by_ts', 'ts', { unique: false });
      }
      // v3: store log chẩn đoán OCR (giữ 100 bản ghi gần nhất)
      if (!db.objectStoreNames.contains(LOG_STORE_NAME)) {
        const logStore = db.createObjectStore(LOG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        logStore.createIndex('by_ts', 'ts', { unique: false });
      }
      // Dọn store của bản cache cũ (nếu máy từng chạy bản đó)
      if (db.objectStoreNames.contains('results')) db.deleteObjectStore('results');
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; _dbPromise = null; };
      resolve(_db);
    };

    req.onerror = () => {
      console.warn('[OcrCache] Không mở được IndexedDB:', req.error);
      _dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => { _dbPromise = null; reject(new Error('IndexedDB bị chặn bởi tab khác')); };
  });

  return _dbPromise;
}

// ==================== HELPERS ====================
function _cacheKey(hash) {
  return `${OCR_CACHE_VERSION}-${OCR_PIPELINE_VERSION}_${hash}`;
}

function _memGet(key) {
  const entry = _mem.get(key);
  if (!entry) return null;
  _mem.delete(key);
  _mem.set(key, entry);
  return entry.value;
}

function _memSet(key, value) {
  _mem.set(key, { value, ts: Date.now() });
  while (_mem.size > MEM_MAX) {
    const oldest = _mem.keys().next().value;
    _mem.delete(oldest);
  }
}

// ==================== PUBLIC API ====================

/**
 * Lấy value từ cache (đồng bộ — CHỈ đọc L1 memory).
 * Trả về null nếu miss.
 */
export function cacheGet(hash) {
  const key = _cacheKey(hash);
  return _memGet(key);
}

/**
 * Bản async — đọc cả L1 + L2. Dùng trong ocr.js pipeline.
 */
export async function cacheGetAsync(hash) {
  const key = _cacheKey(hash);

  // L1
  const memVal = _memGet(key);
  if (memVal) return memVal;

  // L2
  try {
    const db = await openDB();
    const entry = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (!entry) return null;

    _memSet(key, entry.value);
    openDB().then(d => {
      d.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ ...entry, ts: Date.now() });
    }).catch(() => {});
    return entry.value;
  } catch (e) {
    console.warn('[OcrCache] cacheGetAsync lỗi:', e);
    return null;
  }
}

/**
 * Ghi vào cache — fire-and-forget cho L2.
 * L1 ghi ngay (sync), L2 ghi async (không block pipeline).
 */
export function cacheSet(hash, value) {
  const key = _cacheKey(hash);
  _memSet(key, value);
  _dbSet(key, value).catch(e => console.warn('[OcrCache] L2 write fail:', e));
}

async function _dbSet(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, value, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject((e && e.target && e.target.error) || tx.error || new Error('IDB lỗi'));
      tx.onabort = () => reject(tx.error || new Error('IDB abort'));
    });

    await _evictIfNeeded();
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      await _evictOldest(50);
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, value, ts: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject((e && e.target && e.target.error) || tx.error || new Error('IDB lỗi'));
        tx.onabort = () => reject(tx.error || new Error('IDB abort'));
      });
    } else {
      throw e;
    }
  }
}
// ==================== EVICTION ====================
async function _evictIfNeeded() {
  const db = await openDB();

  const count = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (count > DB_MAX) {
    await _evictOldest(count - DB_MAX + 20);
  }
}

async function _evictOldest(n) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('by_ts');
    const cursorReq = idx.openCursor();
    let removed = 0;

    cursorReq.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor || removed >= n) return;
      store.delete(cursor.primaryKey);
      removed++;
      cursor.continue();
    };

    tx.oncomplete = () => resolve(removed);
    tx.onerror = e => reject((e && e.target && e.target.error) || tx.error || new Error('IDB lỗi'));
    tx.onabort = () => reject(tx.error || new Error('IDB abort'));
  });
}

// ==================== CLEAR ====================
/**
 * Xóa cache OCR (giữ API cũ — showConfirm + showToast bên trong).
 */
export async function clearOcrCache() {
  const ok = await showConfirm(
    'Xóa toàn bộ cache OCR?\n\nLần sau quét lại ảnh cũ sẽ phải OCR từ đầu.',
    { title: '🗑️ Xóa cache OCR', okText: 'Xóa', cancelText: 'Hủy', danger: true }
  );
  if (!ok) return 0;

  let count = 0;

  // L1
  count += _mem.size;
  _mem.clear();

  // L2
  try {
    const db = await openDB();
    count += await new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      let c = 0;
      countReq.onsuccess = () => { c = countReq.result; };
      store.clear();
      tx.oncomplete = () => resolve(c);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    });
  } catch (e) {
    console.warn('[OcrCache] clear L2 fail:', e);
  }

  count += _cleanLegacyLocalStorage();

  showToast(`Đã xóa ${count} cache OCR`, 'success', 2500);
  return count;
}

// ==================== STATS ====================
export function getOcrCacheStats() {
  return {
    ramEntries: _mem.size,
    lsEntries: _lastIdbCount,
    sizeKB: _lastIdbSizeKB,
    maxEntries: DB_MAX,
    maxSizeKB: Math.round(DB_MAX_BYTES / 1024)
  };
}

let _lastIdbCount = 0;
let _lastIdbSizeKB = 0;

export async function refreshOcrCacheStats() {
  try {
    const db = await openDB();
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    let total = 0, scanned = 0;
    await new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const cursor = tx.objectStore(STORE_NAME).openCursor();
      cursor.onsuccess = e => {
        const c = e.target.result;
        if (!c || scanned >= 50) { resolve(); return; }
        try { total += JSON.stringify(c.value).length * 2; } catch {}
        scanned++;
        c.continue();
      };
      cursor.onerror = () => resolve();
    });

    _lastIdbCount = count;
    const avg = scanned > 0 ? total / scanned : 0;
    _lastIdbSizeKB = Math.round((avg * count) / 1024);
  } catch (e) {
    console.warn('[OcrCache] refreshStats fail:', e);
    _lastIdbCount = 0;
    _lastIdbSizeKB = 0;
  }

  return getOcrCacheStats();
}

// ==================== MIGRATION ====================
function _cleanLegacyLocalStorage() {
  const LS_PREFIX = 'spx_ocr_ls_';
  const LS_INDEX = 'spx_ocr_ls_index';
  let removed = 0;

  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(k => {
      try { localStorage.removeItem(k); removed++; } catch {}
    });
    localStorage.removeItem(LS_INDEX);
  } catch (e) {
    console.warn('[OcrCache] Legacy cleanup fail:', e);
  }

  return removed;
}

export async function initOcrCache() {
  if (_migrationDone) return;
  _migrationDone = true;

  try {
    await openDB();
    _cleanLegacyLocalStorage();
    console.log('[OcrCache] Đã khởi tạo IDB cache');
  } catch (e) {
    console.warn('[OcrCache] Init fail — fallback RAM-only:', e);
  }
}

// ==================== DEBUG ====================
export async function debugListCache() {
  try {
    const db = await openDB();
    return await new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
// ==================== OCR DIAGNOSTIC LOGS ====================
/**
 * Lưu 1 bản ghi log chẩn đoán OCR.
 * Tự động trim xuống còn LOG_MAX bản ghi gần nhất.
 * Fire-and-forget — không throw, chỉ warn nếu lỗi.
 *
 * @param {{
 *   file?: string,
 *   tab?: 'del'|'pick'|'ret'|'',
 *   date?: string,
 *   mode?: string,
 *   sum?: number,
 *   total?: number,
 *   diff?: number,
 *   ranges?: number[],
 *   conf?: number[],
 *   rawText?: string,
 *   success?: boolean
 * }} data
 */
export async function saveOcrLog(data) {
  try {
    const db = await openDB();
    const d = data || {};
    const ranges = Array.isArray(d.ranges) ? d.ranges.slice(0, 8).map(n => Number(n) || 0) : [];
    const conf   = Array.isArray(d.conf)   ? d.conf.slice(0, 8).map(n => Number(n) || 0)   : [];
    const raw    = String(d.rawText == null ? '' : d.rawText).slice(0, LOG_RAW_MAX);

    const record = {
      ts:       Date.now(),
      file:     String(d.file  || '').slice(0, 300),
      tab:      (d.tab === 'del' || d.tab === 'pick' || d.tab === 'ret') ? d.tab : '',
      date:     String(d.date  || '').slice(0, 10),
      mode:     String(d.mode  || '').slice(0, 300),
      sum:      Number(d.sum)   || 0,
      total:    Number(d.total) || 0,
      diff:     Number(d.diff)  || 0,
      ranges,
      conf,
      rawText:  raw,
      success:  !!d.success
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
      tx.objectStore(LOG_STORE_NAME).add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject((e && e.target && e.target.error) || tx.error || new Error('IDB log lỗi'));
      tx.onabort = () => reject(tx.error || new Error('IDB log abort'));
    });

    await _trimOcrLogs();
  } catch (e) {
    console.warn('[OcrLog] saveOcrLog lỗi:', e);
  }
}

async function _trimOcrLogs() {
  try {
    const db = await openDB();
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readonly');
      const req = tx.objectStore(LOG_STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (count <= LOG_MAX) return;

    const toDelete = count - LOG_MAX;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOG_STORE_NAME);
      const cursorReq = store.index('by_ts').openCursor();
      let removed = 0;
      cursorReq.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor || removed >= toDelete) return;
        store.delete(cursor.primaryKey);
        removed++;
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject((e && e.target && e.target.error) || tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[OcrLog] trim lỗi:', e);
  }
}

/**
 * Lấy log chẩn đoán (mới nhất trước).
 * @param {number} [limit=100]
 * @returns {Promise<Array<object>>}
 */
export async function getOcrLogs(limit = LOG_MAX) {
  try {
    const db = await openDB();
    const n = Math.max(1, Math.min(Number(limit) || LOG_MAX, LOG_MAX));
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readonly');
      const idx = tx.objectStore(LOG_STORE_NAME).index('by_ts');
      const req = idx.openCursor(null, 'prev');
      const out = [];
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor || out.length >= n) return resolve(out);
        out.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[OcrLog] getOcrLogs lỗi:', e);
    return [];
  }
}

/**
 * Xóa toàn bộ log chẩn đoán. Trả về số bản ghi đã xóa.
 * @returns {Promise<number>}
 */
export async function clearOcrLogs() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOG_STORE_NAME);
      const countReq = store.count();
      let c = 0;
      countReq.onsuccess = () => { c = countReq.result; };
      store.clear();
      tx.oncomplete = () => resolve(c);
      tx.onerror = e => reject((e && e.target && e.target.error) || tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[OcrLog] clearOcrLogs lỗi:', e);
    return 0;
  }
}