import {
  groupByExercise,
  isCardioMenu,
  menuStats,
  sessionStats,
  sortSessionsAsc,
  sortSessionsDesc,
} from './stats'
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

const session = (over: Partial<SessionData> = {}): SessionData => ({
  id: 's1',
  exerciseId: 'm1',
  date: '2026-10-01',
  time: '00:00',
  createdAt: '2026-10-01T00:00:00Z',
  sets: [],
  cardio: null,
  ...over,
})

const sets = (...pairs: [number, number][]) =>
  pairs.map(([weight, reps], i) => ({ id: `set${i}`, setNo: i + 1, weight, reps }))

describe('sessionStats', () => {
  it('最大1RM・ボリューム・最大重量・総回数・セット数を集計する', () => {
    const st = sessionStats(session({ sets: sets([80, 10], [85, 8]) }))
    expect(st).toEqual({ setCount: 2, maxOrm: 102, volume: 1480, maxWeight: 85, totalReps: 18 })
  })
  it('セットが無ければすべて0', () => {
    expect(sessionStats(session())).toEqual({
      setCount: 0,
      maxOrm: 0,
      volume: 0,
      maxWeight: 0,
      totalReps: 0,
    })
  })
  it('自重運動(重量0)でも総回数は数える', () => {
    const st = sessionStats(session({ sets: sets([0, 10], [0, 15]) }))
    expect(st.totalReps).toBe(25)
    expect(st.maxOrm).toBe(0)
  })
})

describe('menuStats', () => {
  it('筋トレ: 全セッションの最大1RM・最大ボリューム・最終日', () => {
    const st = menuStats(menu(), [
      session({ id: 'a', date: '2026-09-01', sets: sets([80, 10]) }),
      session({ id: 'b', date: '2026-10-01', sets: sets([80, 10], [85, 8]) }),
    ])
    expect(st).toEqual({ isCardio: false, maxOrm: 102, maxVol: 1480, lastDate: '2026-10-01' })
  })
  it('有酸素: 最大距離・最大消費カロリー', () => {
    const cardio = (dist: number, cal: number) => ({
      time: 30,
      dist,
      cal,
      hr: 140,
      maxSpd: null,
      avgSpd: null,
    })
    const st = menuStats(menu({ category: '有酸素運動', type: '有酸素運動' }), [
      session({ id: 'a', cardio: cardio(5, 300) }),
      session({ id: 'b', date: '2026-10-05', cardio: cardio(8, 250) }),
    ])
    expect(st).toEqual({ isCardio: true, maxDist: 8, maxCal: 300, lastDate: '2026-10-05' })
  })
  it('記録が無ければ最終日は null', () => {
    expect(menuStats(menu(), []).lastDate).toBeNull()
  })
})

describe('並べ替え・グルーピング', () => {
  const a = session({
    id: 'a',
    date: '2026-10-01',
    time: '09:00',
    createdAt: '2026-10-01T09:00:00Z',
  })
  const b = session({
    id: 'b',
    date: '2026-10-01',
    time: '18:00',
    createdAt: '2026-10-01T18:00:00Z',
  })
  const c = session({
    id: 'c',
    date: '2026-09-30',
    time: '23:00',
    createdAt: '2026-09-30T23:00:00Z',
  })

  it('新しい順（同日は時刻の新しい順）', () => {
    expect(sortSessionsDesc([c, a, b]).map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })
  it('古い順', () => {
    expect(sortSessionsAsc([b, a, c]).map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })
  it('元の配列は変更しない', () => {
    const list = [a, b]
    sortSessionsDesc(list)
    expect(list.map((s) => s.id)).toEqual(['a', 'b'])
  })
  it('種目idごとにまとめる', () => {
    const g = groupByExercise([a, session({ id: 'x', exerciseId: 'm2' }), b])
    expect(g.get('m1')?.map((s) => s.id)).toEqual(['a', 'b'])
    expect(g.get('m2')).toHaveLength(1)
  })
})

describe('isCardioMenu', () => {
  it('部位が有酸素運動のメニューだけ true', () => {
    expect(isCardioMenu(menu({ category: '有酸素運動' }))).toBe(true)
    expect(isCardioMenu(menu())).toBe(false)
    expect(isCardioMenu(undefined)).toBe(false)
  })
})
