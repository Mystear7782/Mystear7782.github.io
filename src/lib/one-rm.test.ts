import { calcMealCalories, orm, rmBP, rmRound, rmSQ, rmTable } from './one-rm'

describe('orm（セット単体の推定1RM）', () => {
  it('1回のときは重量そのもの（式を通すと1.025倍になってしまうため）', () => {
    expect(orm(100, 1)).toBe(100)
    expect(orm(0.5, 1)).toBe(0.5)
  })
  it('2回以上は w×(1+r/40) を小数1桁に丸める', () => {
    expect(orm(80, 10)).toBe(100)
    expect(orm(85, 8)).toBe(102)
    expect(orm(60, 3)).toBe(64.5)
    expect(orm(45, 2)).toBe(47.3) // 47.25 → 47.3（toFixed(1)）
  })
})

describe('rmRound（小数部0.5以上は切り上げ、未満は切り捨て）', () => {
  it.each([
    [100, 100],
    [47.25, 47],
    [64.5, 65],
    [112.5, 113],
    [115.015, 115],
    [0.5125, 1],
    [88.88, 89],
  ])('%d → %d', (input, expected) => {
    expect(rmRound(input)).toBe(expected)
  })
})

describe('推定1RM（ベンチ / スクワット・DL）', () => {
  it.each([
    [80, 10, 100, 104],
    [100, 5, 113, 115],
    [45, 2, 47, 48],
    [60, 3, 65, 65],
    [0.5, 1, 1, 1],
    [200, 5, 225, 230],
  ])('%dkg×%d回 → BP %d / SQ %d', (w, r, bp, sq) => {
    expect(rmRound(rmBP(w, r))).toBe(bp)
    expect(rmRound(rmSQ(w, r))).toBe(sq)
  })
})

describe('rmTable（1〜10rep換算）', () => {
  it('1RM=100kgのとき、仕様の換算表と一致する（1repは最大RMそのもの）', () => {
    const rows = rmTable(100)
    expect(rows.map((r) => r.bench)).toEqual([100, 95, 93, 91, 89, 87, 85, 83, 82, 80])
    expect(rows.map((r) => r.squat)).toEqual([100, 94, 92, 89, 87, 85, 83, 81, 79, 77])
    expect(rows.map((r) => r.rep)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('1repは小数の最大RMもそのまま返す', () => {
    expect(rmTable(102.5)[0]).toEqual({ rep: 1, bench: 102.5, squat: 102.5 })
  })
})

describe('calcMealCalories（P×4 + F×9 + C×4）', () => {
  it('DBの生成列と同じ式', () => {
    expect(calcMealCalories(30, 10, 50)).toBe(410)
    expect(calcMealCalories(0, 0, 0)).toBe(0)
    expect(calcMealCalories(10.5, 2.5, 3)).toBe(76.5)
  })
})
