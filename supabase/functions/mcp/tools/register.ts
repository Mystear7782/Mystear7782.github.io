// MCPサーバーへのツール登録。ツール本体は tools/*.ts にあり、ここでは名前・説明・
// 入力スキーマ・注釈(annotations)を付けて結びつけるだけにしている。
import type { McpServer } from '@modelcontextprotocol/server'
import type { Client } from '../lib/exercises.ts'
import {
  deleteRecord,
  deleteRecordSchema,
  insertRecord,
  insertRecordSchema,
  listRecords,
  listRecordsSchema,
  updateRecord,
  updateRecordSchema,
} from './crud.ts'
import {
  deleteMenuSet,
  deleteMenuSetSchema,
  listMenuSets,
  listMenuSetsSchema,
  saveMenuSet,
  saveMenuSetSchema,
} from './menu-sets.ts'
import {
  getExerciseHistory,
  getExerciseHistorySchema,
  getMealSummary,
  getMealSummarySchema,
  getWeightTrend,
  getWeightTrendSchema,
  listExercisesSchema,
  listExercisesTool,
} from './read.ts'
import {
  logBodyWeight,
  logBodyWeightSchema,
  logCardio,
  logCardioSchema,
  logMeal,
  logMealSchema,
  logWorkoutSet,
  logWorkoutSetSchema,
} from './write.ts'

const DATE_NOTE =
  '日付は日本時間のYYYY-MM-DDで指定する。「今日」「昨日」などの解釈は呼び出し側(Claude)が日本時間で行うこと（サーバーはUTCで動くため、サーバー側では今日の日付を決めない）。'

// 読み取り専用 / 追加のみ(破壊的でない) / 破壊的 の3種類の注釈
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }

export function registerTools(server: McpServer, sb: Client): void {
  // ===== 書き込み系 =====
  server.registerTool('log_meal', {
    title: '食事を記録',
    description:
      '食事1回分のPFC(たんぱく質・脂質・炭水化物, g)を meal_logs に追加する。食事内容からのPFCの推定は呼び出し側(Claude)が行い、その数値を渡す。' +
      'calories_kcal は DB が自動計算する(P×4+F×9+C×4)ので渡さない。' + DATE_NOTE +
      '直近2分以内に同じ内容の記録があれば、新規作成せずその既存行を返す(deduplicated: true)。',
    inputSchema: logMealSchema,
    annotations: WRITE,
  }, (a) => logMeal(sb, a))

  server.registerTool('log_body_weight', {
    title: '体重を記録',
    description:
      '体重ログを1件追加する(同日に複数回記録できる。常に新規追加)。' + DATE_NOTE +
      '直近2分以内に同じ日付・同じ体重の記録があれば、新規作成せずその既存行を返す。',
    inputSchema: logBodyWeightSchema,
    annotations: WRITE,
  }, (a) => logBodyWeight(sb, a))

  server.registerTool('log_workout_set', {
    title: '筋トレのセットを記録',
    description:
      '筋トレ(有酸素以外)のセットを1件追加する。同じ種目・同じ日のセッションがあれば最新のものに追加し、なければ作成する(new_session=true で常に新規作成)。' +
      'exercise は種目名(部分一致可)またはid。見つからない/複数該当のときは候補を含むエラーになる。' + DATE_NOTE +
      '直近2分以内に同じ種目・日付・重量・回数のセットがあれば、新規作成せずその既存行を返す。',
    inputSchema: logWorkoutSetSchema,
    annotations: WRITE,
  }, (a) => logWorkoutSet(sb, a))

  server.registerTool('log_cardio', {
    title: '有酸素運動を記録',
    description:
      '有酸素運動の記録を保存する。同じ種目・同じ日のセッション(なければ作成)の cardio_logs に、指定した項目だけを保存する(既存の値は残る)。' +
      DATE_NOTE,
    inputSchema: logCardioSchema,
    annotations: WRITE,
  }, (a) => logCardio(sb, a))

  server.registerTool('save_menu_set', {
    title: 'メニューセットを保存',
    description:
      'メニューセット（名前を付けた種目の組み合わせ）を作成または更新する。menu_set_id を省略すると新規作成、指定するとそのセットの名前と所属種目を置き換える' +
      '（更新は既存の内容を書き換えるので、実行前にユーザーへ変更内容を確認すること）。' +
      'exercises は種目名(部分一致可)またはidの配列で、配列の順がセット内の並び順になる。見つからない/複数該当のときは候補を含むエラーになる。',
    inputSchema: saveMenuSetSchema,
    annotations: WRITE,
  }, (a) => saveMenuSet(sb, a))

  // ===== 読み取り・集計系 =====
  server.registerTool('list_menu_sets', {
    title: 'メニューセット一覧',
    description: 'メニューセットの一覧を、含まれる種目（セット内の並び順）つきで返す。',
    inputSchema: listMenuSetsSchema,
    annotations: READ,
  }, (a) => listMenuSets(sb, a))

  server.registerTool('list_exercises', {
    title: '種目一覧',
    description: '種目(メニュー)のマスタ一覧を返す。既定ではアーカイブ済みを含まない。',
    inputSchema: listExercisesSchema,
    annotations: READ,
  }, (a) => listExercisesTool(sb, a))

  server.registerTool('get_meal_summary', {
    title: '食事の日別集計',
    description: '期間内の食事を日付ごとに集計する(P/F/C・カロリー合計と記録件数)。期間は730日以内。' + DATE_NOTE,
    inputSchema: getMealSummarySchema,
    annotations: READ,
  }, (a) => getMealSummary(sb, a))

  server.registerTool('get_weight_trend', {
    title: '体重の推移',
    description: '期間内の体重ログを日付順に返す。期間は730日以内。' + DATE_NOTE,
    inputSchema: getWeightTrendSchema,
    annotations: READ,
  }, (a) => getWeightTrend(sb, a))

  server.registerTool('get_exercise_history', {
    title: '種目の履歴',
    description:
      '種目ごとの履歴を新しいセッションから返す。筋トレはセットごと(日付・セット番号・重量・回数)、有酸素はセッションごとの各値。',
    inputSchema: getExerciseHistorySchema,
    annotations: READ,
  }, (a) => getExerciseHistory(sb, a))

  server.registerTool('delete_menu_set', {
    title: 'メニューセットを削除',
    description:
      'メニューセットを1件削除する。元に戻せない操作なので、実行前に必ずユーザーへ削除対象を確認すること。' +
      'セットに含まれていた種目そのものと、その記録は削除されない。',
    inputSchema: deleteMenuSetSchema,
    annotations: DESTRUCTIVE,
  }, (a) => deleteMenuSet(sb, a))

  // ===== 汎用CRUD =====
  server.registerTool('list_records', {
    title: 'レコード一覧(汎用)',
    description:
      '6テーブル(exercises / workout_sessions / sets / cardio_logs / body_weight_logs / meal_logs)のいずれかの行を新しい順に返す。' +
      'limit は必須(最大200)。日付で絞る場合は date_from / date_to。' + DATE_NOTE,
    inputSchema: listRecordsSchema,
    annotations: READ,
  }, (a) => listRecords(sb, a))

  server.registerTool('insert_record', {
    title: 'レコード追加(汎用)',
    description:
      '6テーブルのいずれかに1行追加する(sets は不可。log_workout_set を使う)。exercises の id はサーバーが採番する。' +
      '食事・体重・セット・有酸素の通常の記録は log_* ツールを優先すること。' + DATE_NOTE,
    inputSchema: insertRecordSchema,
    annotations: WRITE,
  }, (a) => insertRecord(sb, a))

  server.registerTool('update_record', {
    title: 'レコード更新(汎用)',
    description:
      '1行を更新する。既存データを書き換える操作なので、実行前に必ずユーザーへ変更内容を確認すること。一括更新はできない。',
    inputSchema: updateRecordSchema,
    annotations: DESTRUCTIVE,
  }, (a) => updateRecord(sb, a))

  server.registerTool('delete_record', {
    title: 'レコード削除(汎用)',
    description:
      '1行を削除する。元に戻せない操作なので、実行前に必ずユーザーへ削除対象を確認すること。' +
      'exercises を削除すると、その種目のセッション・セット・有酸素記録もすべて連鎖して削除される。一括削除はできない。',
    inputSchema: deleteRecordSchema,
    annotations: DESTRUCTIVE,
  }, (a) => deleteRecord(sb, a))
}
