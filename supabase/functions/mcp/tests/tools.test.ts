// MCPツール本体のテスト（ローカルSupabaseに対する結合テスト）。
// MCPサーバー(HTTP/OAuth)を介さず、ツールの関数をユーザー本人のクライアントで直接呼ぶ。
// 対応する受け入れ基準: AC-2(CRUD) / AC-3(食事) / AC-4(セット) / AC-5(集計) / AC-6(種目一覧) /
//                       AC-7(エラー) / AC-8(安全策のうち入力検証) / AC-9(二重登録)
import { assert, assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert'
import { dateSchema } from '../lib/dates.ts'
import {
  deleteRecord,
  insertRecord,
  insertRecordSchema,
  listRecords,
  listRecordsSchema,
  updateRecord,
} from '../tools/crud.ts'
import { getExerciseHistory, getMealSummary, getWeightTrend, listExercisesTool } from '../tools/read.ts'
import { deleteMenuSet, listMenuSets, saveMenuSet, saveMenuSetSchema } from '../tools/menu-sets.ts'
import { logBodyWeight, logCardio, logMeal, logMealSchema, logWorkoutSet } from '../tools/write.ts'
import { D, errText, json, newUser } from './helpers.ts'

type Row = Record<string, unknown>

/** 種目を1つ作って返すヘルパー */
async function addExercise(sb: Parameters<typeof insertRecord>[0], name: string, category = '胸', type = 'フリーウェイト') {
  const r = json<{ row: Row }>(await insertRecord(sb, { table: 'exercises', data: { name, category, type } }))
  return r.row as { id: string; name: string }
}

// ===== AC-2: 6テーブルそれぞれで insert → list → update → delete =====
Deno.test('AC-2: exercises の insert → list → update → delete', async () => {
  const { sb } = await newUser()
  const ex = await addExercise(sb, 'ベンチプレス')
  assert(ex.id.startsWith('menu_'), 'idはサーバーが menu_<epoch ms> で採番する')

  const list = json<{ rows: Row[] }>(await listRecords(sb, { table: 'exercises', limit: 10 }))
  assertEquals(list.rows.map((r) => r.name), ['ベンチプレス'])

  json(await updateRecord(sb, { table: 'exercises', id: ex.id, patch: { name: 'ダンベルプレス' } }))
  const after = json<{ rows: Row[] }>(await listRecords(sb, { table: 'exercises', limit: 10 }))
  assertEquals(after.rows[0].name, 'ダンベルプレス')

  json(await deleteRecord(sb, { table: 'exercises', id: ex.id }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'exercises', limit: 10 })).rows.length, 0)
})

Deno.test('AC-2: workout_sessions の insert → list → update → delete', async () => {
  const { sb } = await newUser()
  const ex = await addExercise(sb, 'スクワット', '足')
  const s = json<{ row: Row }>(
    await insertRecord(sb, { table: 'workout_sessions', data: { exercise_id: ex.id, session_date: D, session_time: '10:00' } }),
  ).row
  const list = json<{ rows: Row[] }>(await listRecords(sb, { table: 'workout_sessions', limit: 10 }))
  assertEquals(list.rows.length, 1)
  assertEquals(list.rows[0].id, s.id)

  json(await updateRecord(sb, { table: 'workout_sessions', id: s.id as string, patch: { session_time: '11:30' } }))
  const after = json<{ rows: Row[] }>(await listRecords(sb, { table: 'workout_sessions', limit: 10 }))
  assertEquals(after.rows[0].session_time, '11:30')

  json(await deleteRecord(sb, { table: 'workout_sessions', id: s.id as string }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'workout_sessions', limit: 10 })).rows.length, 0)
})

Deno.test('AC-2: sets の insert(log_workout_set) → list → update → delete', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ベンチプレス')
  const set = json<{ set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 60, reps: 10 })).set
  const list = json<{ rows: Row[] }>(await listRecords(sb, { table: 'sets', limit: 10 }))
  assertEquals(list.rows.length, 1)
  assertEquals(list.rows[0].id, set.id)

  json(await updateRecord(sb, { table: 'sets', id: set.id as string, patch: { weight_kg: 65, reps: 8 } }))
  const after = json<{ rows: Row[] }>(await listRecords(sb, { table: 'sets', limit: 10 }))
  assertEquals([after.rows[0].weight_kg, after.rows[0].reps], [65, 8])

  json(await deleteRecord(sb, { table: 'sets', id: set.id as string }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'sets', limit: 10 })).rows.length, 0)
})

Deno.test('AC-2: cardio_logs の insert → list → update → delete', async () => {
  const { sb } = await newUser()
  const ex = await addExercise(sb, 'ランニング', '有酸素運動', '有酸素運動')
  const s = json<{ row: Row }>(await insertRecord(sb, { table: 'workout_sessions', data: { exercise_id: ex.id, session_date: D } })).row
  json(await insertRecord(sb, { table: 'cardio_logs', data: { session_id: s.id, time_min: 30, dist_km: 5 } }))

  const list = json<{ rows: Row[] }>(await listRecords(sb, { table: 'cardio_logs', limit: 10 }))
  assertEquals(list.rows.length, 1)
  assertEquals([list.rows[0].time_min, list.rows[0].dist_km], [30, 5])

  json(await updateRecord(sb, { table: 'cardio_logs', id: s.id as string, patch: { dist_km: 6.5, hr_bpm: null } }))
  const after = json<{ rows: Row[] }>(await listRecords(sb, { table: 'cardio_logs', limit: 10 }))
  assertEquals(after.rows[0].dist_km, 6.5)

  json(await deleteRecord(sb, { table: 'cardio_logs', id: s.id as string }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'cardio_logs', limit: 10 })).rows.length, 0)
})

Deno.test('AC-2: body_weight_logs の insert → list → update → delete', async () => {
  const { sb } = await newUser()
  const row = json<{ row: Row }>(await insertRecord(sb, { table: 'body_weight_logs', data: { log_date: D, weight_kg: 70.5 } })).row
  const list = json<{ rows: Row[] }>(await listRecords(sb, { table: 'body_weight_logs', limit: 10 }))
  assertEquals(list.rows.length, 1)

  json(await updateRecord(sb, { table: 'body_weight_logs', id: row.id as string, patch: { weight_kg: 69.9 } }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'body_weight_logs', limit: 10 })).rows[0].weight_kg, 69.9)

  json(await deleteRecord(sb, { table: 'body_weight_logs', id: row.id as string }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'body_weight_logs', limit: 10 })).rows.length, 0)
})

Deno.test('AC-2: meal_logs の insert → list → update → delete', async () => {
  const { sb } = await newUser()
  const row = json<{ row: Row }>(
    await insertRecord(sb, { table: 'meal_logs', data: { log_date: D, meal_type: '昼', protein_g: 30, fat_g: 10, carb_g: 50 } }),
  ).row
  assertEquals(row.calories_kcal, 30 * 4 + 10 * 9 + 50 * 4)
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'meal_logs', limit: 10 })).rows.length, 1)

  const upd = json<{ row: Row }>(await updateRecord(sb, { table: 'meal_logs', id: row.id as string, patch: { protein_g: 40 } })).row
  assertEquals(upd.calories_kcal, 40 * 4 + 10 * 9 + 50 * 4, 'カロリーは生成列なので更新後も再計算される')

  json(await deleteRecord(sb, { table: 'meal_logs', id: row.id as string }))
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'meal_logs', limit: 10 })).rows.length, 0)
})

// ===== AC-3: 食事の記録 =====
Deno.test('AC-3: log_meal は朝の行を1つ追加し、calories_kcal = P×4+F×9+C×4', async () => {
  const { sb } = await newUser()
  // 「朝: 鯖缶150g、豆腐160g、納豆1パック」をClaudeが推定した値の例
  const r = json<{ deduplicated: boolean; row: Row }>(
    await logMeal(sb, { date: D, meal_type: '朝', protein_g: 52, fat_g: 28, carb_g: 14 }),
  )
  assertEquals(r.deduplicated, false)
  assertEquals(r.row.meal_type, '朝')
  assertEquals(r.row.calories_kcal, 52 * 4 + 28 * 9 + 14 * 4)
  assert(!('user_id' in r.row), 'user_id は返さない')
  const { data } = await sb.from('meal_logs').select('id')
  assertEquals(data!.length, 1)
})

// ===== AC-4: セットの記録 =====
Deno.test('AC-4: 同じ種目・同じ日に2回記録すると同じセッションにset_no連番で追加される', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ベンチプレス')
  const a = json<{ set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 60, reps: 10 })).set
  const b = json<{ set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチ', date: D, weight_kg: 62.5, reps: 8 })).set
  assertEquals([a.set_no, b.set_no], [1, 2])
  assertEquals(a.session_id, b.session_id)
  assertEquals(a.session_created, true)
  assertEquals(b.session_created, false)

  const c = json<{ set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 70, reps: 5, new_session: true })).set
  assertNotEquals(c.session_id, a.session_id)
  assertEquals(c.set_no, 1)
})

Deno.test('log_workout_set: 有酸素の種目はエラーで log_cardio を案内する / 自重運動は重量0で記録できる', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ランニング', '有酸素運動', '有酸素運動')
  assertStringIncludes(errText(await logWorkoutSet(sb, { exercise: 'ランニング', date: D, weight_kg: 0, reps: 5 })), 'log_cardio')

  await addExercise(sb, '懸垂', '背中', '自重運動')
  const r = json<{ set: Row }>(await logWorkoutSet(sb, { exercise: '懸垂', date: D, weight_kg: 0, reps: 8 }))
  assertEquals(r.set.weight_kg, 0)
})

Deno.test('log_cardio: セッションを作成して保存し、再実行では指定項目だけ上書きして他は残す', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ランニング', '有酸素運動', '有酸素運動')
  const a = json<{ session_created: boolean; cardio: Row }>(
    await logCardio(sb, { exercise: 'ランニング', date: D, time: '06:30', time_min: 30, dist_km: 5, cal_kcal: 300, hr_bpm: 140 }),
  )
  assertEquals(a.session_created, true)
  const b = json<{ session_created: boolean; cardio: Row }>(
    await logCardio(sb, { exercise: 'ランニング', date: D, dist_km: 5.5 }),
  )
  assertEquals(b.session_created, false)
  assertEquals([b.cardio.dist_km, b.cardio.time_min, b.cardio.cal_kcal], [5.5, 30, 300])
  const { data } = await sb.from('workout_sessions').select('id, session_time')
  assertEquals(data!.length, 1)
  assertEquals(data![0].session_time, '06:30')

  assertStringIncludes(errText(await logCardio(sb, { exercise: 'ランニング', date: D })), '記録する値がありません')
})

// ===== AC-5: 集計 =====
Deno.test('AC-5: get_meal_summary の日別合計が、直接集計した値と一致する', async () => {
  const { sb } = await newUser()
  const meals: [string, string, number, number, number][] = [
    ['2026-10-01', '朝', 30, 10, 50], ['2026-10-01', '昼', 40.5, 20, 80], ['2026-10-01', '間食', 5, 2.5, 20],
    ['2026-10-02', '夜', 25, 15, 60], ['2026-10-04', '朝', 33, 11, 44],
  ]
  for (const [date, t, p, f, c] of meals) {
    json(await logMeal(sb, { date, meal_type: t as '朝', protein_g: p, fat_g: f, carb_g: c }))
  }
  const res = json<{ days: Row[] }>(await getMealSummary(sb, { date_from: '2026-10-01', date_to: '2026-10-31' }))

  const { data } = await sb.from('meal_logs').select('*')
  const expected = new Map<string, { p: number; f: number; c: number; k: number; n: number }>()
  for (const m of data!) {
    const e = expected.get(m.log_date) ?? { p: 0, f: 0, c: 0, k: 0, n: 0 }
    e.p += Number(m.protein_g); e.f += Number(m.fat_g); e.c += Number(m.carb_g); e.k += Number(m.calories_kcal); e.n++
    expected.set(m.log_date, e)
  }
  assertEquals(res.days.length, expected.size)
  for (const d of res.days) {
    const e = expected.get(d.log_date as string)!
    assertEquals([d.protein_g, d.fat_g, d.carb_g, d.calories_kcal, d.meal_count], [e.p, e.f, e.c, e.k, e.n], `${d.log_date}`)
  }
  assertStringIncludes(errText(await getMealSummary(sb, { date_from: '2020-01-01', date_to: '2026-10-31' })), '730日')
})

Deno.test('get_weight_trend / get_exercise_history', async () => {
  const { sb } = await newUser()
  json(await logBodyWeight(sb, { date: '2026-10-01', weight_kg: 70.2 }))
  json(await logBodyWeight(sb, { date: '2026-10-05', weight_kg: 69.8 }))
  json(await logBodyWeight(sb, { date: '2026-12-01', weight_kg: 68 }))
  const w = json<{ logs: Row[] }>(await getWeightTrend(sb, { date_from: '2026-10-01', date_to: '2026-10-31' }))
  assertEquals(w.logs.map((l) => l.weight_kg), [70.2, 69.8])

  await addExercise(sb, 'ベンチプレス')
  json(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: '2026-10-01', weight_kg: 60, reps: 10 }))
  json(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: '2026-10-08', weight_kg: 62.5, reps: 8 }))
  const h = json<{ rows: Row[] }>(await getExerciseHistory(sb, { exercise: 'ベンチプレス', limit: 5 }))
  assertEquals(h.rows.map((r) => r.session_date), ['2026-10-08', '2026-10-01'])
  const h2 = json<{ rows: Row[] }>(await getExerciseHistory(sb, { exercise: 'ベンチプレス', date_from: '2026-10-05' }))
  assertEquals(h2.rows.length, 1)
})

// ===== AC-6: 種目一覧 =====
Deno.test('AC-6: include_archived=false のとき、アーカイブ済みの種目は返らない', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ベンチプレス')
  const old = await addExercise(sb, '旧メニュー')
  json(await updateRecord(sb, { table: 'exercises', id: old.id, patch: { archived: true } }))

  const def = json<Row[]>(await listExercisesTool(sb, {}))
  assertEquals(def.map((e) => e.name), ['ベンチプレス'])
  const all = json<Row[]>(await listExercisesTool(sb, { include_archived: true }))
  assertEquals(all.length, 2)

  // アーカイブ済みは書き込み系の対象外
  assertStringIncludes(errText(await logWorkoutSet(sb, { exercise: '旧メニュー', date: D, weight_kg: 10, reps: 5 })), '見つかりません')
})

// ===== AC-7: エラー =====
Deno.test('AC-7: 存在しない種目名は、候補の種目名を含むエラーになる', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ベンチプレス')
  await addExercise(sb, 'インクラインベンチプレス')
  await addExercise(sb, 'スクワット', '足')

  const e = errText(await logWorkoutSet(sb, { exercise: 'デッドリフト', date: D, weight_kg: 100, reps: 5 }))
  for (const name of ['ベンチプレス', 'インクラインベンチプレス', 'スクワット']) assertStringIncludes(e, name)

  // 複数件に部分一致するときもエラー（候補を含む）。完全一致があればそちらを優先する
  const amb = errText(await logWorkoutSet(sb, { exercise: 'プレス', date: D, weight_kg: 10, reps: 5 }))
  assertStringIncludes(amb, 'ベンチプレス')
  assertStringIncludes(amb, 'インクラインベンチプレス')
  json(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 10, reps: 5 }))
})

Deno.test('エラーは Supabase のエラー内容をそのまま返す', async () => {
  const { sb } = await newUser()
  const msg = errText(await updateRecord(sb, { table: 'body_weight_logs', id: crypto.randomUUID(), patch: { weight_kg: 60 } }))
  assertStringIncludes(msg, '見つかりません')
  // DBの制約違反（存在しない種目を参照するセッションの追加）は、PostgRESTのエラー(コード付き)をそのまま返す
  const fk = errText(await insertRecord(sb, { table: 'workout_sessions', data: { exercise_id: 'menu_nothing', session_date: D } }))
  assertStringIncludes(fk, '[')
})

// ===== AC-8（入力検証の部分）=====
Deno.test('AC-8: table に6テーブル以外を指定するとスキーマ検証でエラーになる', () => {
  for (const bad of ['users', 'auth.users', 'menu_sets', 'pg_catalog.pg_user', '']) {
    assertEquals(listRecordsSchema.safeParse({ table: bad, limit: 10 }).success, false, `table=${bad}`)
    assertEquals(insertRecordSchema.safeParse({ table: bad, data: {} }).success, false)
  }
  assertEquals(listRecordsSchema.safeParse({ table: 'meal_logs', limit: 10 }).success, true)
  assertEquals(listRecordsSchema.safeParse({ table: 'meal_logs', limit: 201 }).success, false, 'limit は最大200')
  assertEquals(listRecordsSchema.safeParse({ table: 'meal_logs' }).success, false, 'limit は必須')
})

Deno.test('AC-8: insert/update で user_id・id・calories_kcal などの指定は拒否される', async () => {
  const { sb } = await newUser()
  for (const extra of [{ user_id: crypto.randomUUID() }, { id: crypto.randomUUID() }, { calories_kcal: 1 }]) {
    const e = errText(await insertRecord(sb, {
      table: 'meal_logs',
      data: { log_date: D, meal_type: '朝', protein_g: 1, fat_g: 1, carb_g: 1, ...extra },
    }))
    assertStringIncludes(e, '不正')
  }
  assertStringIncludes(errText(await insertRecord(sb, { table: 'sets', data: {} })), 'log_workout_set')
  assertStringIncludes(errText(await updateRecord(sb, { table: 'meal_logs', id: crypto.randomUUID(), patch: { user_id: crypto.randomUUID() } })), '不正')
  assertStringIncludes(errText(await updateRecord(sb, { table: 'meal_logs', id: crypto.randomUUID(), patch: {} })), '空')
  assertStringIncludes(errText(await deleteRecord(sb, { table: 'meal_logs', id: 'not-a-uuid' })), '形式が不正')
})

Deno.test('入力検証: 日付は実在するYYYY-MM-DDのみ / 食事は全て0を拒否', () => {
  assertEquals(dateSchema.safeParse('2026-10-11').success, true)
  for (const bad of ['2026-02-30', '2026/10/11', '今日', '2026-13-01', '20261011']) {
    assertEquals(dateSchema.safeParse(bad).success, false, bad)
  }
  assertEquals(logMealSchema.safeParse({ date: D, meal_type: '朝', protein_g: 0, fat_g: 0, carb_g: 0 }).success, false)
  assertEquals(logMealSchema.safeParse({ date: D, meal_type: '朝食', protein_g: 1, fat_g: 0, carb_g: 0 }).success, false)
})

Deno.test('exercises の追加: 同名の重複・category/typeの不整合は拒否、有酸素の組み合わせは許可', async () => {
  const { sb } = await newUser()
  await addExercise(sb, 'ベンチプレス')
  assertStringIncludes(
    errText(await insertRecord(sb, { table: 'exercises', data: { name: 'ベンチプレス', category: '胸', type: 'マシン' } })),
    '既に',
  )
  assertStringIncludes(
    errText(await insertRecord(sb, { table: 'exercises', data: { name: 'x', category: '有酸素運動', type: 'マシン' } })),
    '組み合わせ',
  )
  json(await insertRecord(sb, { table: 'exercises', data: { name: 'バイク', category: '有酸素運動', type: '有酸素運動' } }))
})

// ===== AC-9: 二重登録 =====
Deno.test('AC-9: 同じ内容の log_meal / log_body_weight / log_workout_set を再送しても行は増えない', async () => {
  const { sb } = await newUser()
  const meal = { date: D, meal_type: '朝' as const, protein_g: 30, fat_g: 10, carb_g: 50 }
  const m1 = json<{ deduplicated: boolean; row: Row }>(await logMeal(sb, meal))
  const m2 = json<{ deduplicated: boolean; row: Row }>(await logMeal(sb, meal))
  assertEquals([m1.deduplicated, m2.deduplicated], [false, true])
  assertEquals(m1.row.id, m2.row.id)
  assertEquals((await sb.from('meal_logs').select('id')).data!.length, 1)
  // 内容が違えば新しい行になる
  json(await logMeal(sb, { ...meal, protein_g: 31 }))
  assertEquals((await sb.from('meal_logs').select('id')).data!.length, 2)

  json(await logBodyWeight(sb, { date: D, weight_kg: 70 }))
  const w2 = json<{ deduplicated: boolean }>(await logBodyWeight(sb, { date: D, weight_kg: 70 }))
  assertEquals(w2.deduplicated, true)
  assertEquals((await sb.from('body_weight_logs').select('id')).data!.length, 1)

  await addExercise(sb, 'ベンチプレス')
  const s1 = json<{ deduplicated: boolean; set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 60, reps: 10 }))
  const s2 = json<{ deduplicated: boolean; set: Row }>(await logWorkoutSet(sb, { exercise: 'ベンチプレス', date: D, weight_kg: 60, reps: 10 }))
  assertEquals([s1.deduplicated, s2.deduplicated], [false, true])
  assertEquals(s1.set.id, s2.set.id)
  assertEquals((await sb.from('sets').select('id')).data!.length, 1)
})

Deno.test('AC-9: 2分より前に作られた同じ内容の記録は重複扱いにならない', async () => {
  const { sb } = await newUser()
  const meal = { date: D, meal_type: '朝' as const, protein_g: 30, fat_g: 10, carb_g: 50 }
  const m1 = json<{ row: Row }>(await logMeal(sb, meal))
  // 3分前に作られたことにする（ユーザー本人の行なのでRLS上更新できる）
  const old = new Date(Date.now() - 3 * 60 * 1000).toISOString()
  const { error } = await sb.from('meal_logs').update({ created_at: old }).eq('id', m1.row.id as string)
  assertEquals(error, null)
  const m2 = json<{ deduplicated: boolean; row: Row }>(await logMeal(sb, meal))
  assertEquals(m2.deduplicated, false)
  assertEquals((await sb.from('meal_logs').select('id')).data!.length, 2)
})

Deno.test('他のユーザーのデータは一覧にも更新にも出ない（RLS）', async () => {
  const a = await newUser()
  const b = await newUser()
  const row = json<{ row: Row }>(await logBodyWeight(a.sb, { date: D, weight_kg: 70 })).row
  assertEquals(json<{ rows: Row[] }>(await listRecords(b.sb, { table: 'body_weight_logs', limit: 10 })).rows.length, 0)
  assertStringIncludes(errText(await deleteRecord(b.sb, { table: 'body_weight_logs', id: row.id as string })), '見つかりません')
  assertEquals((await a.sb.from('body_weight_logs').select('id')).data!.length, 1)
})

// ===== メニューセット（フェーズ3で追加: list_menu_sets / save_menu_set / delete_menu_set） =====
Deno.test('メニューセット: 作成 → 一覧（並び順つき）→ 更新（置き換え）→ 削除', async () => {
  const { sb } = await newUser()
  const bench = await addExercise(sb, 'ベンチプレス')
  const fly = await addExercise(sb, 'ダンベルフライ')
  const squat = await addExercise(sb, 'スクワット', '足')

  // 名前（部分一致）とidの混在で指定でき、配列の順が並び順になる
  const created = json<{ created: boolean; id: string; exercise_ids: string[] }>(
    await saveMenuSet(sb, { name: 'プッシュデー', exercises: ['ダンベルフライ', bench.id] }),
  )
  assertEquals(created.created, true)
  assertEquals(created.exercise_ids, [fly.id, bench.id])

  const list = json<{ menu_sets: { id: string; name: string; exercises: { id: string; name: string }[] }[] }>(
    await listMenuSets(sb),
  )
  assertEquals(list.menu_sets.length, 1)
  assertEquals(list.menu_sets[0].name, 'プッシュデー')
  assertEquals(list.menu_sets[0].exercises.map((e) => e.name), ['ダンベルフライ', 'ベンチプレス'])

  // 更新は、指定した種目だけに置き換わる
  const updated = json<{ created: boolean; id: string }>(
    await saveMenuSet(sb, { menu_set_id: created.id, name: 'レッグデー', exercises: ['スクワット'] }),
  )
  assertEquals(updated.created, false)
  assertEquals(updated.id, created.id)
  const after = json<{ menu_sets: { name: string; exercises: { id: string }[] }[] }>(await listMenuSets(sb))
  assertEquals(after.menu_sets.length, 1)
  assertEquals(after.menu_sets[0].name, 'レッグデー')
  assertEquals(after.menu_sets[0].exercises.map((e) => e.id), [squat.id])

  // 削除: セットだけが消え、種目は残る
  json(await deleteMenuSet(sb, { menu_set_id: created.id }))
  assertEquals(json<{ menu_sets: unknown[] }>(await listMenuSets(sb)).menu_sets.length, 0)
  assertEquals(json<{ rows: Row[] }>(await listRecords(sb, { table: 'exercises', limit: 10 })).rows.length, 3)
})

Deno.test('メニューセット: 重複する指定は1つにまとめる', async () => {
  const { sb } = await newUser()
  const bench = await addExercise(sb, 'ベンチプレス')
  const r = json<{ exercise_ids: string[] }>(
    await saveMenuSet(sb, { name: 'A', exercises: [bench.id, 'ベンチ', 'ベンチプレス'] }),
  )
  assertEquals(r.exercise_ids, [bench.id])
})

Deno.test('メニューセット: 見つからない種目・アーカイブ済みの種目は候補つきエラーで、セットは作られない', async () => {
  const { sb } = await newUser()
  const bench = await addExercise(sb, 'ベンチプレス')
  const old = await addExercise(sb, '旧メニュー')
  json(await updateRecord(sb, { table: 'exercises', id: old.id, patch: { archived: true } }))

  assertStringIncludes(errText(await saveMenuSet(sb, { name: 'X', exercises: ['存在しない'] })), '見つかりません')
  assertStringIncludes(errText(await saveMenuSet(sb, { name: 'X', exercises: [bench.id, '旧メニュー'] })), '旧メニュー')
  assertEquals(json<{ menu_sets: unknown[] }>(await listMenuSets(sb)).menu_sets.length, 0)
})

Deno.test('メニューセット: 他のユーザーのセットは見えず、更新・削除もできない（RLS）', async () => {
  const a = await newUser()
  const b = await newUser()
  const ex = await addExercise(a.sb, 'ベンチプレス')
  const set = json<{ id: string }>(await saveMenuSet(a.sb, { name: 'A', exercises: [ex.id] }))

  assertEquals(json<{ menu_sets: unknown[] }>(await listMenuSets(b.sb)).menu_sets.length, 0)
  const bEx = await addExercise(b.sb, 'ベンチプレス')
  assertStringIncludes(errText(await saveMenuSet(b.sb, { menu_set_id: set.id, name: 'B', exercises: [bEx.id] })), '見つかりません')
  assertStringIncludes(errText(await deleteMenuSet(b.sb, { menu_set_id: set.id })), '見つかりません')
  assertEquals(json<{ menu_sets: { name: string }[] }>(await listMenuSets(a.sb)).menu_sets[0].name, 'A')
})

Deno.test('メニューセット: 入力検証（空の名前・空の種目配列・長すぎる名前）', () => {
  assert(!saveMenuSetSchema.safeParse({ name: '', exercises: ['a'] }).success)
  assert(!saveMenuSetSchema.safeParse({ name: 'A', exercises: [] }).success)
  assert(!saveMenuSetSchema.safeParse({ name: 'あ'.repeat(31), exercises: ['a'] }).success)
  assert(saveMenuSetSchema.safeParse({ name: 'あ'.repeat(30), exercises: ['a'] }).success)
})
