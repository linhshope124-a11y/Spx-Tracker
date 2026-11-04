// Biến một lần quét OCR thật thành bài kiểm tra hồi quy cho parser.
//
//   1. Trong app: quét ảnh → ở form kết quả bấm "Copy log" (hoặc dán văn bản OCR thô).
//   2. Dán vào một file, ví dụ log.txt.
//   3. Xem parser hiện đọc ra gì:
//        node scripts/ocr-fixture.mjs ten-ca-test log.txt
//   4. ĐỐI CHIẾU với ảnh gốc. Nếu đúng → lưu làm đáp án:
//        node scripts/ocr-fixture.mjs ten-ca-test log.txt --accept
//      Nếu parser đọc SAI, đưa đáp án đúng (đọc từ ảnh) rồi lưu — test sẽ đỏ cho tới khi parser được sửa:
//        node scripts/ocr-fixture.mjs ten-ca-test log.txt --weights 60,25,10,5,0,0,0,0 --total 100 --date 2026-10-17
//
//   Tuỳ chọn: --now YYYY-MM-DD (ngày chụp ảnh, mặc định hôm nay — cần khi ảnh không ghi năm)
//
// Thứ tự dải cân của --weights: 0_2, 2_4, 4_6, 6_8, 8_10, 10_12, 12_15, over_15.
// Ảnh chứa thông tin cá nhân thì KHÔNG cần lưu ảnh — fixture chỉ lưu văn bản OCR thô (hãy xóa tên/SĐT trong log trước).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOcrText, extractDateStrict, postProcessFixDigits } from '../js/ocr/parser.js';

const KEYS = ['0_2', '2_4', '4_6', '6_8', '8_10', '10_12', '12_15', 'over_15'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [name, file] = pos;
if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name) || !file) {
  console.error('Cách dùng: node scripts/ocr-fixture.mjs <ten-ca-test> <log.txt> [--accept | --weights … --total N --date YYYY-MM-DD] [--now YYYY-MM-DD]');
  process.exit(2);
}

// Tách văn bản thô khỏi 2 dòng đầu "[mode: …]" "[Sum: … / Total: …]" mà nút Copy log thêm vào
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
let i = 0;
while (i < lines.length && /^\s*\[(mode|Sum):/.test(lines[i])) i++;
while (i < lines.length && !lines[i].trim()) i++;
const rawText = lines.slice(i).join('\n').trim();
if (!rawText) { console.error('Log rỗng.'); process.exit(2); }

// Cố định "hôm nay" để suy năm khi ảnh chỉ ghi dd/mm
const now = flag('now', new Date().toISOString().slice(0, 10));
const RealDate = Date;
const fixed = new RealDate(`${now}T12:00:00`);
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
  static now() { return fixed.getTime(); }
};

const parsed = parseOcrText(rawText);
const fixedParse = postProcessFixDigits(parsed);
const final = fixedParse || parsed;
const date = extractDateStrict(rawText);
console.log(`Parser đọc được (chế độ: ${final.mode}${fixedParse ? ', ĐÃ tự sửa 1 chữ số' : ''}):`);
KEYS.forEach(k => final.weights[k] && console.log(`  ${k.padEnd(8)} ${final.weights[k]}`));
console.log(`  Tổng đọc trong ảnh : ${final.expectedTotal ?? '(không thấy)'}   | Cộng các dải: ${final.totalFound}`);
console.log(`  Ngày               : ${date ?? '(không thấy)'}`);

let expected;
if (argv.includes('--accept')) {
  expected = { weights: Object.fromEntries(KEYS.map(k => [k, final.weights[k]])), total: final.expectedTotal, date };
} else if (flag('weights')) {
  const w = flag('weights').split(',').map(Number);
  if (w.length !== 8 || w.some(n => !Number.isInteger(n) || n < 0)) { console.error('--weights cần đúng 8 số nguyên ≥ 0'); process.exit(2); }
  expected = { weights: Object.fromEntries(KEYS.map((k, j) => [k, w[j]])), total: flag('total') === undefined ? null : Number(flag('total')), date: flag('date') ?? null };
} else {
  console.log('\n(Chưa ghi gì. Đối chiếu với ảnh gốc rồi chạy lại với --accept hoặc --weights … để lưu.)');
  process.exit(0);
}
const out = { name, source: 'real', note: '', now, rawText, expected };
const dest = path.join(root, 'tests/fixtures/ocr', name + '.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`\n✔ Đã lưu ${path.relative(root, dest)} — chạy \`npm test\` để kiểm tra.`);
