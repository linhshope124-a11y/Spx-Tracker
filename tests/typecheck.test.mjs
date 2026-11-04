// Chạy `npm run typecheck` trong npm test để import thừa / tên không tồn tại / sai số tham số không lọt qua.
// (Bỏ qua nếu máy chưa có TypeScript — chạy `npm install` để có.)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('typecheck (tsc checkJs): không có lỗi kiểu / import thừa / tên không tồn tại', t => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/typecheck.mjs')], { cwd: root, encoding: 'utf8' });
  if (r.status === 2) return t.skip('chưa có TypeScript (npm install)');
  assert.equal(r.status, 0, '\n' + r.stdout + r.stderr);
});
