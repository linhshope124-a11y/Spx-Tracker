// Kiểm tra tính nhất quán của CẢ repo (tĩnh, không cần DOM): bắt các lỗi kiểu
// "import tên không tồn tại", "onclick gọi hàm chưa export", "sw.js liệt kê file không có",
// "quên bump CACHE", "ảnh trong manifest sai kích thước".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(dir + '/' + e.name) : e.name.endsWith('.js') ? [dir + '/' + e.name] : []);
const jsFiles = walk('js');                                        // ['js/main.js', 'js/ocr/parser.js', ...]
const src = Object.fromEntries(jsFiles.map(f => [f, read(f)]));
const resolveImport = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));

// ───────── import / export giữa các module ─────────
function exportsOf(s) {
  const out = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
    m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean).forEach(n => out.add(n));
  }
  return out;
}
// Danh sách import tĩnh của 1 file: [{ names:[...], target:'js/x.js' }]
function importsOf(file) {
  const s = src[file], out = [];
  const add = (names, spec) => out.push({ names: names.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split(',').map(x => x.trim().split(/\s+as\s+|:/)[0].trim()).filter(Boolean), target: resolveImport(file, spec) });
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) add(m[1], m[2]);
  for (const m of s.matchAll(/const\s*\{([^}]*)\}\s*=\s*await import\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) add(m[1], m[2]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) add(m[1], m[2]);
  for (const m of s.matchAll(/import\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.push({ names: [], target: resolveImport(file, m[1]) });
  return out;
}
test('mọi tên được import đều tồn tại trong module nguồn', () => {
  const exp = Object.fromEntries(jsFiles.map(f => [f, exportsOf(src[f])]));
  const problems = [];
  for (const file of jsFiles) {
    for (const { names, target } of importsOf(file)) {
      assert.ok(exp[target], `${file} import từ module không tồn tại: ${target}`);
      for (const n of names) if (!exp[target].has(n)) problems.push(`${file}: '${n}' không được export bởi ${target}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('không có vòng import giữa các module (ES module vòng tròn dễ lỗi TDZ khi nạp)', () => {
  const graph = Object.fromEntries(jsFiles.map(f => [f, [...new Set(importsOf(f).map(i => i.target))]]));
  const state = {}, stack = [], cycles = [];
  const dfs = u => {
    state[u] = 1; stack.push(u);
    for (const v of graph[u] || []) {
      if (state[v] === 1) cycles.push([...stack.slice(stack.indexOf(v)), v].join(' → '));
      else if (!state[v]) dfs(v);
    }
    stack.pop(); state[u] = 2;
  };
  jsFiles.forEach(f => { if (!state[f]) dfs(f); });
  assert.deepEqual(cycles, []);
});

test('js/ocr/parser.js thuần logic: chỉ phụ thuộc config + utils (không DOM, không state, không UI)', () => {
  const deps = importsOf('js/ocr/parser.js').map(i => i.target).sort();
  assert.deepEqual(deps, ['js/config.js', 'js/utils.js']);
  assert.ok(!/\bdocument\.|\bwindow\.|localStorage/.test(src['js/ocr/parser.js']));
});

test('OCR tầng thấp (abort / worker / preprocess / detect) không kéo theo UI hay state', () => {
  const ok = new Set(['js/config.js', 'js/ocr/abort.js']);
  for (const f of ['js/ocr/abort.js', 'js/ocr/worker.js', 'js/ocr/preprocess.js', 'js/ocr/detect.js']) {
    for (const { target } of importsOf(f)) assert.ok(ok.has(target), `${f} không được import ${target}`);
  }
});

test('OCR: bên ngoài chỉ import từ cổng js/ocr/index.js, không với tay vào module con', () => {
  const bad = [];
  for (const f of jsFiles.filter(f => !f.startsWith('js/ocr/'))) {
    for (const { target } of importsOf(f)) if (target.startsWith('js/ocr/') && target !== 'js/ocr/index.js') bad.push(`${f} → ${target}`);
  }
  assert.deepEqual(bad, []);
});

test('các symbol đã gỡ không còn bị tham chiếu', () => {
  const all = Object.values(src).join('\n') + read('index.html');
  // (undoLastDelete của js/undo.js là hàm khác và vẫn đang dùng → chỉ bắt đúng tên undoLast)
  for (const re of [/\bundoLast\b/, /setOverviewFilter/, /updateThemeBtnUI/, /clearAllConfidenceHighlights(?!Local)/]) {
    assert.ok(!re.test(all), `còn tham chiếu ${re}`);
  }
});

// ───────── onclick trong HTML ↔ hàm đã gắn vào window ─────────
test('mọi hàm gọi từ thuộc tính on*="" trong index.html đều đã gắn vào window', () => {
  const main = src['js/main.js'];
  const block = main.slice(main.indexOf('Object.assign(window,'));
  const onWindow = new Set(block.slice(0, block.indexOf('\n});')).match(/[A-Za-z_$][\w$]*/g));
  for (const m of Object.values(src).join('\n').matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) onWindow.add(m[1]);

  const skip = new Set(['if', 'for', 'while', 'return', 'function', 'parseInt', 'parseFloat', 'setTimeout', 'confirm', 'alert', 'Number', 'String', 'Math', 'isNaN']);
  const used = new Set();
  for (const a of read('index.html').matchAll(/\bon[a-z]+="([^"]*)"/g)) {
    for (const f of a[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (!skip.has(f[1])) used.add(f[1]);
  }
  assert.ok(used.size > 20, 'phải bắt được các handler trong HTML');
  assert.deepEqual([...used].filter(n => !onWindow.has(n)), []);
});

test('index.html: id không trùng; file cục bộ được tham chiếu đều tồn tại', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.filter((v, i) => ids.indexOf(v) !== i), []);
  for (const m of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)) assert.ok(exists(m[1].slice(2)), `thiếu file: ${m[1]}`);
});

// ───────── Service Worker / version / manifest ─────────
const sw = read('sw.js');
const arr = name => [...sw.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`))[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('sw.js: mọi file trong CORE đều tồn tại (thiếu 1 file là Service Worker không cài được)', () => {
  const core = arr('CORE');
  assert.ok(core.length > 10);
  assert.deepEqual(core.filter(p => p !== './' && !exists(p.slice(2))), []);
});

test('sw.js: mọi file js/ đều nằm trong CORE (thêm module mới mà quên → offline vỡ)', () => {
  const core = new Set(arr('CORE').map(p => p.replace(/^\.\//, '')));
  assert.deepEqual(jsFiles.filter(f => !core.has(f)), []);
  assert.deepEqual([...core].filter(p => p.startsWith('js/') && !jsFiles.includes(p)), []);
});

test('phiên bản đồng bộ: version.json = CACHE trong sw.js = meta spx-app-version trong index.html', () => {
  const v = JSON.parse(read('version.json')).version;
  assert.equal(sw.match(/const CACHE\s*=\s*'([^']+)'/)[1], 'spx-tracker-' + v, 'CACHE trong sw.js');
  assert.equal(read('index.html').match(/name="spx-app-version"\s+content="([^"]+)"/)[1], v, 'meta spx-app-version');
});

test('Tesseract: URL thư viện được ghim phiên bản và trùng nhau giữa ocr.js và sw.js', () => {
  const lib = src['js/ocr/worker.js'].match(/TESSERACT_LIB_URL\s*=\s*'([^']+)'/)[1];
  assert.match(lib, /tesseract\.js@\d+\.\d+\.\d+\//, 'phải ghim phiên bản đầy đủ');
  assert.ok(arr('TESS_RUNTIME_URLS').includes(lib), 'sw.js phải precache đúng URL này');
  const prefixes = arr('TESS_URL_PREFIXES');
  assert.ok(prefixes.some(p => lib.startsWith(p)));
  assert.ok(prefixes.some(p => 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js'.startsWith(p)), 'phải bao cả core');
  assert.ok(prefixes.some(p => 'https://tessdata.projectnaptha.com/4.0.0/vie.traineddata.gz'.startsWith(p)), 'phải bao cả dữ liệu tiếng Việt');
});

function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];   // PNG: IHDR
  if (buf[0] === 0xff && buf[1] === 0xd8) {                                                      // JPEG: tìm khối SOF
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const mk = buf[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  throw new Error('không đọc được kích thước ảnh');
}

test('manifest.json: icon và screenshot tồn tại và đúng kích thước khai báo', () => {
  const m = JSON.parse(read('manifest.json'));
  for (const it of [...m.icons, ...(m.screenshots || [])]) {
    const p = it.src.replace(/^\.\//, '');
    assert.ok(exists(p), `thiếu ${p}`);
    const [w, h] = imageSize(fs.readFileSync(path.join(root, p)));
    assert.equal(it.sizes, `${w}x${h}`, `${p}: khai báo ${it.sizes} nhưng ảnh thật ${w}x${h}`);
  }
  assert.ok(m.screenshots?.length >= 1);
});

test('manifest.json: share_target trỏ tới đường dẫn mà sw.js xử lý', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.share_target.method, 'POST');
  assert.ok(sw.includes(path.basename(m.share_target.action)), 'sw.js phải xử lý ' + m.share_target.action);
});

test('mọi modal trong index.html đều có role="dialog" + aria-modal (trình đọc màn hình)', () => {
  const html = read('index.html');
  const modals = [...html.matchAll(/<div class="modal-shade"[^>]*\bid="([^"]+)"[^>]*>\s*<div class="modal-box[^"]*"([^>]*)>/g)];
  assert.ok(modals.length >= 9, 'phải bắt được các modal');
  const bad = modals.filter(m => !/role="dialog"/.test(m[2]) || !/aria-modal="true"/.test(m[2])).map(m => m[1]);
  assert.deepEqual(bad, []);
});

test('manifest: icon maskable dùng file RIÊNG (không chung với icon thường) và có trong CORE', () => {
  const m = JSON.parse(read('manifest.json'));
  const any = new Set(m.icons.filter(i => (i.purpose || 'any') === 'any').map(i => i.src));
  const mask = m.icons.filter(i => i.purpose === 'maskable').map(i => i.src);
  assert.ok(mask.length >= 2);
  assert.deepEqual(mask.filter(s => any.has(s)), []);
  const core = new Set(arr('CORE'));
  assert.deepEqual(m.icons.map(i => i.src).filter(s => !core.has(s)), []);
});

test('sw.js: precache bỏ qua cache HTTP (cache: "reload") để bản mới không chứa file cũ', () => {
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.match(install, /new Request\(\s*url\s*,\s*\{\s*cache:\s*'reload'\s*\}\s*\)/);
  assert.ok(!/addAll\(CORE\)/.test(install), 'không được addAll(CORE) trực tiếp');
});

// ───────── hướng dẫn sử dụng (guide.html) ─────────
// Lỗi thật từng gặp: guide.html bị ghi đè bằng bản sao của index.html → bấm "Hướng dẫn sử dụng" chỉ mở lại chính app.
const guide = read('guide.html');

test('guide.html là TRANG HƯỚNG DẪN riêng, không phải bản sao của app', () => {
  assert.match(guide.match(/<title>([\s\S]*?)<\/title>/)[1], /Hướng dẫn/);
  assert.ok(!/js\/main\.js/.test(guide), 'không được nạp mã app (js/main.js)');
  assert.ok(!/name="spx-app-version"/.test(guide), 'không phải index.html');
  assert.notEqual(guide.slice(0, 1500), read('index.html').slice(0, 1500));
  assert.match(guide, /href="\.\/index\.html"/, 'phải có nút quay lại app');
  assert.match(guide, /Hướng dẫn sử dụng/);
});

test('guide.html tự chứa: không tải font/CSS/JS từ máy chủ ngoài (xem được khi offline, không lộ IP)', () => {
  const external = [...guide.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(u => !/github\.com\/settings/.test(u));
  assert.deepEqual(external, []);
  assert.ok(!/@import\s+url\(['"]?https?:/.test(guide));
});

test('guide.html: cấu trúc hợp lệ — id mục khớp onclick, đánh số liên tục, số mục của nhóm đúng', () => {
  const ids = [...guide.matchAll(/<div class="g-acc"\s+id="(sec-\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'id mục không trùng');
  for (const m of guide.matchAll(/toggleSection\('(sec-\d+)'\)/g)) assert.ok(ids.includes(m[1]), `thiếu ${m[1]}`);
  const nums = [...guide.matchAll(/<span class="g-acc-num">(\d+)<\/span>/g)].map(m => +m[1]);
  assert.deepEqual(nums, ids.map((_, i) => i + 1), 'số hiển thị phải là 1..N theo thứ tự trong trang');
  const groups = guide.split('<div class="g-group">').slice(1);
  assert.ok(groups.length >= 4);
  for (const grp of groups) {
    const declared = +grp.match(/<span class="count">(\d+) mục<\/span>/)[1];
    assert.equal((grp.match(/<div class="g-acc"/g) || []).length, declared, 'số mục khai báo ở đầu nhóm');
  }
});

test('guide.html nói đúng về app hiện tại: có Hoàn tác, Ngày chưa cập nhật, Xóa dữ liệu tháng; không còn "KHÔNG CÓ HOÀN TÁC"', () => {
  for (const k of ['Hoàn tác', 'Ngày chưa cập nhật', 'Xóa dữ liệu tháng', 'Sao lưu &amp; Xóa']) assert.ok(guide.includes(k), k);
  assert.ok(!/KHÔNG CÓ HOÀN TÁC/.test(guide));
  assert.ok(!/No expiration/.test(guide.replace(/không chọn vô thời hạn/, '')), 'khuyến nghị hạn token, không phải vô thời hạn');
  assert.match(guide, /xóa luôn số liệu trên máy/i, 'cảnh báo xóa dữ liệu trang web = mất dữ liệu');
});

test('Menu của app trỏ tới guide.html và file đó nằm trong danh sách precache', () => {
  assert.match(read('index.html'), /<a class="menu-item" href="\.\/guide\.html"/);
  assert.ok(arr('CORE').includes('./guide.html'));
});

