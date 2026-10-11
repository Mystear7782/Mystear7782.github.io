import { buildCardioCsv, buildStrengthCsv, csvField, parseCsv } from './csv'
import type { Exercise, SessionData } from '@/types/domain'

const menu = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'm1',
  name: 'ベンチプレス',
  category: '胸',
  type: 'フリーウェイト',
  archived: false,
  sort_order: 0,
  ...over,
})
const session = (over: Partial<SessionData>): SessionData => ({
  id: 's1',
  exerciseId: 'm1',
  date: '2026-10-01',
  time: '07:30',
  createdAt: '2026-10-01T07:30:00Z',
  sets: [],
  cardio: null,
  ...over,
})

describe('csvField', () => {
  it('ダブルクォートで囲み、内部の " は "" にエスケープする（RFC4180）', () => {
    expect(csvField('ベンチ"プレス')).toBe('"ベンチ""プレス"')
    expect(csvField('a,b')).toBe('"a,b"')
  })
})

describe('parseCsv', () => {
  it('引用符・"" エスケープ・CRLF・空行に対応する', () => {
    const rows = parseCsv('a,b,c\r\n"x ""y"" z",2,"3,4"\r\n\r\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x "y" z', '2', '3,4'],
    ])
  })
  it('空欄は空文字、各セルの前後の空白は取り除く', () => {
    expect(parseCsv('a, b ,,d')).toEqual([['a', 'b', '', 'd']])
  })
  it('HTMLタグは文字列のまま（解釈しない）', () => {
    expect(parseCsv('"<img src=x onerror=alert(1)>",胸')).toEqual([
      ['<img src=x onerror=alert(1)>', '胸'],
    ])
  })
})

describe('buildStrengthCsv / parseCsv の往復', () => {
  it('出力したCSVを読み戻すと、メニュー名(" を含む)・時刻・セットが一致する', () => {
    const m = menu({ name: 'ベンチ"プレス' })
    const s = session({
      sets: [
        { id: 'a', setNo: 1, weight: 80, reps: 10 },
        { id: 'b', setNo: 2, weight: 85, reps: 8 },
      ],
    })
    const rows = parseCsv(buildStrengthCsv([m], () => [s]))
    expect(rows[0]).toContain('session_time')
    expect(rows[1].slice(0, 9)).toEqual([
      'ベンチ"プレス',
      '胸',
      'フリーウェイト',
      '2026-10-01',
      's1',
      '07:30',
      '1',
      '80',
      '10',
    ])
    expect(rows[1].slice(9)).toEqual(['100', '800']) // 推定1RM, ボリューム
    expect(rows[2][6]).toBe('2')
  })
  it('日付の古い順に出力する', () => {
    const csv = buildStrengthCsv([menu()], () => [
      session({ id: 'new', date: '2026-10-02', sets: [{ id: 'x', setNo: 1, weight: 1, reps: 1 }] }),
      session({ id: 'old', date: '2026-09-01', sets: [{ id: 'y', setNo: 1, weight: 1, reps: 1 }] }),
    ])
    expect(
      parseCsv(csv)
        .slice(1)
        .map((r) => r[4]),
    ).toEqual(['old', 'new'])
  })
})

describe('buildCardioCsv', () => {
  it('有酸素の各値を出力し、未入力は空欄', () => {
    const m = menu({ category: '有酸素運動', type: '有酸素運動', name: 'ランニング' })
    const s = session({
      cardio: { time: 30, dist: 5, cal: 300, hr: 140, maxSpd: null, avgSpd: 8.5 },
    })
    const rows = parseCsv(buildCardioCsv([m], () => [s]))
    expect(rows[1]).toEqual([
      'ランニング',
      '有酸素運動',
      '2026-10-01',
      's1',
      '07:30',
      '30',
      '5',
      '300',
      '140',
      '',
      '8.5',
    ])
  })
})
