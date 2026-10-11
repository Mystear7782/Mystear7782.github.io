// 汎用CRUDツール: list_records / insert_record / update_record / delete_record
// 対象は6テーブルのみ（enumで限定）。一括更新・一括削除は提供せず、更新/削除は1行ずつidで指定する。
// 入力(data/patch)はテーブルごとのstrictなスキーマで検証し、user_id / id / calories_kcal など
// クライアントが指定してはいけない列を含む入力は拒否する。
import { z } from 'zod'
import { dateSchema, timeSchema } from '../lib/dates.ts'
import { type Client, listExercises } from '../lib/exercises.ts'
import { run, throwIfError, ToolError } from '../lib/result.ts'
import { MEAL_TYPES, pub } from './write.ts'

export const TABLES = [
  'exercises',
  'workout_sessions',
  'sets',
  'cardio_logs',
  'body_weight_logs',
  'meal_logs',
] as const
export type TableName = (typeof TABLES)[number]
export const tableSchema = z.enum(TABLES).describe('対象テーブル（この6つ以外は指定できない）')

const CATEGORIES = ['胸', '背中', '肩', '足', '腕', 'その他', '有酸素運動'] as const
const TYPES = ['マシン', 'フリーウェイト', '自重運動', '有酸素運動'] as const
const CARDIO = '有酸素運動'

// 主キー列（cardio_logsだけsession_idが主キー）
const PK: Record<TableName, string> = {
  exercises: 'id',
  workout_sessions: 'id',
  sets: 'id',
  cardio_logs: 'session_id',
  body_weight_logs: 'id',
  meal_logs: 'id',
}

const num = (max = 100000) => z.number().gt(0).max(max)

// ===== insert / update 用スキーマ（strict: 未知の列は拒否） =====
const INSERT_SCHEMAS: Partial<Record<TableName, z.ZodType>> = {
  exercises: z.strictObject({
    name: z.string().trim().min(1).max(100),
    category: z.enum(CATEGORIES),
    type: z.enum(TYPES),
    archived: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  }),
  workout_sessions: z.strictObject({
    exercise_id: z.string().min(1),
    session_date: dateSchema,
    session_time: timeSchema.optional(),
  }),
  cardio_logs: z.strictObject({
    session_id: z.string().uuid(),
    time_min: num().optional(),
    dist_km: num().optional(),
    cal_kcal: num().optional(),
    hr_bpm: num().optional(),
    max_spd_kmh: num().optional(),
    avg_spd_kmh: num().optional(),
  }),
  body_weight_logs: z.strictObject({
    log_date: dateSchema,
    weight_kg: num(500),
  }),
  meal_logs: z.strictObject({
    log_date: dateSchema,
    meal_type: z.enum(MEAL_TYPES),
    protein_g: z.number().min(0).max(5000),
    fat_g: z.number().min(0).max(5000),
    carb_g: z.number().min(0).max(5000),
  }),
}

const nullableNum = num().nullable().optional()
const UPDATE_SCHEMAS: Record<TableName, z.ZodType> = {
  exercises: z.strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    category: z.enum(CATEGORIES).optional(),
    type: z.enum(TYPES).optional(),
    archived: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  }),
  workout_sessions: z.strictObject({
    session_date: dateSchema.optional(),
    session_time: timeSchema.optional(),
  }),
  sets: z.strictObject({
    weight_kg: z.number().min(0).max(1000).optional(),
    reps: z.number().int().min(1).max(1000).optional(),
  }),
  cardio_logs: z.strictObject({
    time_min: nullableNum,
    dist_km: nullableNum,
    cal_kcal: nullableNum,
    hr_bpm: nullableNum,
    max_spd_kmh: nullableNum,
    avg_spd_kmh: nullableNum,
  }),
  body_weight_logs: z.strictObject({
    log_date: dateSchema.optional(),
    weight_kg: num(500).optional(),
  }),
  meal_logs: z.strictObject({
    log_date: dateSchema.optional(),
    meal_type: z.enum(MEAL_TYPES).optional(),
    protein_g: z.number().min(0).max(5000).optional(),
    fat_g: z.number().min(0).max(5000).optional(),
    carb_g: z.number().min(0).max(5000).optional(),
  }),
}

function parseData(schema: z.ZodType, input: unknown, what: string): Record<string, unknown> {
  const r = schema.safeParse(input)
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new ToolError(`${what}が不正です: ${issues}`)
  }
  return r.data as Record<string, unknown>
}

function checkId(table: TableName, id: string): void {
  const ok = table === 'exercises'
    ? /^[A-Za-z0-9_-]+$/.test(id)
    : z.string().uuid().safeParse(id).success
  if (!ok) throw new ToolError(`${table} のid(${PK[table]})の形式が不正です: ${id}`)
}

// PostgREST呼び出しは、テーブル名が動的なため型を緩めて扱う
// deno-lint-ignore no-explicit-any
const loose = (sb: Client) => sb as any

// ===== list_records =====
export const listRecordsSchema = z.object({
  table: tableSchema,
  date_from: dateSchema.optional().describe('この日以降に絞る（exercisesでは無視）'),
  date_to: dateSchema.optional().describe('この日以前に絞る（exercisesでは無視）'),
  limit: z.number().int().min(1).max(200).describe('返す最大件数（1〜200）。新しい順'),
})
export type ListRecordsArgs = z.infer<typeof listRecordsSchema>

type SessionRow = {
  exercise_id: string
  session_id: string
  session_date: string
  session_time: string
  sets: { id: string; w: number; r: number }[] | null
  cardio: { time: number | null; dist: number | null; cal: number | null; hr: number | null; maxSpd: number | null; avgSpd: number | null } | null
}

// PostgRESTのMax rows(既定1000)に達していると、RPCの結果が黙って切れている可能性がある
const MAX_ROWS = 1000

export function listRecords(sb: Client, a: ListRecordsArgs) {
  return run(async () => {
    const inRange = (d: string) => (!a.date_from || d >= a.date_from) && (!a.date_to || d <= a.date_to)
    let rows: Record<string, unknown>[] = []
    let rawCount = 0

    if (a.table === 'exercises') {
      const data = await listExercises(sb)
      rawCount = data.length
      rows = data
    } else if (a.table === 'body_weight_logs') {
      const { data, error } = await sb.rpc('get_my_body_weight_logs')
      throwIfError(error)
      rawCount = data?.length ?? 0
      rows = (data ?? []).filter((r) => inRange(r.log_date))
    } else if (a.table === 'meal_logs') {
      const { data, error } = await sb.rpc('get_my_meal_logs')
      throwIfError(error)
      rawCount = data?.length ?? 0
      rows = (data ?? []).filter((r) => inRange(r.log_date))
    } else {
      const { data, error } = await sb.rpc('get_my_sessions_full')
      throwIfError(error)
      const sessions = ((data ?? []) as unknown as SessionRow[]).filter((s) => inRange(s.session_date))
        .sort((x, y) => (y.session_date + y.session_time).localeCompare(x.session_date + x.session_time))
      rawCount = data?.length ?? 0
      if (a.table === 'workout_sessions') {
        rows = sessions.map((s) => ({
          id: s.session_id,
          exercise_id: s.exercise_id,
          session_date: s.session_date,
          session_time: s.session_time,
          set_count: s.sets?.length ?? 0,
          has_cardio: s.cardio !== null,
        }))
      } else if (a.table === 'sets') {
        rows = sessions.flatMap((s) =>
          (s.sets ?? []).map((st, i) => ({
            id: st.id,
            session_id: s.session_id,
            exercise_id: s.exercise_id,
            session_date: s.session_date,
            order_in_session: i + 1,
            weight_kg: st.w,
            reps: st.r,
          }))
        )
      } else {
        rows = sessions.filter((s) => s.cardio).map((s) => ({
          session_id: s.session_id,
          exercise_id: s.exercise_id,
          session_date: s.session_date,
          time_min: s.cardio!.time,
          dist_km: s.cardio!.dist,
          cal_kcal: s.cardio!.cal,
          hr_bpm: s.cardio!.hr,
          max_spd_kmh: s.cardio!.maxSpd,
          avg_spd_kmh: s.cardio!.avgSpd,
        }))
      }
    }

    const shown = rows.slice(0, a.limit)
    return {
      table: a.table,
      total_matched: rows.length,
      returned: shown.length,
      rows: shown,
      ...(rawCount >= MAX_ROWS
        ? { warning: `取得元の行数が上限(${MAX_ROWS})に達しているため、古い行が含まれていない可能性があります。` }
        : {}),
    }
  })
}

// ===== insert_record =====
export const insertRecordSchema = z.object({
  table: tableSchema,
  data: z.record(z.string(), z.unknown()).describe(
    '追加する1行。使える列はテーブルごとに決まっている（未知の列・user_id・idは指定不可）。' +
      'exercises: name, category(胸/背中/肩/足/腕/その他/有酸素運動), type(マシン/フリーウェイト/自重運動/有酸素運動), archived?, sort_order?。' +
      'workout_sessions: exercise_id, session_date, session_time?。' +
      'cardio_logs: session_id と各数値。' +
      'body_weight_logs: log_date, weight_kg。' +
      'meal_logs: log_date, meal_type, protein_g, fat_g, carb_g（calories_kcalは自動計算）。' +
      'setsは対象外（log_workout_set を使う）',
  ),
})
export type InsertRecordArgs = z.infer<typeof insertRecordSchema>

export function insertRecord(sb: Client, a: InsertRecordArgs) {
  return run(async () => {
    if (a.table === 'sets') {
      throw new ToolError('sets への追加は insert_record では行えません。log_workout_set を使ってください（set_noの採番を安全に行うため）。')
    }
    const d = parseData(INSERT_SCHEMAS[a.table]!, a.data, 'data')

    if (a.table === 'exercises') {
      const cat = d.category as string
      const type = d.type as string
      if ((cat === CARDIO) !== (type === CARDIO)) {
        throw new ToolError('category と type の組み合わせが不正です（有酸素運動は category・type とも「有酸素運動」にします）。')
      }
      const all = await listExercises(sb)
      if (all.some((e) => !e.archived && e.category === cat && e.name === d.name)) {
        throw new ToolError(`同じ部位(${cat})に同名の種目「${d.name}」が既にあります。`)
      }
      // idはサーバーが採番する（menu_<epoch ms>）。sort_orderは未指定ならカテゴリ末尾
      const sortOrder = (d.sort_order as number | undefined) ??
        all.filter((e) => e.category === cat).reduce((m, e) => Math.max(m, e.sort_order + 1), 0)
      const { data, error } = await sb.from('exercises')
        .insert({
          id: `menu_${Date.now()}`,
          name: d.name as string,
          category: cat,
          type,
          archived: (d.archived as boolean | undefined) ?? false,
          sort_order: sortOrder,
        })
        .select().single()
      throwIfError(error)
      return { table: a.table, row: pub(data!) }
    }

    const { data, error } = await loose(sb).from(a.table).insert(d).select().single()
    throwIfError(error)
    return { table: a.table, row: pub(data) }
  })
}

// ===== update_record =====
export const updateRecordSchema = z.object({
  table: tableSchema,
  id: z.string().min(1).describe('更新する行のid（cardio_logsはsession_id）。list_records で確認できる'),
  patch: z.record(z.string(), z.unknown()).describe(
    '更新する列と値（指定した列だけが変わる）。使える列: ' +
      'exercises: name/category/type/archived/sort_order。workout_sessions: session_date/session_time。' +
      'sets: weight_kg/reps。cardio_logs: 各数値（nullで消去）。body_weight_logs: log_date/weight_kg。' +
      'meal_logs: log_date/meal_type/protein_g/fat_g/carb_g',
  ),
})
export type UpdateRecordArgs = z.infer<typeof updateRecordSchema>

export function updateRecord(sb: Client, a: UpdateRecordArgs) {
  return run(async () => {
    checkId(a.table, a.id)
    const patch = parseData(UPDATE_SCHEMAS[a.table], a.patch, 'patch')
    if (Object.keys(patch).length === 0) throw new ToolError('patch が空です。更新する列を指定してください。')

    if (a.table === 'exercises') {
      const cur = (await listExercises(sb)).find((e) => e.id === a.id)
      if (!cur) throw new ToolError(`exercises に id=${a.id} の行が見つかりません。`)
      const cat = (patch.category as string | undefined) ?? cur.category
      const type = (patch.type as string | undefined) ?? cur.type
      if ((cat === CARDIO) !== (type === CARDIO)) {
        throw new ToolError('category と type の組み合わせが不正です（有酸素運動は category・type とも「有酸素運動」にします）。')
      }
    }

    const { data, error } = await loose(sb).from(a.table).update(patch).eq(PK[a.table], a.id).select()
    throwIfError(error)
    if (!data || data.length === 0) throw new ToolError(`${a.table} に id=${a.id} の行が見つかりません。`)
    return { table: a.table, row: pub(data[0]) }
  })
}

// ===== delete_record =====
export const deleteRecordSchema = z.object({
  table: tableSchema,
  id: z.string().min(1).describe('削除する行のid（cardio_logsはsession_id）'),
})
export type DeleteRecordArgs = z.infer<typeof deleteRecordSchema>

export function deleteRecord(sb: Client, a: DeleteRecordArgs) {
  return run(async () => {
    checkId(a.table, a.id)
    const { data, error } = await loose(sb).from(a.table).delete().eq(PK[a.table], a.id).select()
    throwIfError(error)
    if (!data || data.length === 0) throw new ToolError(`${a.table} に id=${a.id} の行が見つかりません。`)
    return { table: a.table, deleted: pub(data[0]) }
  })
}
