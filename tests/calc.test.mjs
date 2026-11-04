import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const C = await import('../js/config.js');
const K = await import('../js/calc.js');

const TABLES = { 'Giao (TABLE_5)': C.TABLE_5_DATA, 'Lấy (TABLE_4)': C.TABLE_4_DATA, 'Hoàn (TABLE_6)': C.TABLE_6_DATA };

for (const [name, T] of Object.entries(TABLES)) {
  test(`bảng điểm ${name}: dòng liên tục, điểm không giảm khi sản lượng tăng, dòng cuối vô hạn`, () => {
    assert.equal(T.at(-1).max, Infinity);
    T.forEach((r, i) => {
      assert.equal(r.pts.length, 8, `dòng ${i}`);
      if (i === 0) return;
      assert.equal(T[i - 1].max, r.min, `hở/chồng giữa ${T[i - 1].range} và ${r.range}`);
      r.pts.forEach((v, c) => assert.ok(v >= T[i - 1].pts[c], `${r.range} cột ${c} giảm`));
    });
  });

  test(`lookupTier ${name}: biên dưới/trên của từng dòng tra đúng dòng, mọi cột`, () => {
    for (let c = 0; c < 8; c++) {
      T.forEach((row, i) => {
        const at = K.lookupTier(row.min, c, T);
        assert.equal(at.matched.range, row.range, `min của ${row.range}`);
        assert.equal(at.matched.pt, row.pts[c]);
        assert.equal(at.matched.maxA, row.max);
        if (Number.isFinite(row.max)) {
          assert.equal(K.lookupTier(row.max - 1, c, T).matched.range, row.range, `max-1 của ${row.range}`);
          assert.equal(K.lookupTier(row.max, c, T).matched.range, T[i + 1].range, `max của ${row.range} thuộc dòng kế`);
        }
        if (i < T.length - 1) assert.equal(at.next.min, T[i + 1].min);
        else assert.equal(at.next, null);
      });
    }
  });

  test(`lookupTier ${name}: 0 / âm / NaN / thập phân < dòng đầu = chưa có điểm (không rơi vào dòng cuối)`, () => {
    for (const v of [0, -5, NaN, 0.5]) {
      const r = K.lookupTier(v, 0, T);
      assert.equal(r.matched.pt, 0, String(v));
      assert.equal(r.next.min, T[0].min);
      assert.equal(r.pct, 0);
    }
  });
}

test('lookupTier: sản lượng cực lớn lấy dòng cuối, pct không vượt 100', () => {
  const r = K.lookupTier(10_000_000, 0, C.TABLE_5_DATA);
  assert.equal(r.matched.range, C.TABLE_5_DATA.at(-1).range);
  assert.equal(r.next, null);
  assert.ok(r.pct <= 100);
});

test('isDateInCurrentPeriod: tháng và ngày', () => {
  assert.equal(K.isDateInCurrentPeriod('2026-10-02', 'month', '2026-10'), true);
  assert.equal(K.isDateInCurrentPeriod('2026-11-01', 'month', '2026-10'), false);
  assert.equal(K.isDateInCurrentPeriod('2026-10-02', 'day', '2026-10', '2026-10-02'), true);
  assert.equal(K.isDateInCurrentPeriod('2026-10-03', 'day', '2026-10', '2026-10-02'), false);
  assert.equal(K.isDateInCurrentPeriod(null, 'month', '2026-10'), false);
  assert.equal(K.isDateInCurrentPeriod('2026-10-2', 'month', '2026-10'), false);
});

test('aggregateWeights: chỉ cộng bản ghi trong kỳ, đúng cột', () => {
  const w = (a, b) => Object.fromEntries(C.WEIGHT_KEYS.map((k, i) => [k, i === 0 ? a : i === 1 ? b : 0]));
  const records = {
    delivery: [{ id: 1, date: '2026-10-01', weights: w(10, 2) }, { id: 2, date: '2026-10-09', weights: w(5, 1) }, { id: 3, date: '2026-09-30', weights: w(99, 99) }],
    pickup:   [{ id: 4, date: '2026-10-05', weights: w(3, 0) }],
    return:   []
  };
  const { agg, total } = K.aggregateWeights(records, 'month', '2026-10');
  assert.deepEqual([agg.del[0], agg.del[1]], [15, 3]);
  assert.equal(total.del, 18);
  assert.equal(total.pick, 3);
  assert.equal(total.ret, 0);
});
