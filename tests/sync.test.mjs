// scripts/sync.mjs — tự sinh danh sách precache + đồng bộ phiên bản.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeCore, check, apply, nextVersion, readVersion } from '../scripts/sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function cloneRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spx-sync-'));
  for (const p of ['manifest.json', 'version.json', 'sw.js', 'index.html', 'guide.html', 'css', 'js', 'icons', 'scripts']) {
    fs.cpSync(path.join(root, p), path.join(tmp, p), { recursive: true });
  }
  return tmp;
}
const rd = (r, p) => fs.readFileSync(path.join(r, p), 'utf8');
const coreOf = r => [...rd(r, 'sw.js').match(/const CORE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const cli = (r, ...args) => spawnSync(process.execPath, [path.join(r, 'scripts/sync.mjs'), ...args], { encoding: 'utf8' });

test('repo hiện tại không bị lệch (CORE, CACHE, meta đều khớp thư mục thật + version.json)', () => {
  assert.deepEqual(check(root), []);
});

test('CORE tự sinh: có ./, trang, manifest, icon trong manifest, css và MỌI file js (kể cả js/ocr/)', () => {
  const core = computeCore(root);
  for (const p of ['./', './index.html', './guide.html', './manifest.json', './css/style.css', './js/main.js', './js/ocr/index.js', './js/ocr/parser.js', './icons/icon-maskable-512.png']) {
    assert.ok(core.includes(p), p);
  }
  assert.equal(new Set(core).size, core.length, 'không trùng');
});

test('thêm module mới → check báo lệch; apply đưa vào CORE; sau đó khớp lại', () => {
  const r = cloneRepo();
  fs.writeFileSync(path.join(r, 'js/ocr/extra.js'), 'export const x = 1;\n');
  assert.deepEqual(check(r), ['sw.js']);
  assert.equal(cli(r, '--check').status, 1);
  apply(r);
  assert.ok(coreOf(r).includes('./js/ocr/extra.js'));
  assert.deepEqual(check(r), []);
  assert.equal(cli(r, '--check').status, 0);
});

test('xóa module → CORE tự bỏ (không còn liệt kê file không tồn tại)', () => {
  const r = cloneRepo();
  fs.rmSync(path.join(r, 'js/theme.js'));
  apply(r);
  assert.ok(!coreOf(r).includes('./js/theme.js'));
});

test('manifest trỏ tới icon không tồn tại → lỗi rõ ràng, không sinh danh sách hỏng', () => {
  const r = cloneRepo();
  fs.rmSync(path.join(r, 'icons/icon-maskable-192.png'));
  assert.throws(() => computeCore(r), /icon-maskable-192\.png/);
  assert.equal(cli(r).status, 2);
});

test('bump: v2.7 → v2.8 đồng bộ cả version.json, CACHE trong sw.js và meta trong index.html', () => {
  assert.equal(nextVersion('v2.7'), 'v2.8');
  assert.equal(nextVersion('v2.9'), 'v2.10');
  const r = cloneRepo();
  const before = readVersion(r);
  const out = cli(r, '--bump');
  assert.equal(out.status, 0, out.stderr);
  const v = nextVersion(before);
  assert.equal(readVersion(r), v);
  assert.match(rd(r, 'sw.js'), new RegExp(`const CACHE\\s*=\\s*'spx-tracker-${v.replace('.', '\\.')}'`));
  assert.match(rd(r, 'index.html'), new RegExp(`name="spx-app-version"\\s+content="${v.replace('.', '\\.')}"`));
  assert.match(JSON.parse(rd(r, 'version.json')).released, /^\d{4}-\d{2}-\d{2}T00:00:00\+07:00$/);
  assert.deepEqual(check(r), []);
});

test('--set: đặt phiên bản tuỳ ý; sai định dạng bị từ chối và không ghi gì', () => {
  const r = cloneRepo();
  assert.equal(cli(r, '--set', 'v3.0').status, 0);
  assert.equal(readVersion(r), 'v3.0');
  const swBefore = rd(r, 'sw.js');
  assert.equal(cli(r, '--set', '3').status, 2);
  assert.equal(rd(r, 'sw.js'), swBefore);
});

test('thiếu marker trong sw.js → từ chối thay vì ghi đè bừa', () => {
  const r = cloneRepo();
  fs.writeFileSync(path.join(r, 'sw.js'), rd(r, 'sw.js').replace('// <sync:core>', '// (đã xóa marker)'));
  assert.throws(() => check(r), /marker/);
});

test('apply lần 2 là idempotent (không đổi gì)', () => {
  const r = cloneRepo();
  apply(r);
  assert.deepEqual(apply(r).changed, []);
});
