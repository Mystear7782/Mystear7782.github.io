// CSVインポート。
//
// 仕様（旧アプリを踏襲しつつ、DB書き込みを「セッション単位」にまとめて高速化・安全化している）:
// - 行をメニュー名+部位で既存メニューに結びつける。未登録のメニューは自動で新規登録する。
// - session_id が空欄の行は、同じ日付・同じメニューを1つのセッションにまとめる。
// - 既存のセッションと重複する場合はスキップする（上書きなし）。重複の判定:
//     (a) CSVの session_id が既存セッションのidと一致する（エクスポートしたファイルの再インポート）
//     (b) 同じメニュー・日付・時刻で、セット内容(筋トレ)/有酸素の値が完全に同じセッションが既にある
//   (b) により、session_id が違っていても同じ内容のCSVを2回取り込んでも二重登録にならない。
// - 筋トレは1セッションにつき sets を1回のINSERTでまとめて登録する。途中で失敗したら、作ったセッションを取り消す。
import type { Cardio, Exercise, SessionData } from '@/types/domain'
import { insertExercise } from '@/api/exercises'
import { deleteSessionRow, insertSession, insertSets, upsertCardio } from '@/api/sessions'
import { CARDIO } from '@/lib/constants'
import { parseCsv } from '@/lib/csv'

export type ImportSummary = {
  imported: number
  skipped: number
  menuCreated: number
  errors: number
}

export class CsvFormatError extends Error {}

type Group = {
  menu: Exercise
  date: string
  time: string
  csvSessionId: string
  /** CSVの session_id が既存セッションのidと一致していたか */
  sets: { weight: number; reps: number }[]
  cardio: Cardio | null
}

const numOrNull = (v: string | undefined): number | null =>
  v !== undefined && v !== '' ? +v : null

function sameSets(a: SessionData['sets'], b: Group['sets']): boolean {
  return (
    a.length === b.length && a.every((s, i) => s.weight === b[i].weight && s.reps === b[i].reps)
  )
}
function sameCardio(a: Cardio | null, b: Cardio | null): boolean {
  if (!a || !b) return false
  return (['time', 'dist', 'cal', 'hr', 'maxSpd', 'avgSpd'] as const).every(
    (k) => (a[k] ?? null) === (b[k] ?? null),
  )
}

/**
 * CSVの本文を取り込む。
 * @param exercises 取り込み前のメニュー一覧
 * @param sessions 取り込み前の全セッション（重複判定用。最新の状態を渡すこと）
 */
export async function importCsvText(
  text: string,
  exercises: Exercise[],
  sessions: SessionData[],
): Promise<ImportSummary> {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new CsvFormatError('データが空です')

  const header = rows[0].map((h) => h.toLowerCase().replace(/"/g, '').trim())
  const col = (k: string) => header.indexOf(k)
  const isCardio = header.includes('time_min') || header.includes('dist_km')

  const summary: ImportSummary = { imported: 0, skipped: 0, menuCreated: 0, errors: 0 }
  const menus = [...exercises]
  const existingIds = new Set(sessions.map((s) => s.id))
  const groups = new Map<string, Group>()
  /** 空欄session_idの自動割当: 同じ日付・同じメニューの行をまとめるキー */
  const autoKeys = new Map<string, string>()

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.length < 4) continue
    const menuName = r[col('menu_name')]?.replace(/^"|"$/g, '').trim()
    const category = r[col('category')]?.trim()
    const date = r[col('date')]?.trim()
    const rawSessionId = col('session_id') >= 0 ? (r[col('session_id')]?.trim() ?? '') : ''
    // 旧形式のCSV（session_time列なし）は 00:00 として扱う
    const time =
      col('session_time') >= 0 && r[col('session_time')] ? r[col('session_time')].trim() : '00:00'
    if (!menuName || !category || !date) continue

    // 未登録のメニューは自動で新規登録する
    let menu = menus.find((m) => m.name === menuName && m.category === category)
    if (!menu) {
      const type = isCardio
        ? CARDIO
        : col('type') >= 0
          ? r[col('type')]?.trim() || 'マシン'
          : 'マシン'
      try {
        menu = await insertExercise({ name: menuName, category, type }, menus)
      } catch (e) {
        console.error('failed to create a menu while importing', menuName, e)
        summary.errors++
        continue
      }
      menus.push(menu)
      summary.menuCreated++
    }

    let csvSessionId = rawSessionId
    if (!csvSessionId) {
      const autoKey = `${menu.id}_${date}`
      if (!autoKeys.has(autoKey)) autoKeys.set(autoKey, `auto_${autoKeys.size}_${autoKey}`)
      csvSessionId = autoKeys.get(autoKey)!
    }

    const groupKey = `${menu.id}\u0000${csvSessionId}`
    let g = groups.get(groupKey)
    if (!g) {
      g = { menu, date, time, csvSessionId, sets: [], cardio: null }
      groups.set(groupKey, g)
    }

    if (isCardio) {
      g.cardio = {
        time: numOrNull(r[col('time_min')]),
        dist: numOrNull(r[col('dist_km')]),
        cal: numOrNull(r[col('cal_kcal')]),
        hr: numOrNull(r[col('hr_bpm')]),
        maxSpd: col('max_spd_kmh') >= 0 ? numOrNull(r[col('max_spd_kmh')]) : null,
        avgSpd: col('avg_spd_kmh') >= 0 ? numOrNull(r[col('avg_spd_kmh')]) : null,
      }
    } else {
      const weight = parseFloat(r[col('weight_kg')])
      const reps = parseInt(r[col('reps')], 10)
      if (isNaN(weight) || isNaN(reps)) continue
      g.sets.push({ weight, reps })
    }
  }

  const sessionsOf = (menuId: string) => sessions.filter((s) => s.exerciseId === menuId)

  for (const g of groups.values()) {
    const units = isCardio ? 1 : g.sets.length // 件数の数え方: 有酸素はセッション、筋トレはセット
    if (units === 0) continue

    const duplicate =
      existingIds.has(g.csvSessionId) ||
      sessionsOf(g.menu.id).some(
        (s) =>
          s.date === g.date &&
          s.time === g.time &&
          (isCardio ? sameCardio(s.cardio, g.cardio) : sameSets(s.sets, g.sets)),
      )
    if (duplicate) {
      summary.skipped += units
      continue
    }

    let createdId: string | null = null
    try {
      createdId = (await insertSession(g.menu.id, g.date, g.time)).id
      if (isCardio && g.cardio) await upsertCardio(createdId, g.cardio)
      else await insertSets(createdId, g.sets)
      summary.imported += units
    } catch (e) {
      console.error('failed to import a session', g, e)
      // セッションだけが残らないよう、作った分は取り消す
      if (createdId) await deleteSessionRow(createdId).catch(() => undefined)
      summary.errors += units
    }
  }
  return summary
}

/** 結果メッセージ（複数行） */
export function summaryMessage(s: ImportSummary): string {
  const msgs = [`${s.imported}件をインポートしました`]
  if (s.menuCreated) msgs.push(`未登録メニュー ${s.menuCreated}件を新規登録`)
  if (s.skipped) msgs.push(`重複 ${s.skipped}件をスキップ`)
  if (s.errors) msgs.push(`${s.errors}件でエラーが発生しました（通信を確認してください）`)
  return msgs.join('\n')
}
