// セッション・メニューごとの集計。画面（一覧・詳細・分析・ダッシュボード）で共通に使う。
import { CARDIO } from './constants'
import { orm } from './one-rm'
import type { Exercise, SessionData } from '@/types/domain'

export const isCardioMenu = (m: Pick<Exercise, 'category'> | null | undefined): boolean =>
  !!m && m.category === CARDIO

export type SessionStats = {
  setCount: number
  /** セット中の最大推定1RM */
  maxOrm: number
  /** 総ボリューム(重量×回数の合計) */
  volume: number
  maxWeight: number
  totalReps: number
}

/** 筋トレセッション1件の集計 */
export function sessionStats(s: SessionData): SessionStats {
  let maxOrm = 0
  let volume = 0
  let maxWeight = 0
  let totalReps = 0
  for (const set of s.sets) {
    const o = orm(set.weight, set.reps)
    if (o > maxOrm) maxOrm = o
    volume += set.weight * set.reps
    if (set.weight > maxWeight) maxWeight = set.weight
    totalReps += set.reps
  }
  return { setCount: s.sets.length, maxOrm, volume, maxWeight, totalReps }
}

export type MenuStats =
  | { isCardio: true; maxDist: number; maxCal: number; lastDate: string | null }
  | { isCardio: false; maxOrm: number; maxVol: number; lastDate: string | null }

/** メニュー単位の集計（一覧の「最大1RM」「最終日」、詳細のヒーロー部分に使う） */
export function menuStats(menu: Exercise | undefined, sessions: SessionData[]): MenuStats {
  let lastDate: string | null = null
  for (const s of sessions) if (!lastDate || s.date > lastDate) lastDate = s.date

  if (isCardioMenu(menu)) {
    let maxDist = 0
    let maxCal = 0
    for (const s of sessions) {
      if (s.cardio) {
        if ((s.cardio.dist ?? 0) > maxDist) maxDist = s.cardio.dist ?? 0
        if ((s.cardio.cal ?? 0) > maxCal) maxCal = s.cardio.cal ?? 0
      }
    }
    return { isCardio: true, maxDist, maxCal, lastDate }
  }

  let maxOrm = 0
  let maxVol = 0
  for (const s of sessions) {
    const st = sessionStats(s)
    if (st.maxOrm > maxOrm) maxOrm = st.maxOrm
    const vol = +st.volume.toFixed(1)
    if (vol > maxVol) maxVol = vol
  }
  return { isCardio: false, maxOrm, maxVol, lastDate }
}

/** 日付の新しい順（同日は時刻→作成日時の新しい順） */
export function sortSessionsDesc(sessions: SessionData[]): SessionData[] {
  return [...sessions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.time.localeCompare(a.time) ||
      b.createdAt.localeCompare(a.createdAt),
  )
}

/** 日付の古い順 */
export function sortSessionsAsc(sessions: SessionData[]): SessionData[] {
  return [...sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

/** 種目idごとにセッションをまとめる */
export function groupByExercise(sessions: SessionData[]): Map<string, SessionData[]> {
  const map = new Map<string, SessionData[]>()
  for (const s of sessions) {
    const list = map.get(s.exerciseId)
    if (list) list.push(s)
    else map.set(s.exerciseId, [s])
  }
  return map
}
