// トレーニング記録（workout_sessions / sets / cardio_logs）の取得・更新。
// 記録は1セッション=1行にセット配列/有酸素データを埋め込んだ SessionData として扱う。
//
// 書き込みの方針: サーバーの応答を受け取ってからキャッシュを更新する。失敗時はキャッシュに触れず、
// onError で共通のエラー通知（console + トースト）を出す。
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { reportError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Cardio, SessionData, SetEntry } from '@/types/domain'
import { queryKeys } from './keys'
import { fetchAll } from './paging'

type CardioRow = {
  time_min: number | null
  dist_km: number | null
  cal_kcal: number | null
  hr_bpm: number | null
  max_spd_kmh: number | null
  avg_spd_kmh: number | null
}

type SessionRow = {
  id: string
  exercise_id: string
  session_date: string
  session_time: string
  created_at: string
  sets: { id: string; set_no: number; weight_kg: number; reps: number }[] | null
  cardio_logs: CardioRow | CardioRow[] | null
}

const toCardio = (c: CardioRow): Cardio => ({
  time: c.time_min,
  dist: c.dist_km,
  cal: c.cal_kcal,
  hr: c.hr_bpm,
  maxSpd: c.max_spd_kmh,
  avgSpd: c.avg_spd_kmh,
})

function toSession(row: SessionRow): SessionData {
  // cardio_logs は session_id が主キーの1対1。PostgRESTは通常オブジェクトで返すが、配列で返る場合にも備える
  const cardioRow = Array.isArray(row.cardio_logs) ? (row.cardio_logs[0] ?? null) : row.cardio_logs
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    date: row.session_date,
    time: row.session_time || '00:00',
    createdAt: row.created_at,
    sets: [...(row.sets ?? [])]
      .sort((a, b) => a.set_no - b.set_no)
      .map((s) => ({ id: s.id, setNo: s.set_no, weight: s.weight_kg, reps: s.reps })),
    cardio: cardioRow ? toCardio(cardioRow) : null,
  }
}

const SESSION_SELECT =
  'id, exercise_id, session_date, session_time, created_at, ' +
  'sets(id, set_no, weight_kg, reps), ' +
  'cardio_logs(time_min, dist_km, cal_kcal, hr_bpm, max_spd_kmh, avg_spd_kmh)'

/** 全セッション（新しい順）。1000件を超えてもページ分割で全件取得する */
export async function fetchSessions(): Promise<SessionData[]> {
  const rows = await fetchAll<SessionRow>(
    (from, to) =>
      supabase
        .from('workout_sessions')
        .select(SESSION_SELECT)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to) as unknown as PromiseLike<{
        data: SessionRow[] | null
        error: { message: string } | null
      }>,
  )
  return rows.map(toSession)
}

export function useSessions() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: fetchSessions })
}

function patchSessions(qc: QueryClient, fn: (list: SessionData[]) => SessionData[]) {
  qc.setQueryData<SessionData[]>(queryKeys.sessions, (old) => (old ? fn(old) : old))
}

const patchSession = (qc: QueryClient, id: string, fn: (s: SessionData) => SessionData) =>
  patchSessions(qc, (list) => list.map((s) => (s.id === id ? fn(s) : s)))

// ===== 低レベルAPI（CSVインポートなど、フック以外からも使う） =====

export async function insertSession(
  exerciseId: string,
  date: string,
  time: string,
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({ exercise_id: exerciseId, session_date: date, session_time: time })
    .select('id, created_at')
    .single()
  if (error) throw error
  return { id: data.id, createdAt: data.created_at }
}

export async function upsertCardio(sessionId: string, c: Cardio): Promise<void> {
  const { error } = await supabase.from('cardio_logs').upsert(
    {
      session_id: sessionId,
      time_min: c.time,
      dist_km: c.dist,
      cal_kcal: c.cal,
      hr_bpm: c.hr,
      max_spd_kmh: c.maxSpd,
      avg_spd_kmh: c.avgSpd,
    },
    { onConflict: 'session_id' },
  )
  if (error) throw error
}

export async function insertSets(
  sessionId: string,
  sets: { weight: number; reps: number }[],
  startSetNo = 1,
): Promise<void> {
  if (!sets.length) return
  const { error } = await supabase.from('sets').insert(
    sets.map((s, i) => ({
      session_id: sessionId,
      set_no: startSetNo + i,
      weight_kg: s.weight,
      reps: s.reps,
    })),
  )
  if (error) throw error
}

export async function deleteSessionRow(id: string): Promise<void> {
  const { error } = await supabase.from('workout_sessions').delete().eq('id', id)
  if (error) throw error
}

// ===== セット =====

export type RecordSetInput =
  | { sessionId: string; weight: number; reps: number }
  | {
      /** 仮(まだ保存されていない)セッションの最初のセット: セッション作成とセット追加を1回のRPCで行う */
      exerciseId: string
      date: string
      time: string
      weight: number
      reps: number
    }

/**
 * セットを1件追加する（record_set RPC。set_noの採番とinsertを1トランザクションで行う）。
 * セッションが無ければ同じRPC呼び出しで作成する。MCPが同時に書いても重複・採番ずれが起きない。
 */
export function useRecordSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordSetInput) => {
      // 生成された型ではp_exercise_id等が必須(string)だが、p_session_id指定時はNULLでよいためキャストする
      const none = null as unknown as string
      const target =
        'sessionId' in input
          ? { p_exercise_id: none, p_date: none, p_time: none, p_session_id: input.sessionId }
          : {
              p_exercise_id: input.exerciseId,
              p_date: input.date,
              p_time: input.time,
              p_new_session: true,
            }
      const { data, error } = await supabase.rpc('record_set', {
        ...target,
        p_weight_kg: input.weight,
        p_reps: input.reps,
      })
      if (error) throw error
      const row = data?.[0]
      if (!row) throw new Error('record_set returned no row')
      return { row, input }
    },
    onSuccess: ({ row, input }) => {
      const set: SetEntry = {
        id: row.id,
        setNo: row.set_no,
        weight: row.weight_kg,
        reps: row.reps,
      }
      if (row.session_created && 'exerciseId' in input) {
        patchSessions(qc, (list) => [
          {
            id: row.session_id,
            exerciseId: input.exerciseId,
            date: input.date,
            time: input.time,
            createdAt: new Date().toISOString(),
            sets: [set],
            cardio: null,
          },
          ...list,
        ])
      } else {
        patchSession(qc, row.session_id, (s) => ({ ...s, sets: [...s.sets, set] }))
      }
    },
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}

export function useUpdateSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { sessionId: string; setId: string; weight: number; reps: number }) => {
      const { error } = await supabase
        .from('sets')
        .update({ weight_kg: a.weight, reps: a.reps })
        .eq('id', a.setId)
      if (error) throw error
    },
    onSuccess: (_d, a) =>
      patchSession(qc, a.sessionId, (s) => ({
        ...s,
        sets: s.sets.map((x) => (x.id === a.setId ? { ...x, weight: a.weight, reps: a.reps } : x)),
      })),
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { sessionId: string; setId: string }) => {
      const { error } = await supabase.from('sets').delete().eq('id', a.setId)
      if (error) throw error
    },
    onSuccess: (_d, a) =>
      patchSession(qc, a.sessionId, (s) => ({
        ...s,
        sets: s.sets.filter((x) => x.id !== a.setId),
      })),
    onError: (e) => reportError(e, '削除に失敗しました（通信を確認してください）'),
  })
}

// ===== セッション =====

export function useUpdateSessionDateTime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { sessionId: string; date: string; time: string }) => {
      const { error } = await supabase
        .from('workout_sessions')
        .update({ session_date: a.date, session_time: a.time })
        .eq('id', a.sessionId)
      if (error) throw error
    },
    onSuccess: (_d, a) =>
      patchSession(qc, a.sessionId, (s) => ({ ...s, date: a.date, time: a.time })),
    onError: (e) => reportError(e, '日時の更新に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    // sets / cardio_logs は外部キーのCASCADEで連鎖削除される
    mutationFn: deleteSessionRow,
    onSuccess: (_d, id) => patchSessions(qc, (list) => list.filter((s) => s.id !== id)),
    onError: (e) => reportError(e, '削除に失敗しました（通信を確認してください）'),
  })
}

// ===== 有酸素 =====

export type SaveCardioInput = {
  /** 既存セッションのid。未保存(仮)のセッションなら undefined */
  sessionId?: string
  exerciseId: string
  date: string
  time: string
  cardio: Cardio
}

/** 有酸素の記録を保存する。未保存のセッションなら、ここで初めてセッションを作成する */
export function useSaveCardio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: SaveCardioInput) => {
      let sessionId = a.sessionId
      let created: { id: string; createdAt: string } | null = null
      if (!sessionId) {
        created = await insertSession(a.exerciseId, a.date, a.time)
        sessionId = created.id
      }
      try {
        await upsertCardio(sessionId, a.cardio)
      } catch (e) {
        // セッションだけが残らないよう、作ったばかりのセッションは取り消す（失敗しても握りつぶす）
        if (created) await deleteSessionRow(created.id).catch(() => undefined)
        throw e
      }
      return { sessionId, created }
    },
    onSuccess: ({ sessionId, created }, a) => {
      if (created) {
        patchSessions(qc, (list) => [
          {
            id: created.id,
            exerciseId: a.exerciseId,
            date: a.date,
            time: a.time,
            createdAt: created.createdAt,
            sets: [],
            cardio: a.cardio,
          },
          ...list,
        ])
      } else {
        patchSession(qc, sessionId, (s) => ({ ...s, cardio: a.cardio }))
      }
    },
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}
