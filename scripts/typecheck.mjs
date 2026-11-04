// Kiểm tra kiểu / import / biến thừa bằng TypeScript (checkJs) — không đổi code, không build.
//
//   npm run typecheck
//
// Bắt được: dùng tên không tồn tại, import không được export, import/biến khai báo mà không dùng,
// gọi hàm sai số tham số, gõ sai tên thuộc tính trên đối tượng đã biết kiểu...
//
// Lọc 1 loại nhiễu có chủ đích: `document.getElementById('x').value` — getElementById trả về HTMLElement
// nên TypeScript báo "Property 'value' does not exist". Ép kiểu cả ~100 chỗ không đem lại giá trị,
// nên các lỗi TS2339 trên HTMLElement/Element/EventTarget được đếm riêng và bỏ qua.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function findTsc() {
  try { return [process.execPath, [require.resolve('typescript/bin/tsc', { paths: [root] })]]; } catch { /* dùng tsc trong PATH */ }
  return ['tsc', []];
}
const [cmd, pre] = findTsc();
const r = spawnSync(cmd, [...pre, '-p', path.join(root, 'tsconfig.json'), '--pretty', 'false'], { cwd: root, encoding: 'utf8' });
if (r.error) {
  console.error('Không chạy được TypeScript (tsc). Cài bằng: npm install   (hoặc npm i -D typescript)');
  process.exit(2);
}

const NOISE = /^TS2339: Property '[^']+' does not exist on type '(HTMLElement|Element|EventTarget)'\.$/;
const lines = (r.stdout + r.stderr).split('\n').filter(l => /error TS\d+:/.test(l));
let noise = 0;
const real = [];
for (const l of lines) {
  const m = l.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (!m) { real.push(l); continue; }
  if (NOISE.test(`${m[4]}: ${m[5]}`)) { noise++; continue; }
  real.push(`${path.relative(root, m[1])}:${m[2]}:${m[3]}  ${m[4]}  ${m[5]}`);
}
real.forEach(l => console.log(l));
console.log(`\ntypecheck: ${real.length} lỗi` + (noise ? ` (bỏ qua ${noise} cảnh báo DOM HTMLElement)` : ''));
process.exit(real.length ? 1 : 0);
