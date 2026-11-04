import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const U = await import('../js/utils.js');

test('isValidIsoDate: chỉ nhận ngày có thật (kể cả năm nhuận)', () => {
  for (const d of ['2026-10-17', '2024-02-29', '2026-12-31', '2026-01-01']) assert.equal(U.isValidIsoDate(d), true, d);
  for (const d of ['2026-04-31', '2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', 'abc', '', null, undefined, 20261017]) {
    assert.equal(U.isValidIsoDate(d), false, String(d));
  }
});

test('sanitizeInt: chỉ giữ số nguyên dương', () => {
  assert.equal(U.sanitizeInt('5'), 5);
  assert.equal(U.sanitizeInt(7.9), 7);
  for (const v of [-3, '-3', 0, '', 'abc', null, undefined, NaN, Infinity]) assert.equal(U.sanitizeInt(v), 0, String(v));
});

test('generateId: tăng dần và không bao giờ trùng', () => {
  const ids = Array.from({ length: 5000 }, () => U.generateId());
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);
  assert.ok(Number.isSafeInteger(ids.at(-1)));
});

test('escapeHtml: escape đủ 5 ký tự nguy hiểm', () => {
  assert.equal(U.escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(U.escapeHtml(123), '123');
});

test('formatDateDisplay / formatMonthLabel', () => {
  assert.equal(U.formatDateDisplay('2026-10-17'), '17/10/2026');
  assert.equal(U.formatDateDisplay(''), '');
  assert.equal(U.formatMonthLabel('2026-10'), 'Tháng 10/2026');
  assert.equal(U.formatMonthLabel('xx'), '');
});
