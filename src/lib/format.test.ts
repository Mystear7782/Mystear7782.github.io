import { clampLength, fmtDate, fmtDateShort, nowTime, today, ymd } from './format'

describe('日付・時刻', () => {
  it('today / nowTime はゼロ埋めされたローカル時刻', () => {
    const d = new Date(2026, 0, 5, 7, 3)
    expect(today(d)).toBe('2026-01-05')
    expect(nowTime(d)).toBe('07:03')
  })
  it('fmtDate は 年月日 表記（先頭のゼロを除く）。空は空文字', () => {
    expect(fmtDate('2026-10-01')).toBe('2026年10月1日')
    expect(fmtDate('2026-01-05')).toBe('2026年1月5日')
    expect(fmtDate('')).toBe('')
    expect(fmtDate(null)).toBe('')
  })
  it('fmtDateShort は年を省く', () => {
    expect(fmtDateShort('2026-10-01')).toBe('10月1日')
  })
  it('ymd は month が0始まり', () => {
    expect(ymd(2026, 0, 9)).toBe('2026-01-09')
    expect(ymd(2026, 11, 31)).toBe('2026-12-31')
  })
})

describe('clampLength（[...value].length で数える）', () => {
  it('30文字を超えた分を切る', () => {
    expect(clampLength('あ'.repeat(31), 30)).toBe('あ'.repeat(30))
    expect(clampLength('a'.repeat(61), 30)).toBe('a'.repeat(30))
  })
  it('サロゲートペア(絵文字)も1文字として数える', () => {
    expect([...clampLength('😀'.repeat(31), 30)]).toHaveLength(30)
  })
  it('上限以内はそのまま', () => {
    expect(clampLength('ベンチプレス', 30)).toBe('ベンチプレス')
  })
})
