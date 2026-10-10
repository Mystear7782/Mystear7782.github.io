// 書き込み系ツール: log_meal / log_body_weight / log_workout_set / log_cardio
// 返り値は、作成・更新した行をそのまま返す（user_idだけは返さない）。
// 重複登録の防止(直近2分)は食事・体重・セットに適用する（lib/dedupe.ts）。
import { z } from 'zod'
import { DATE_DESC, dateSchema, TIME_DESC, timeSchema } from '../lib/dates.ts'
import { dedupeSince } from '../lib/dedupe.ts'
import { type Client, resolveExercise } from '../lib/exercises.ts'
import { run, throwIfError, ToolError } from '../lib/result.ts'

/** 返却用: user_id は返さない */
// deno-lint-ignore no-explicit-any
export const pub = <T extends Record<string, any>>(row: T): Omit<T, 'user_id'> => {
  const { user_id: _omit, ...rest } = row
  return rest
}

export const MEAL_TYPES = ['朝', '昼', '夜', '間食'] as const

// ===== log_meal =====
export const logMealSchema = z.object({
  date: dateSchema.describe(DATE_DESC),
  meal_type: z.enum(MEAL_TYPES).describe('食事区分'),
  protein_g: z.number().min(0).max(5000).describe('たんぱく質(g)。食事内容からClaudeが推定した値'),
  fat_g: z.number().min(0).max(5000).describe('脂質(g)'),
  carb_g: z.number().min(0).max(5000).describe('炭水化物(g)'),
}).refine((a) => a.protein_g + a.fat_g + a.carb_g > 0, {
  message: 'たんぱく質・脂質・炭水化物のいずれかは0より大きい値にしてください',
})
export type LogMealArgs = z.infer<typeof logMealSchema>

export function logMeal(sb: Client, a: LogMealArgs) {
  return run(async () => {
    // 直近2分以内に同じ内容があれば、それを返す（再試行対策）
    const { data: dup, error: dupErr } = await sb.from('meal_logs').select('*')
      .eq('log_date', a.date).eq('meal_type', a.meal_type)
      .eq('protein_g', a.protein_g).eq('fat_g', a.fat_g).eq('carb_g', a.carb_g)
      .gte('created_at', dedupeSince())
      .order('created_at', { ascending: false }).limit(1)
    throwIfError(dupErr)
    if (dup && dup.length) return { deduplicated: true, row: pub(dup[0]) }

    // calories_kcal は生成列(P×4+F×9+C×4)なので書き込まない
    const { data, error } = await sb.from('meal_logs')
      .insert({
        log_date: a.date,
        meal_type: a.meal_type,
        protein_g: a.protein_g,
        fat_g: a.fat_g,
        carb_g: a.carb_g,
      })
      .select().single()
    throwIfError(error)
    return { deduplicated: false, row: pub(data!) }
  })
}

// ===== log_body_weight =====
export const logBodyWeightSchema = z.object({
  date: dateSchema.describe(DATE_DESC),
  weight_kg: z.number().gt(0).max(500).describe('体重(kg)'),
})
export type LogBodyWeightArgs = z.infer<typeof logBodyWeightSchema>

export function logBodyWeight(sb: Client, a: LogBodyWeightArgs) {
  return run(async () => {
    const { data: dup, error: dupErr } = await sb.from('body_weight_logs').select('*')
      .eq('log_date', a.date).eq('weight_kg', a.weight_kg)
      .gte('created_at', dedupeSince())
      .order('created_at', { ascending: false }).limit(1)
    throwIfError(dupErr)
    if (dup && dup.length) return { deduplicated: true, row: pub(dup[0]) }

    // 同日に複数回記録できる仕様なので、常にinsert（既存行の更新はしない）
    const { data, error } = await sb.from('body_weight_logs')
      .insert({ log_date: a.date, weight_kg: a.weight_kg })
      .select().single()
    throwIfError(error)
    return { deduplicated: false, row: pub(data!) }
  })
}

// ===== log_workout_set =====
export const logWorkoutSetSchema = z.object({
  exercise: z.string().min(1).describe('種目名（部分一致可）またはid。list_exercises で確認できる'),
  date: dateSchema.describe(DATE_DESC),
  time: timeSchema.optional().describe(TIME_DESC + '。セッションを新規作成するときだけ使われる（未指定は 00:00）'),
  weight_kg: z.number().min(0).max(1000).describe('重量(kg)。自重運動は0'),
  reps: z.number().int().min(1).max(1000).describe('回数'),
  new_session: z.boolean().optional().describe(
    'true なら、同じ日に既存のセッションがあっても新しいセッションを作る。省略/false なら同じ種目・同じ日の最新セッションに追加する',
  ),
})
export type LogWorkoutSetArgs = z.infer<typeof logWorkoutSetSchema>

export function logWorkoutSet(sb: Client, a: LogWorkoutSetArgs) {
  return run(async () => {
    const ex = await resolveExercise(sb, a.exercise)
    if (ex.category === '有酸素運動') {
      throw new ToolError(`「${ex.name}」は有酸素運動です。log_cardio を使ってください。`)
    }

    // 直近2分以内に、同じ種目・同じ日・同じ重量/回数のセットがあれば、それを返す
    const { data: dup, error: dupErr } = await sb.from('sets')
      .select('id, session_id, set_no, weight_kg, reps, created_at, workout_sessions!inner(exercise_id, session_date)')
      .eq('workout_sessions.exercise_id', ex.id)
      .eq('workout_sessions.session_date', a.date)
      .eq('weight_kg', a.weight_kg).eq('reps', a.reps)
      .gte('created_at', dedupeSince())
      .order('created_at', { ascending: false }).limit(1)
    throwIfError(dupErr)
    if (dup && dup.length) {
      const { workout_sessions: _s, ...set } = dup[0] as Record<string, unknown>
      return { deduplicated: true, exercise: ex.name, set }
    }

    // set_noの採番とinsertは record_set RPC が1トランザクションで行う
    const { data, error } = await sb.rpc('record_set', {
      p_exercise_id: ex.id,
      p_date: a.date,
      p_time: (a.time ?? null) as unknown as string, // 未指定はNULL（RPC側で00:00になる）
      p_weight_kg: a.weight_kg,
      p_reps: a.reps,
      p_new_session: a.new_session ?? false,
    })
    throwIfError(error)
    return { deduplicated: false, exercise: ex.name, set: data![0] }
  })
}

// ===== log_cardio =====
const cardioNum = (desc: string) => z.number().gt(0).max(100000).optional().describe(desc)
export const logCardioSchema = z.object({
  exercise: z.string().min(1).describe('有酸素運動の種目名（部分一致可）またはid'),
  date: dateSchema.describe(DATE_DESC),
  time: timeSchema.optional().describe(TIME_DESC + '。セッションを新規作成するときだけ使われる（未指定は 00:00）'),
  time_min: cardioNum('合計時間(分)'),
  dist_km: cardioNum('合計距離(km)'),
  cal_kcal: cardioNum('消費カロリー(kcal)'),
  hr_bpm: cardioNum('平均心拍数(bpm)'),
  max_spd_kmh: cardioNum('最大速度(km/h)'),
  avg_spd_kmh: cardioNum('平均速度(km/h)'),
})
export type LogCardioArgs = z.infer<typeof logCardioSchema>

const CARDIO_FIELDS = ['time_min', 'dist_km', 'cal_kcal', 'hr_bpm', 'max_spd_kmh', 'avg_spd_kmh'] as const

export function logCardio(sb: Client, a: LogCardioArgs) {
  return run(async () => {
    const ex = await resolveExercise(sb, a.exercise)
    if (ex.category !== '有酸素運動') {
      throw new ToolError(`「${ex.name}」は有酸素運動ではありません。log_workout_set を使ってください。`)
    }
    if (!CARDIO_FIELDS.some((f) => a[f] !== undefined)) {
      throw new ToolError('記録する値がありません。time_min / dist_km / cal_kcal / hr_bpm / max_spd_kmh / avg_spd_kmh のいずれかを指定してください。')
    }

    // 同じ種目・同じ日のセッション（複数あれば最新）。なければ作成する
    const { data: found, error: findErr } = await sb.from('workout_sessions')
      .select('id').eq('exercise_id', ex.id).eq('session_date', a.date)
      .order('created_at', { ascending: false }).limit(1)
    throwIfError(findErr)
    let sessionId = found?.[0]?.id
    let sessionCreated = false
    if (!sessionId) {
      const { data, error } = await sb.from('workout_sessions')
        .insert({ exercise_id: ex.id, session_date: a.date, session_time: a.time ?? '00:00' })
        .select('id').single()
      throwIfError(error)
      sessionId = data!.id
      sessionCreated = true
    }

    // 既に有酸素の記録があるセッションでは、指定された項目だけを上書きし、他は残す
    const { data: existing, error: exErr } = await sb.from('cardio_logs')
      .select('*').eq('session_id', sessionId).maybeSingle()
    throwIfError(exErr)
    const merged = { session_id: sessionId } as Record<string, unknown>
    for (const f of CARDIO_FIELDS) merged[f] = a[f] ?? existing?.[f] ?? null

    const { data, error } = await sb.from('cardio_logs')
      .upsert(merged as never, { onConflict: 'session_id' })
      .select().single()
    throwIfError(error)
    return { exercise: ex.name, session_created: sessionCreated, cardio: data }
  })
}
