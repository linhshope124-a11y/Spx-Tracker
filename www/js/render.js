import { state, persistData, getSalaryConfig, hasSalaryConfig, getRankConfig, getNuocRutDismissed } from './state.js';
import { WEIGHT_LABELS, WEIGHT_KEYS, TABLE_4_DATA, TABLE_5_DATA, TABLE_6_DATA, TAIXE_ORDER_THRESHOLD } from './config.js';
import { lookupTier, aggregateWeights, isDateInCurrentPeriod } from './calc.js';
import { formatPts, formatDateDisplay, _fmt, getCurrentMonthIso, getTodayIso } from './utils.js';

const NEED_HIGHLIGHT = 'color:#dc2626;font-size:1.35em;font-weight:900;letter-spacing:0.5px;';
const TOP_OVERVIEW_COUNT = 4;

// Dải nặng — ẩn gợi ý khi đã có ≥1 đơn
const HEAVY_WEIGHT_KEYS = ['10_12', '12_15', 'over_15'];
const SUFFIX_BY_COL = ['0_2', '2_4', '4_6', '6_8', '8_10', '10_12', '12_15', 'over_15'];

// ============ Lưu ngay khi app bị ẩn/đóng (không phụ thuộc debounce render) ============
const _flushNow = () => { persistData(); };
window.addEventListener('pagehide', _flushNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) _flushNow(); });

// ============ All opportunities modal state ============
let _allOppFilter = 'del';
let _allOppCache = [];

// ============ History filters (đơn giản hóa) ============
const DEFAULT_HIST_FILTERS = {
  date: null,
  types: { delivery: true, pickup: true, return: true }
};

let _histFilters = {
  date: null,
  types: { ...DEFAULT_HIST_FILTERS.types }
};

export function getHistFilters() {
  return {
    date: _histFilters.date,
    types: { ..._histFilters.types }
  };
}

export function setHistFilters(partial) {
  if (!partial || typeof partial !== 'object') return;

  if ('date' in partial) {
    const d = partial.date;
    _histFilters.date = (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
  }
  if ('types' in partial && partial.types) {
    _histFilters.types = {
      delivery: partial.types.delivery !== false,
      pickup:   partial.types.pickup   !== false,
      return:   partial.types.return   !== false
    };
  }
}

export function resetHistFilters() {
  _histFilters = {
    date: null,
    types: { ...DEFAULT_HIST_FILTERS.types }
  };
}

export function hasActiveHistFilters() {
  if (_histFilters.date) return true;
  const t = _histFilters.types;
  if (!t.delivery || !t.pickup || !t.return) return true;
  return false;
}

function recordPassesHistoryFilter(r, type) {
  if (!_histFilters.types[type]) return false;
  if (_histFilters.date) return r.date === _histFilters.date;
  return isDateInCurrentPeriod(r.date, state.periodMode, state.currentMonth, state.currentDate);
}

// ==================== REMINDER BANNER ====================
function computeMissedDays() {
  const allDates = [
    ...state.appData.delivery.map(r => r.date),
    ...state.appData.pickup.map(r => r.date),
    ...state.appData.return.map(r => r.date)
  ].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (allDates.length === 0) return { count: 0, dates: [] };

  allDates.sort();
  const lastDate = allDates[allDates.length - 1];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const last = new Date(lastDate + 'T00:00:00');
  if (last >= yesterday) return { count: 0, dates: [] };

  const missed = [];
  const cursor = new Date(last);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= yesterday) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
    missed.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }

  return { count: missed.length, dates: missed };
}

function formatMissedDate(iso) {
  const p = iso.split('-');
  return `${p[2]}/${p[1]}`;
}

export function getMissedDatesList(now = new Date()) {
  const cm = state.currentMonth || getCurrentMonthIso();
  const [y, m] = cm.split('-').map(Number);
  const nowMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (cm > nowMonthIso) return [];

  const recorded = new Set();
  ['delivery', 'pickup', 'return'].forEach(type => {
    state.appData[type].forEach(r => {
      if (r.date.startsWith(cm + '-')) recorded.add(r.date);
    });
  });
  if (recorded.size === 0) return [];

  const endDay = (cm === nowMonthIso) ? now.getDate() - 1 : new Date(y, m, 0).getDate();
  const missed = [];
  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  for (let d = 1; d <= endDay; d++) {
    const iso = `${cm}-${String(d).padStart(2, '0')}`;
    if (!recorded.has(iso)) {
      const dateObj = new Date(y, m - 1, d);
      missed.push({ iso, day: d, month: m, year: y, dayOfWeek: daysOfWeek[dateObj.getDay()] });
    }
  }
  return missed;
}

export function getMissedDaysInCurrentMonth(now = new Date()) {
  return getMissedDatesList(now).length;
}

export function renderReminderBanner() {
  const banner = document.getElementById('reminderBanner');
  if (!banner) return;

  const { count, dates } = computeMissedDays();
  if (count === 0) { banner.style.display = 'none'; return; }

  const todayIso = getTodayIso();
  const dismissed = localStorage.getItem('spx_reminder_dismissed') || '';
  if (dismissed === todayIso) { banner.style.display = 'none'; return; }

  let stateClass = 'reminder-state-1';
  let icon = '⚠️';
  if (count >= 5) { stateClass = 'reminder-state-3'; icon = '🔴'; }
  else if (count >= 3) { stateClass = 'reminder-state-2'; }

  banner.className = 'reminder-banner ' + stateClass;

  const iconEl = document.getElementById('reminderIcon');
  const titleEl = document.getElementById('reminderTitle');
  const subEl = document.getElementById('reminderSub');
  const secondaryBtn = document.getElementById('reminderSecondaryBtn');

  if (iconEl) iconEl.innerText = icon;

  if (titleEl) {
    if (count === 1) titleEl.innerText = `Chưa quét ngày ${formatMissedDate(dates[0])}`;
    else titleEl.innerText = `Chưa quét ${count} ngày`;
  }

  if (subEl) {
    if (count === 1) subEl.innerText = '';
    else if (count <= 4) subEl.innerText = dates.map(formatMissedDate).join(' · ');
    else subEl.innerText = `Từ ${formatMissedDate(dates[0])} đến ${formatMissedDate(dates[dates.length-1])}`;
  }

  if (secondaryBtn) secondaryBtn.style.display = count >= 5 ? 'inline-flex' : 'none';
  banner.style.display = 'block';
}

export function dismissReminderBanner() {
  const todayIso = getTodayIso();
  try { localStorage.setItem('spx_reminder_dismissed', todayIso); } catch {}
  const banner = document.getElementById('reminderBanner');
  if (banner) banner.style.display = 'none';
}
// ==================== HELPERS ====================
function getRegionThresholds(region) {
  if (region === 'hcm_hn') return { full: 80, half: 40 };
  return { full: 60, half: 30 };
}

function getSalaryDaysForPeriod() {
  const monthStr = state.currentMonth || getCurrentMonthIso();
  const month = parseInt(monthStr.split('-')[1], 10);
  return month === 2 ? 24 : 26;
}

function getWorkDaysByPeriod() {
  const dailyByType = {};
  ['delivery', 'pickup', 'return'].forEach(type => {
    const key = type === 'delivery' ? 'del' : type === 'pickup' ? 'pick' : 'ret';
    state.appData[type].forEach(r => {
      if (!isDateInCurrentPeriod(r.date, state.periodMode, state.currentMonth, state.currentDate)) return;
      if (!dailyByType[r.date]) dailyByType[r.date] = { del: 0, pick: 0, ret: 0 };
      const dayTotal = WEIGHT_KEYS.reduce((sum, k) => sum + (parseInt(r.weights[k], 10) || 0), 0);
      dailyByType[r.date][key] += dayTotal;
    });
  });

  const { full, half } = getRegionThresholds(state.region);
  let workDays = 0;
  Object.values(dailyByType).forEach(({ del, pick, ret }) => {
    const converted = del + (pick / 6) + ret;
    if (converted >= full)      workDays += 1;
    else if (converted >= half) workDays += 0.5;
  });
  return workDays;
}

function updateHeroContextLabel() {
  const el = document.getElementById('heroContext');
  if (!el) return;
  const cm = state.currentMonth || getCurrentMonthIso();
  const [y, m] = cm.split('-');
  el.innerText = `Tháng ${parseInt(m, 10)}/${y}`;
}

// ==================== TÀI XẾ CONDITION BANNER ====================
function renderTaiXeConditionBanner(delOrders, taiXeAmount) {
  const banner = document.getElementById('taixeConditionBanner');
  if (!banner) return;

  const amt = Number(taiXeAmount) || 0;
  if (amt === 0) { banner.style.display = 'none'; return; }

  const orders = Number(delOrders) || 0;
  const isMet = orders >= TAIXE_ORDER_THRESHOLD;
  const pct = Math.min(100, (orders / TAIXE_ORDER_THRESHOLD) * 100);
  const pctStr = pct.toFixed(1);

  banner.className = 'taixe-condition-banner ' + (isMet ? 'taixe-state-success' : 'taixe-state-warning');

  const icon = document.getElementById('taixeBannerIcon');
  const title = document.getElementById('taixeBannerTitle');
  const progressText = document.getElementById('taixeProgressText');
  const progressFill = document.getElementById('taixeProgressFill');
  const sub = document.getElementById('taixeBannerSub');

  if (icon) icon.innerText = isMet ? '✅' : '⚠️';
  if (title) title.innerText = isMet ? 'Đã đủ điều kiện cộng Tài xế' : 'Chưa đủ điều kiện cộng Tài xế';
  if (progressText) progressText.innerText = `Đơn Giao: ${_fmt(orders)}/${_fmt(TAIXE_ORDER_THRESHOLD)}`;
  if (progressFill) progressFill.style.width = pct + '%';
  if (sub) {
    if (isMet) sub.innerText = `${pctStr}% — sẽ cộng ${_fmt(amt)}đ vào lương tháng này`;
    else sub.innerText = `Còn thiếu ${_fmt(TAIXE_ORDER_THRESHOLD - orders)} đơn — chưa cộng Tài xế`;
  }

  banner.style.display = 'block';
}

// ==================== RENDER ROWS & SUGGESTIONS ====================
function renderRow(weightLabel, orders, tier, typeClass) {
  const shortLabel = weightLabel.replace(/\s+/g, '').replace('kg', '');
  const ptsText = tier.matched.pt === 0 ? '<span class="zero-dash">—</span>' : _fmt(tier.matched.pt);

  let needText, gainText;
  if (orders <= 0) {
    needText = '<span class="zero-dash">—</span>';
    gainText = '<span class="zero-dash">—</span>';
  } else if (!tier.next || !isFinite(tier.matched.maxA)) {
    needText = '<span class="max-tag">MAX</span>';
    gainText = '<span class="zero-dash">—</span>';
  } else {
    needText = `<span class="need-num">+${_fmt(tier.matched.maxA - orders)}</span>`;
    gainText = `<span class="gain-num">+${_fmt(tier.next.pt - tier.matched.pt)}</span><span class="gain-unit"> điểm</span>`;
  }

  return `<td class="weight-name">${shortLabel}</td>
    <td class="order-num ${typeClass} ${orders === 0 ? 'zero' : ''}">${_fmt(orders)}</td>
    <td class="range-cell">${tier.matched.range}</td>
    <td class="points-badge ${orders === 0 ? 'zero' : ''}">${ptsText}</td>
    <td class="next-cell need-cell">${needText}</td>
    <td class="next-cell gain-cell">${gainText}</td>`;
}

function buildOverviewSuggestion(type, label, orders, tier, weightKey) {
  const isZero = orders === 0;
  if (isZero && type !== 'del') return null;
  if (!isZero && HEAVY_WEIGHT_KEYS.includes(weightKey)) return null;
  if (!tier.next || !isFinite(tier.matched.maxA)) return null;

  const need = isZero ? (tier.next.min || 1) : (tier.matched.maxA - orders);
  const gain = isZero ? tier.next.pt : (tier.next.pt - tier.matched.pt);
  const hasPoint = orders > 0 && tier.matched.pt > 0;

  const badge = type === 'del' ? 'G' : type === 'pick' ? 'L' : 'H';
  const cls   = type === 'del' ? 'sugg-del'  : type === 'pick' ? 'sugg-pick'  : 'sugg-ret';
  const bcls  = type === 'del' ? 'sugg-type-del' : type === 'pick' ? 'sugg-type-pick' : 'sugg-type-ret';

  const html = `<div class="suggestion-item ${cls}">
    <div class="sugg-left"><h4><span class="sugg-type-badge ${bcls}">${badge}</span> ${label} · ${_fmt(orders)} đơn</h4>
    <p>Thêm <b style="${NEED_HIGHLIGHT}">+${_fmt(need)}</b> đơn đạt ${tier.next.range}</p></div>
    <div class="sugg-points">+${formatPts(gain)}</div>
  </div>`;

  return { type, need, gain, hasPoint, weightKey, html };
}

function renderOverviewSuggestions(sorted) {
  const ovBox = document.getElementById('overviewMilestoneList');
  const btnViewAll = document.getElementById('viewAllOpportunitiesBtn');
  if (!ovBox) return;

  if (sorted.length === 0) {
    ovBox.innerHTML = `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding:16px">Chưa có cơ hội tăng điểm nào trong kỳ này.</div>`;
    if (btnViewAll) btnViewAll.style.display = 'none';
    return;
  }

  ovBox.innerHTML = sorted.slice(0, TOP_OVERVIEW_COUNT).map(o => o.html).join('');
  if (btnViewAll) btnViewAll.style.display = sorted.length > TOP_OVERVIEW_COUNT ? 'flex' : 'none';
}

// ==================== ALL OPPORTUNITIES MODAL ====================
export function renderAllOpportunitiesList() {
  const box = document.getElementById('allOpportunitiesList');
  if (!box) return;

  const filtered = _allOppCache.filter(o => o.type === _allOppFilter);
  if (filtered.length === 0) {
    const label = _allOppFilter === 'del' ? 'Giao' : _allOppFilter === 'pick' ? 'Lấy' : 'Hoàn';
    box.innerHTML = `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:24px 16px">Không có cơ hội tăng điểm cho mục ${label}.</div>`;
    return;
  }
  box.innerHTML = filtered.map(o => o.html).join('');
}

export function setAllOppFilter(filter, btn) {
  const valid = ['del', 'pick', 'ret'];
  _allOppFilter = valid.includes(filter) ? filter : 'del';

  const bar = btn?.closest('.filter-bar');
  if (bar) {
    bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  renderAllOpportunitiesList();
}

export function getAllOppFilter() { return _allOppFilter; }

// ==================== TAB EMPTY STATES ====================
function _renderTabEmptyStates(agg) {
  const configs = [
    { emptyId: 'delEmptyState',  cardId: 'delTableCard',  hasData: agg.del.some(v => v > 0) },
    { emptyId: 'pickEmptyState', cardId: 'pickTableCard', hasData: agg.pick.some(v => v > 0) },
    { emptyId: 'retEmptyState',  cardId: 'retTableCard',  hasData: agg.ret.some(v => v > 0) }
  ];

  configs.forEach(({ emptyId, cardId, hasData }) => {
    const emptyEl = document.getElementById(emptyId);
    const cardEl  = document.getElementById(cardId);
    if (emptyEl) emptyEl.style.display = hasData ? 'none'  : 'block';
    if (cardEl)  cardEl.style.display  = hasData ? 'block' : 'none';
  });
}

// ==================== UPDATE ALL VIEWS ====================
function _updateAllViews() {
  const { agg, total } = aggregateWeights(state.appData, state.periodMode, state.currentMonth, state.currentDate);

  const delTbody  = document.getElementById('delTableBody');  
  const pickTbody = document.getElementById('pickTableBody'); 
  const retTbody  = document.getElementById('retTableBody');  

  let dRows = '', pRows = '', rRows = '';
  const ovSuggBuf = [];
  let delPts = 0, pickPts = 0, retPts = 0;

  for (let col = 0; col < 8; col++) {
    const dOrders = agg.del[col], pOrders = agg.pick[col], rOrders = agg.ret[col];
    const dTier = lookupTier(dOrders, col, TABLE_5_DATA);
    const pTier = lookupTier(pOrders, col, TABLE_4_DATA);
    const rTier = lookupTier(rOrders, col, TABLE_6_DATA);
    delPts += dTier.matched.pt; pickPts += pTier.matched.pt; retPts += rTier.matched.pt;

    dRows += `<tr>${renderRow(WEIGHT_LABELS[col], dOrders, dTier, 'delivery-num')}</tr>`;
    pRows += `<tr>${renderRow(WEIGHT_LABELS[col], pOrders, pTier, 'pickup-num')}</tr>`;
    rRows += `<tr>${renderRow(WEIGHT_LABELS[col], rOrders, rTier, 'return-num')}</tr>`;

    const wKey = SUFFIX_BY_COL[col];
    const o1 = buildOverviewSuggestion('del',  WEIGHT_LABELS[col], dOrders, dTier, wKey); if (o1) ovSuggBuf.push(o1);
    const o2 = buildOverviewSuggestion('pick', WEIGHT_LABELS[col], pOrders, pTier, wKey); if (o2) ovSuggBuf.push(o2);
    const o3 = buildOverviewSuggestion('ret',  WEIGHT_LABELS[col], rOrders, rTier, wKey); if (o3) ovSuggBuf.push(o3);
  }

  delTbody.innerHTML = dRows; pickTbody.innerHTML = pRows; retTbody.innerHTML = rRows;
  _renderTabEmptyStates(agg);

  ovSuggBuf.sort((a, b) => {
    if (a.hasPoint !== b.hasPoint) return a.hasPoint ? 1 : -1;
    if (!a.hasPoint && !b.hasPoint) {
      if (a.gain !== b.gain) return b.gain - a.gain;
      if (a.need !== b.need) return a.need - b.need;
      return 0;
    }
    if (a.need !== b.need) return a.need - b.need;
    if (a.gain !== b.gain) return b.gain - a.gain;
    return 0;
  });

  _allOppCache = ovSuggBuf;

  if (total.del + total.pick + total.ret === 0) {
    const ovBox = document.getElementById('overviewMilestoneList');
    const btnViewAll = document.getElementById('viewAllOpportunitiesBtn');
    if (ovBox) {
      ovBox.innerHTML = `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding:16px">Chưa có dữ liệu kỳ này. Hãy quét ảnh hoặc nhập sản lượng để bắt đầu nhé!</div>`;
    }
    if (btnViewAll) btnViewAll.style.display = 'none';
  } else {
    renderOverviewSuggestions(ovSuggBuf);
  }

  const rawBase = delPts + pickPts + retPts;
  const rankCfg = getRankConfig(state.currentMonth);
  const rankBonus = Math.round(rawBase * rankCfg.bonus);

  const salaryDays = getSalaryDaysForPeriod();
  const workDays = getWorkDaysByPeriod();
  const displayDays = Math.min(workDays, salaryDays);

  const salaryCfg = getSalaryConfig(state.currentMonth);
  const salaryBase = salaryCfg.base;
  const manualBuuCuc = salaryCfg.buuCuc;
  const manualTaiXe = salaryCfg.taiXe;

  const delOrders = total.del;
  let monthlyTotal = salaryBase + manualBuuCuc;
  if (delOrders >= TAIXE_ORDER_THRESHOLD) monthlyTotal += manualTaiXe;

  const perDay = salaryDays > 0 ? monthlyTotal / salaryDays : 0;
  const incomeAccumulated = Math.round(perDay * displayDays);

  const finalTotal  = rawBase + rankBonus + incomeAccumulated;
  const totalOrders = total.del + total.pick + total.ret;
  const isEmpty = totalOrders === 0;

  // ===== HERO =====
  const heroEl       = document.getElementById('overviewHero');
  const heroDataEl   = document.getElementById('heroData');
  const heroEmptyEl  = document.getElementById('heroEmpty');
  const heroValueEl  = document.getElementById('overallTotalPoints');
  const heroBaseEl   = document.getElementById('heroBase');
  const heroBonusEl  = document.getElementById('heroBonus');
  const heroIncomeEl = document.getElementById('heroIncome');

  if (heroEl) heroEl.classList.toggle('no-data', isEmpty);
  if (heroDataEl)  heroDataEl.style.display  = isEmpty ? 'none'  : 'block';
  if (heroEmptyEl) heroEmptyEl.style.display = isEmpty ? 'block' : 'none';

  if (!isEmpty) {
    if (heroValueEl) heroValueEl.innerHTML = `${_fmt(finalTotal)} <span class="hero-value-unit">Điểm</span>`;
    if (heroBaseEl)   heroBaseEl.innerText   = _fmt(rawBase);
    if (heroBonusEl)  heroBonusEl.innerText  = '+' + _fmt(rankBonus);
    if (heroIncomeEl) heroIncomeEl.innerText = '+' + _fmt(incomeAccumulated);
  }

  updateHeroContextLabel();

  const heroTileDelEl  = document.getElementById('heroTileDel');
  const heroTilePickEl = document.getElementById('heroTilePick');
  const heroTileRetEl  = document.getElementById('heroTileRet');

  if (heroTileDelEl) {
    heroTileDelEl.innerText = total.del === 0 ? '0' : _fmt(total.del);
    heroTileDelEl.classList.toggle('is-zero', total.del === 0);
  }
  if (heroTilePickEl) {
    heroTilePickEl.innerText = total.pick === 0 ? '0' : _fmt(total.pick);
    heroTilePickEl.classList.toggle('is-zero', total.pick === 0);
  }
  if (heroTileRetEl) {
    heroTileRetEl.innerText = total.ret === 0 ? '0' : _fmt(total.ret);
    heroTileRetEl.classList.toggle('is-zero', total.ret === 0);
  }

  document.getElementById('delTotalPoints').innerHTML = `${_fmt(delPts)} <span class="hero-value-unit">Điểm</span>`;
  document.getElementById('delTotalOrders').innerText = `${_fmt(total.del)} đơn`;
  document.getElementById('pickTotalPoints').innerHTML = `${_fmt(pickPts)} <span class="hero-value-unit">Điểm</span>`;
  document.getElementById('pickTotalOrders').innerText = `${_fmt(total.pick)} đơn`;
  document.getElementById('retTotalPoints').innerHTML = `${_fmt(retPts)} <span class="hero-value-unit">Điểm</span>`;
  document.getElementById('retTotalOrders').innerText = `${_fmt(total.ret)} đơn`;

  // ===== Income UI =====
  const salaryBaseEl   = document.getElementById('salaryBaseInput');
  const buuCucInput    = document.getElementById('manualBuuCucInput');
  const taiXeInput     = document.getElementById('manualTaiXeInput');
  const incomeDayCount = document.getElementById('incomeDayCount');
  const incomePerDay   = document.getElementById('incomePerDayText');
  const incomeTotal    = document.getElementById('incomeTotalDisplay');
  const incomeTotalInner = document.getElementById('incomeTotalDisplayInner');
  const progressFill   = document.getElementById('incomeProgressFill');

  if (salaryBaseEl && document.activeElement !== salaryBaseEl) salaryBaseEl.value = salaryBase;
  if (buuCucInput && document.activeElement !== buuCucInput)   buuCucInput.value  = manualBuuCuc;
  if (taiXeInput  && document.activeElement !== taiXeInput)    taiXeInput.value   = manualTaiXe;

  const salaryMonthHint = document.getElementById('salaryMonthHint');
  if (salaryMonthHint) {
    const [y, m] = state.currentMonth.split('-');
    const label = `Tháng ${parseInt(m, 10)}/${y}`;
    if (hasSalaryConfig(state.currentMonth)) {
      salaryMonthHint.innerText = `📅 Áp dụng cho: ${label}`;
      salaryMonthHint.classList.remove('salary-month-hint--empty');
    } else {
      salaryMonthHint.innerText = `⚠️ Chưa thiết lập cho: ${label}`;
      salaryMonthHint.classList.add('salary-month-hint--empty');
    }
  }

  const workDaysText = Number.isInteger(displayDays) ? displayDays.toString() : displayDays.toFixed(1);
  const progressPct = salaryDays > 0 ? Math.min(100, Math.round((displayDays / salaryDays) * 100)) : 0;

  if (incomeDayCount) incomeDayCount.innerText = `${workDaysText}/${salaryDays} công · ${progressPct}%`;
  if (incomePerDay)   incomePerDay.innerText   = formatPts(Math.round(perDay)) + '/công';
  if (incomeTotal)    incomeTotal.innerText    = '+' + formatPts(incomeAccumulated);
  if (incomeTotalInner) incomeTotalInner.innerText = '+' + formatPts(incomeAccumulated);
  if (progressFill)   progressFill.style.width = progressPct + '%';

  renderTaiXeConditionBanner(delOrders, manualTaiXe);
  renderNuocRutCard(agg);

  const filteredCount =
    state.appData.delivery.filter(r => isDateInCurrentPeriod(r.date, state.periodMode, state.currentMonth, state.currentDate)).length +
    state.appData.pickup.filter(r => isDateInCurrentPeriod(r.date, state.periodMode, state.currentMonth, state.currentDate)).length +
    state.appData.return.filter(r => isDateInCurrentPeriod(r.date, state.periodMode, state.currentMonth, state.currentDate)).length;
  document.getElementById('histCountNote').innerText = `${filteredCount} bản ghi`;

  if (persistData()) window.dispatchEvent(new CustomEvent('spx:datachanged'));

  renderReminderBanner();
  renderHistory();
}

let _updateAllViews_debounced = null;
export function updateAllViews() {
  if (!_updateAllViews_debounced) {
    _updateAllViews_debounced = (() => {
      let t = null;
      return () => { clearTimeout(t); t = setTimeout(_updateAllViews, 60); };
    })();
  }
  _updateAllViews_debounced();
}
// ==================== NƯỚC RÚT 5 DẢI (5 ngày cuối tháng) ====================
const NUOC_RUT_SUITES = [
  { col: 0, key: '0_2',  label: '0-2 kg'  },
  { col: 1, key: '2_4',  label: '2-4 kg'  },
  { col: 2, key: '4_6',  label: '4-6 kg'  },
  { col: 3, key: '6_8',  label: '6-8 kg'  },
  { col: 4, key: '8_10', label: '8-10 kg' }
];

const _ICON_RANK = { '💪': 1, '⚠️': 2, '🔴': 3 };
const _RANK_ICON = { 1: '💪', 2: '⚠️', 3: '🔴' };

function renderNuocRutCard(agg) {
  const card = document.getElementById('nuocRutCard');
  const body = document.getElementById('nuocRutBody');
  const titleEl = document.getElementById('nuocRutTitle');
  if (!card || !body) return;

  // ===== Điều kiện 1: chỉ tháng hiện tại =====
  const now = new Date();
  const nowMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonth = state.currentMonth || getCurrentMonthIso();
  if (currentMonth !== nowMonthIso) { card.style.display = 'none'; return; }

  // ===== Điều kiện 2: chỉ 5 ngày cuối tháng =====
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  if (today < daysInMonth - 4) { card.style.display = 'none'; return; }

  // ===== Điều kiện 3: chưa dismiss =====
  if (getNuocRutDismissed(currentMonth)) { card.style.display = 'none'; return; }

  // ===== Điều kiện 4: có ít nhất 1 đơn trong 5 dải =====
  const hasAnyOrder = NUOC_RUT_SUITES.some(s =>
    (agg.del[s.col] || 0) > 0 || (agg.pick[s.col] || 0) > 0 || (agg.ret[s.col] || 0) > 0
  );
  if (!hasAnyOrder) { card.style.display = 'none'; return; }

  // ===== Chuẩn bị số liệu chung =====
  const daysLeft   = daysInMonth - today + 1;
  const daysPassed = today;

  function sumLastNDays(type, n) {
    const mapType = type === 'del' ? 'delivery' : type === 'pick' ? 'pickup' : 'return';
    const records = state.appData[mapType] || [];
    const start = new Date(now);
    start.setDate(start.getDate() - (n - 1));
    start.setHours(0, 0, 0, 0);
    const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endIso = `${nowMonthIso}-${String(today).padStart(2, '0')}`;

    let total = 0;
    records.forEach(r => {
      if (!r.date.startsWith(nowMonthIso)) return;
      if (r.date < startIso) return;
      if (r.date > endIso) return;
      total += parseInt(r.weights?.[WEIGHT_KEYS[0]], 10) || 0;
    });
    return total;
  }

  function calcPaceRef(type, x) {
    const X5d = sumLastNDays(type, 5);
    const divisor = Math.min(5, daysPassed);
    let pace = X5d > 0 ? X5d / divisor : x / daysPassed;
    if (!Number.isFinite(pace) || pace <= 0) pace = 0.1;
    return pace;
  }

  function iconFor(ratio) {
    if (ratio <= 0.8) return '💪';
    if (ratio <= 1.5) return '⚠️';
    return '🔴';
  }

  const TYPE_TABLE = { del: TABLE_5_DATA, pick: TABLE_4_DATA, ret: TABLE_6_DATA };

  function calcTypeInfo(type, col, X) {
    const table = TYPE_TABLE[type];
    const curr = lookupTier(X, col, table);
    if (!curr.next) {
      return { type, X, isMax: true, hasNext: false, need: 0, gain: 0, icon: '🏆', next: null };
    }
    const need = curr.next.min - X;
    const gain = curr.next.pt - curr.matched.pt;
    const paceRef = calcPaceRef(type, X);
    const paceNeeded = daysLeft > 0 ? need / daysLeft : need;
    const ratio = paceNeeded / paceRef;
    return {
      type, X,
      isMax: false,
      hasNext: true,
      need,
      gain,
      icon: iconFor(ratio),
      next: { min: curr.next.min, range: curr.next.range }
    };
  }

  function calcSuiteSummary(col) {
    const types = ['del', 'pick', 'ret'].map(t => {
      const X = (t === 'del' ? agg.del : t === 'pick' ? agg.pick : agg.ret)[col] || 0;
      return calcTypeInfo(t, col, X);
    });

    const allZero = types.every(t => t.X === 0);
    if (allZero) return { text: '—', icon: '', cls: 'is-empty' };

    const allMax = types.every(t => t.isMax || t.X === 0);
    if (allMax) return { text: 'max', icon: '🏆', cls: 'is-max' };

    let maxGain = 0;
    let worstRank = 0;
    types.forEach(t => {
      if (t.hasNext && t.gain > maxGain) maxGain = t.gain;
      if (t.hasNext) {
        const rank = _ICON_RANK[t.icon] || 1;
        if (rank > worstRank) worstRank = rank;
      }
    });

    return { text: `+${_fmt(maxGain)}đ`, icon: _RANK_ICON[worstRank] || '💪', cls: '' };
  }

  function renderTypeBlock(type, col) {
    const X = (type === 'del' ? agg.del : type === 'pick' ? agg.pick : agg.ret)[col] || 0;
    const typeLabel = type === 'del' ? 'Giao' : type === 'pick' ? 'Lấy' : 'Hoàn';
    const typeEmoji = type === 'del' ? '🔴' : type === 'pick' ? '🟡' : '🟢';

    // Chưa có đơn
    if (X === 0) {
      const info1 = calcTypeInfo(type, col, 0);
      if (!info1.hasNext) {
        return `
          <div class="nuoc-rut-type">
            <div class="nuoc-rut-type-head">${typeEmoji} ${typeLabel}<span class="nuoc-rut-current">— chưa có đơn</span></div>
            <div class="nuoc-rut-max">🏆 Đã đạt mốc cao nhất</div>
          </div>`;
      }
      const table = TYPE_TABLE[type];
      const m1 = { min: info1.next.min, need: info1.next.min, gain: info1.gain, icon: info1.icon };
      const curr2 = lookupTier(info1.next.min, col, table);
      const m2 = curr2.next
        ? (() => {
            const gain2 = curr2.next.pt - curr2.matched.pt;
            const need2 = curr2.next.min - 0;
            const paceRef = calcPaceRef(type, 0);
            const paceNeeded2 = daysLeft > 0 ? need2 / daysLeft : need2;
            return { min: curr2.next.min, need: need2, gain: gain2, icon: iconFor(paceNeeded2 / paceRef) };
          })()
        : null;

      const rows = [m1, m2].filter(Boolean).map(m => `
        <div class="nuoc-rut-row">
          <span class="nuoc-rut-need">+${_fmt(m.need)}</span>
          <span class="nuoc-rut-target">→ ${_fmt(m.min)}</span>
          <span class="nuoc-rut-gain">+${_fmt(m.gain)}đ</span>
          <span class="nuoc-rut-icon">${m.icon}</span>
        </div>`).join('');

      return `
        <div class="nuoc-rut-type">
          <div class="nuoc-rut-type-head">${typeEmoji} ${typeLabel}<span class="nuoc-rut-current">— chưa có đơn</span></div>
          ${rows}
        </div>`;
    }

    // Đã max
    const curr = lookupTier(X, col, TYPE_TABLE[type]);
    if (!curr.next) {
      return `
        <div class="nuoc-rut-type">
          <div class="nuoc-rut-type-head">${typeEmoji} ${typeLabel}<span class="nuoc-rut-current">— ${_fmt(X)} đơn</span></div>
          <div class="nuoc-rut-max">🏆 Đã đạt mốc cao nhất</div>
        </div>`;
    }

    // Có mốc → hiện 3 mốc cộng dồn
    const milestones = [];
    let prev = curr;
    for (let i = 0; i < 3; i++) {
      if (!prev.next) break;
      const next = prev.next;
      const need = next.min - X;
      const gain = next.pt - prev.matched.pt;
      const paceRef = calcPaceRef(type, X);
      const paceNeeded = daysLeft > 0 ? need / daysLeft : need;
      const ratio = paceNeeded / paceRef;
      milestones.push({ min: next.min, need, gain, icon: iconFor(ratio) });
      prev = lookupTier(next.min, col, TYPE_TABLE[type]);
    }

    const rows = milestones.map(m => `
      <div class="nuoc-rut-row">
        <span class="nuoc-rut-need">+${_fmt(m.need)}</span>
        <span class="nuoc-rut-target">→ ${_fmt(m.min)}</span>
        <span class="nuoc-rut-gain">+${_fmt(m.gain)}đ</span>
        <span class="nuoc-rut-icon">${m.icon}</span>
      </div>`).join('');

    return `
      <div class="nuoc-rut-type">
        <div class="nuoc-rut-type-head">${typeEmoji} ${typeLabel}<span class="nuoc-rut-current">— ${_fmt(X)} đơn</span></div>
        ${rows}
      </div>`;
  }

  // ===== Kiểm tra tất cả 5 dải đều max cả 3 loại =====
  const allSuitesMax = NUOC_RUT_SUITES.every(s => {
    return ['del', 'pick', 'ret'].every(t => {
      const X = (t === 'del' ? agg.del : t === 'pick' ? agg.pick : agg.ret)[s.col] || 0;
      if (X === 0) return true;
      return !lookupTier(X, s.col, TYPE_TABLE[t]).next;
    });
  });

  if (titleEl) {
    titleEl.innerText = `🎯 Nước rút 5 dải cân · Còn ${daysLeft} ngày`;
  }

  if (allSuitesMax) {
    body.innerHTML = `
      <div class="nuoc-rut-all-max">
        🎉 Cả 5 dải đã đạt mốc cao nhất
        <small>Bạn không cần "nước rút" nữa — quá đỉnh!</small>
      </div>`;
    card.style.display = 'block';
    return;
  }

  // ===== Render 5 dải accordion =====
  let html = '';
  NUOC_RUT_SUITES.forEach((suite, idx) => {
    const sum = calcSuiteSummary(suite.col);
    const autoOpen = idx === 0 ? ' open' : '';
    const arrow = idx === 0 ? '▼' : '▶';

    const typeBlocks =
      renderTypeBlock('del',  suite.col) +
      renderTypeBlock('pick', suite.col) +
      renderTypeBlock('ret',  suite.col);

    html += `
      <div class="nuoc-rut-suite${autoOpen}" id="nuoc-rut-suite-${suite.key}">
        <button class="nuoc-rut-suite-head" onclick="toggleNuocRutSuite('${suite.key}')" type="button">
          <span class="nuoc-rut-suite-arrow" data-arrow>${arrow}</span>
          <span class="nuoc-rut-suite-label">${suite.label}</span>
          <span class="nuoc-rut-suite-summary ${sum.cls}">${sum.text}${sum.icon ? ' ' + sum.icon : ''}</span>
        </button>
        <div class="nuoc-rut-suite-body">
          ${typeBlocks}
        </div>
      </div>`;
  });

  body.innerHTML = html;
  card.style.display = 'block';
}

export function toggleNuocRutSuite(key) {
  const el = document.getElementById('nuoc-rut-suite-' + key);
  if (!el) return;
  const isOpen = el.classList.toggle('open');
  const arrow = el.querySelector('[data-arrow]');
  if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
}

// ==================== RENDER HISTORY ====================
export function renderHistory() {
  const container = document.getElementById('historyEntries');
  if (!container) return;
  const prevScroll = container.scrollTop;
  container.innerHTML = '';

  const dateBtn = document.getElementById('histFilterDateBtn');
  if (dateBtn) dateBtn.classList.toggle('active', !!getHistFilters().date);

  const missedBanner = document.getElementById('missedDaysBanner');
  const missedText = document.getElementById('missedDaysText');
  
  if (missedBanner && missedText) {
    const missedCount = getHistFilters().date ? 0 : getMissedDaysInCurrentMonth();
    if (missedCount > 0) {
      missedText.innerHTML = `Chưa cập nhật <b>${missedCount} ngày</b>`;
      missedBanner.style.display = 'flex';
    } else {
      missedBanner.style.display = 'none';
    }
  }

  const btnDeleteMonth = document.getElementById('btnDeleteMonth');
  if (btnDeleteMonth) {
    const [by, bm] = (state.currentMonth || getCurrentMonthIso()).split('-');
    btnDeleteMonth.textContent = `🗑️ Xóa dữ liệu tháng ${parseInt(bm, 10)}/${by}`;
  }

  let list = [];
  ['delivery', 'pickup', 'return'].forEach(type => {
    if (!_histFilters.types[type]) return;
    state.appData[type].forEach(r => {
      if (recordPassesHistoryFilter(r, type)) list.push({ ...r, type });
    });
  });

  list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.id - a.id));

  if (list.length === 0) {
    const emptyMsg = hasActiveHistFilters() ? 'Không có bản ghi nào khớp bộ lọc.' : 'Chưa có bản ghi nào trong kỳ này.';
    container.innerHTML = `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding:20px">${emptyMsg}</div>`;
    return;
  }

  list.forEach(r => {
    let dayTotal = 0;
    const parts = [];
    WEIGHT_KEYS.forEach((k, col) => {
      const v = parseInt(r.weights[k], 10) || 0;
      dayTotal += v;
      if (v > 0) parts.push(`${WEIGHT_LABELS[col].replace('>', '').replace(' kg', '')}: ${_fmt(v)}`);
    });

    const tagMap = { delivery: ['tag-delivery', 'Giao'], pickup: ['tag-pickup', 'Lấy'], return: ['tag-return', 'Hoàn'] };
    const [tagClass, tagText] = tagMap[r.type];

    const div = document.createElement('div');
    div.className = 'history-entry';
    div.innerHTML = `<div>
      <div class="hist-meta"><span class="hist-badge-tag ${tagClass}">${tagText}</span>${formatDateDisplay(r.date)} · <span>${_fmt(dayTotal)} đơn</span></div>
      <div class="hist-detail">${parts.join(' • ') || '0 đơn'}</div></div>
      <div class="hist-actions">
        <button class="hist-btn hist-edit-btn" onclick="openEditModal('${r.type}', ${r.id})">Sửa</button>
        <button class="hist-btn hist-del-btn" onclick="deleteRecord('${r.type}', ${r.id})">Xóa</button>
      </div>`;
    container.appendChild(div);
  });

  requestAnimationFrame(() => { container.scrollTop = prevScroll; });
}
