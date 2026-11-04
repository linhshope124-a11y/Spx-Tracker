// Đồng bộ các thứ PHẢI khớp nhau nhưng trước đây phải sửa tay (và đã lệch nhiều lần):
//   • sw.js      → danh sách precache CORE (tự quét thư mục thật) + tên cache `spx-tracker-<ver>`
//   • index.html → <meta name="spx-app-version">
//   • version.json → số phiên bản (nguồn duy nhất) + thời điểm phát hành
//
//   npm run sync              ghi lại các file cho khớp với thư mục thật
//   npm run sync -- --check   chỉ kiểm tra, có lệch thì thoát mã 1 (dùng trong CI / npm test)
//   npm run bump              tăng phiên bản nhỏ (v2.7 → v2.8) rồi đồng bộ
//   npm run sync -- --set v3.0
//
// Không phụ thuộc gói nào (chỉ Node ≥ 20).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARK_BEGIN = '// <sync:core>';
const MARK_END = '// </sync:core>';

const rd = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const wr = (root, p, s) => fs.writeFileSync(path.join(root, p), s);

function walk(root, dir, ext) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(root, dir + '/' + e.name, ext)
      : e.name.endsWith(ext) ? [dir + '/' + e.name] : []);
}

/** Danh sách file cần precache, đúng thứ tự ổn định. */
export function computeCore(root) {
  const manifest = JSON.parse(rd(root, 'manifest.json'));
  const icons = [...new Set((manifest.icons || []).map(i => i.src.replace(/^\.\//, '')))];
  const list = [
    './', './index.html', './guide.html', './manifest.json',
    ...icons.map(p => './' + p),
    ...walk(root, 'css', '.css').sort().map(p => './' + p),
    ...walk(root, 'js', '.js').sort().map(p => './' + p)
  ];
  const missing = list.filter(p => p !== './' && !fs.existsSync(path.join(root, p)));
  if (missing.length) throw new Error('Tham chiếu tới file không tồn tại: ' + missing.join(', '));
  return list;
}

const renderCore = list =>
  `${MARK_BEGIN} — TỰ SINH bởi \`npm run sync\` (scripts/sync.mjs). Đừng sửa tay trong khối này.\n` +
  `const CORE = [\n${list.map(p => `  '${p}'`).join(',\n')}\n];\n${MARK_END}`;

export function readVersion(root) {
  const v = JSON.parse(rd(root, 'version.json')).version;
  if (!/^v\d+\.\d+$/.test(String(v))) throw new Error(`version.json: "${v}" không đúng dạng vX.Y`);
  return v;
}

export function nextVersion(v) {
  const [, maj, min] = v.match(/^v(\d+)\.(\d+)$/);
  return `v${maj}.${Number(min) + 1}`;
}

const nowIso = () => {                       // giờ Việt Nam (+07:00), cắt về 00:00 cho gọn
  const d = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return `${d}T00:00:00+07:00`;
};

/** Trả về nội dung mong muốn của từng file (không ghi). */
export function desired(root, version = readVersion(root)) {
  let sw = rd(root, 'sw.js');
  const b = sw.indexOf(MARK_BEGIN), e = sw.indexOf(MARK_END);
  if (b < 0 || e < b) throw new Error(`sw.js thiếu cặp marker ${MARK_BEGIN} … ${MARK_END}`);
  sw = sw.slice(0, b) + renderCore(computeCore(root)) + sw.slice(e + MARK_END.length);
  const cacheLine = `const CACHE       = 'spx-tracker-${version}';    // tự sinh bởi scripts/sync.mjs (nguồn: version.json)`;
  if (!/^const CACHE\s*=.*$/m.test(sw)) throw new Error('sw.js: không thấy dòng `const CACHE = …`');
  sw = sw.replace(/^const CACHE\s*=.*$/m, cacheLine);

  let html = rd(root, 'index.html');
  if (!/name="spx-app-version"\s+content="[^"]*"/.test(html)) throw new Error('index.html: thiếu <meta name="spx-app-version">');
  html = html.replace(/(name="spx-app-version"\s+content=")[^"]*(")/, `$1${version}$2`);

  return { 'sw.js': sw, 'index.html': html };
}

export function check(root) {
  const want = desired(root);
  return Object.entries(want).filter(([f, s]) => rd(root, f) !== s).map(([f]) => f);
}

export function apply(root, { version, released = false } = {}) {
  const v = version || readVersion(root);
  if (version || released) {
    wr(root, 'version.json', JSON.stringify({ version: v, released: nowIso() }, null, 2) + '\n');
  }
  const want = desired(root, v);
  const changed = [];
  for (const [f, s] of Object.entries(want)) if (rd(root, f) !== s) { wr(root, f, s); changed.push(f); }
  return { version: v, changed };
}

// ───────── CLI ─────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  try {
    if (args.includes('--check')) {
      const drift = check(root);
      if (drift.length) {
        console.error(`✘ Lệch: ${drift.join(', ')}\n  Chạy \`npm run sync\` để sửa.`);
        process.exit(1);
      }
      console.log(`✔ sw.js (CORE + CACHE), index.html (meta) và version.json đã khớp — ${readVersion(root)}`);
    } else {
      let version;
      if (args.includes('--bump')) version = nextVersion(readVersion(root));
      const i = args.indexOf('--set');
      if (i >= 0) version = args[i + 1];
      if (version && !/^v\d+\.\d+$/.test(version)) throw new Error(`Phiên bản "${version}" không đúng dạng vX.Y`);
      const r = apply(root, { version });
      console.log(r.changed.length ? `✔ ${r.version}: đã cập nhật ${r.changed.join(', ')}` : `✔ ${r.version}: không có gì cần đổi`);
    }
  } catch (err) {
    console.error('✘ ' + err.message);
    process.exit(2);
  }
}
