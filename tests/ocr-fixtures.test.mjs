// Hồi quy parser OCR trên các văn bản OCR thật/mô phỏng trong tests/fixtures/ocr/*.json
// Thêm ca mới từ ảnh thật: xem hướng dẫn đầu scripts/ocr-fixture.mjs (hoặc tests/fixtures/ocr/README.md).
import './env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { parseOcrText, extractDateStrict, postProcessFixDigits } = await import('../js/ocr/parser.js');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ocr');
const fixtures = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
afterEach(() => mock.timers.reset());

test('có ít nhất 15 fixture (gồm ảnh thật) và schema hợp lệ', () => {
  assert.ok(fixtures.length >= 15);
  assert.ok(fixtures.filter(f => f.source !== 'synthetic').length >= 7, 'phải có ≥ 7 ca từ ảnh/app thật');
  const KEYS = ['0_2', '2_4', '4_6', '6_8', '8_10', '10_12', '12_15', 'over_15'];
  for (const f of fixtures) {
    assert.equal(f.file, f.name + '.json', `tên file ≠ name trong ${f.file}`);
    assert.ok(['real', 'real-image', 'synthetic'].includes(f.source), f.file);
    assert.match(f.now, /^\d{4}-\d{2}-\d{2}$/, f.file);
    assert.ok(f.rawText.trim().length > 0, f.file);
    if (f.safety !== 'must-not-verify') assert.deepEqual(Object.keys(f.expected.weights), KEYS, f.file);
    assert.ok('total' in f.expected && 'date' in f.expected, f.file);
  }
});

for (const f of fixtures) {
  test(`OCR fixture [${f.source}] ${f.name}`, () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(`${f.now}T12:00:00`) });
    const parsed = parseOcrText(f.rawText);
    // Giống pipeline thật: chỉ thử sửa chữ số khi có Tổng và tổng các dải lệch
    const final = postProcessFixDigits(parsed) || parsed;
    assert.equal(final.expectedTotal, f.expected.total, 'Tổng đọc trong ảnh');
    assert.equal(extractDateStrict(f.rawText), f.expected.date, 'ngày');
    if (f.safety === 'must-not-verify') {
      // OCR đọc hỏng số → kết quả KHÔNG được trông như "đã khớp Tổng" (nếu khớp, app có thể tự lưu sai)
      assert.notEqual(final.totalFound, final.expectedTotal, 'không được coi là đã đối chiếu khớp');
      return;
    }
    assert.deepEqual(final.weights, f.expected.weights, `số đơn theo dải — ${f.note}`);
  });
}
