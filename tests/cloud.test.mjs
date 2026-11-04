import { store, els, alerts, mkEl, flush } from './env.mjs';
globalThis.__autoEls = true;
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { state } = await import('../js/state.js');
const { WEIGHT_KEYS } = await import('../js/config.js');
const C = await import('../js/cloud.js');

const w = n => Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, i === 0 ? n : 0]));
const rec = (id, date, n) => ({ id, date, weights: w(n) });
let calls = [];
let plan;
globalThis.fetch = async (url, opt) => { calls.push([String(url), opt && opt.method]); return plan(String(url), opt); };
const okJson = body => ({ ok: true, status: 200, json: async () => body });

afterEach(flush);

beforeEach(() => {
  store.clear(); store.set('spx_gh_token_warn_ack', '1');
  calls = []; alerts.length = 0;
  plan = () => okJson({ id: 'gist123' });
  state.appData = { delivery: [], pickup: [], return: [] };
  state.salaryByMonth = {}; state.rankByMonth = {};
  els.ghTokenInput = mkEl('ghTokenInput');
  els.gistIdInput = mkEl('gistIdInput');
});

test('auto-backup với 0 bản ghi KHÔNG gọi mạng (không đè bản Cloud bằng dữ liệu rỗng)', async () => {
  store.set('spx_gh_token', 'tok');
  await C.pushToCloud({ auto: true });
  assert.equal(calls.length, 0);
});

test('backup tay với 0 bản ghi: Hủy → không gọi mạng; xác nhận → mới gọi', async () => {
  store.set('spx_gh_token', 'tok');
  globalThis.__confirmAnswer = false;
  await C.pushToCloud();
  assert.equal(calls.length, 0);
  globalThis.__confirmAnswer = true;
  await C.pushToCloud();
  assert.equal(calls.length, 1);
});

test('token mới chỉ được lưu SAU khi dùng được', async () => {
  state.appData = { delivery: [rec(1, '2026-10-01', 5)], pickup: [], return: [] };
  els.ghTokenInput.value = 'ghp_sai';
  plan = () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) });
  await C.pushToCloud();
  assert.equal(store.get('spx_gh_token'), undefined);

  els.ghTokenInput.value = 'ghp_dung';
  plan = () => okJson({ id: 'gistABC' });
  await C.pushToCloud();
  assert.equal(store.get('spx_gh_token'), 'ghp_dung');
  assert.equal(store.get('spx_gist_id'), 'gistABC');
});

test('backup lần đầu dùng POST /gists, các lần sau PATCH /gists/:id', async () => {
  store.set('spx_gh_token', 'tok');
  state.appData = { delivery: [rec(1, '2026-10-01', 5)], pickup: [], return: [] };
  await C.pushToCloud();
  assert.deepEqual(calls[0], ['https://api.github.com/gists', 'POST']);
  await C.pushToCloud();
  assert.deepEqual(calls[1], ['https://api.github.com/gists/gist123', 'PATCH']);
});

test('khôi phục: Gist lớn bị cắt (truncated) → tải bản đầy đủ từ raw_url', async () => {
  store.set('spx_gh_token', 'tok'); store.set('spx_gist_id', 'gistABC');
  els.gistIdInput.value = 'gistABC';
  const full = JSON.stringify({ version: 1, data: { delivery: [rec(7, '2026-10-05', 9)], pickup: [], return: [] } });
  plan = url => url.includes('raw.example')
    ? { ok: true, status: 200, text: async () => full }
    : okJson({ files: { 'spx-tracker-backup.json': { truncated: true, content: '{"cut', raw_url: 'https://raw.example/x' } } });
  globalThis.__confirmAnswer = true;
  await C.pullFromCloud();
  assert.ok(calls.some(c => c[0].includes('raw.example')));
  assert.equal(state.appData.delivery.length, 1);
  assert.equal(state.appData.delivery[0].id, 7);
});

test('khôi phục: Gist không hợp lệ không làm hỏng dữ liệu hiện tại', async () => {
  store.set('spx_gh_token', 'tok'); store.set('spx_gist_id', 'g');
  els.gistIdInput.value = 'g';
  state.appData = { delivery: [rec(1, '2026-10-01', 5)], pickup: [], return: [] };
  plan = () => okJson({ files: { 'spx-tracker-backup.json': { content: '{"hello":"world"}' } } });
  globalThis.__confirmAnswer = true;
  await C.pullFromCloud();
  assert.equal(state.appData.delivery.length, 1);
});
