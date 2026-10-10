// 読み取り・集計系ツール: list_exercises / get_meal_summary / get_weight_trend / get_exercise_history
// 集計はDB側のRPC（get_meal_daily_totals 等）で行う。期間か件数の指定を必須にして、
// PostgRESTのMax rows(1000)で結果が黙って切れるのを防ぐ。
import { z } from 'zod'
import { DATE_DESC, dateSchema } from '../lib/dates.ts'
import { type Client, listExercises, resolveExercise } from '../lib/exercises.ts'
import { run, throwIfError } from '../lib/result.ts'

// ===== list_exercises =====
export const listExercisesSchema = z.object({
  include_archived: z.boolean().optional().describe('アーカイブ済みの種目も含める（既定 false）'),
})
export type ListExercisesArgs = z.infer<typeof listExercisesSchema>

export function listExercisesTool(sb: Client, a: ListExercisesArgs) {
  return run(async () => {
    const all = await listExercises(sb)
    return all.filter((e) => a.include_archived || !e.archived)
  })
}

// ===== get_meal_summary =====
export const getMealSummarySchema = z.object({
  date_from: dateSchema.describe('期間の開始日（含む）。' + DATE_DESC),
  date_to: dateSchema.describe('期間の終了日（含む）。730日以内'),
})
export type GetMealSummaryArgs = z.infer<typeof getMealSummarySchema>

export function getMealSummary(sb: Client, a: GetMealSummaryArgs) {
  return run(async () => {
    const { data, error } = await sb.rpc('get_meal_daily_totals', { p_from: a.date_from, p_to: a.date_to })
    throwIfError(error)
    return { date_from: a.date_from, date_to: a.date_to, days: data }
  })
}

// ===== get_weight_trend =====
export const getWeightTrendSchema = z.object({
  date_from: dateSchema.describe('期間の開始日（含む）。' + DATE_DESC),
  date_to: dateSchema.describe('期間の終了日（含む）。730日以内'),
})
export type GetWeightTrendArgs = z.infer<typeof getWeightTrendSchema>

export function getWeightTrend(sb: Client, a: GetWeightTrendArgs) {
  return run(async () => {
    const { data, error } = await sb.rpc('get_body_weight_range', { p_from: a.date_from, p_to: a.date_to })
    throwIfError(error)
    return { date_from: a.date_from, date_to: a.date_to, logs: data }
  })
}

// ===== get_exercise_history =====
export const getExerciseHistorySchema = z.object({
  exercise: z.string().min(1).describe('種目名（部分一致可）またはid。アーカイブ済みの種目も指定できる'),
  date_from: dateSchema.optional().describe('この日以降のセッションに絞る（省略可）'),
  limit: z.number().int().min(1).max(100).optional().describe('新しいセッションから最大何件か（既定20、最大100）'),
})
export type GetExerciseHistoryArgs = z.infer<typeof getExerciseHistorySchema>

export function getExerciseHistory(sb: Client, a: GetExerciseHistoryArgs) {
  return run(async () => {
    const ex = await resolveExercise(sb, a.exercise, { includeArchived: true })
    const { data, error } = await sb.rpc('get_exercise_history', {
      p_exercise_id: ex.id,
      p_from: a.date_from,
      p_limit: a.limit ?? 20,
    })
    throwIfError(error)
    return { exercise: ex.name, category: ex.category, rows: data }
  })
}
