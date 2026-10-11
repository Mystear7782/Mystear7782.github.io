// 旧アプリ（素のJS版）のメニューセットを、DBへ一度だけ移行する。
//
// 旧アプリは localStorage の gl_menusets（[{id, name, menuIds}]）に保存していた。新アプリは同じオリジンなので
// そのまま読める。移行の条件: gl_menusets があり、DBの menu_sets が空であること。
// 成功したら gl_menusets を gl_menusets_migrated に名前を変えて残す（すぐには消さない）。
// 存在しないメニュー(exercises)を参照しているセット項目は飛ばし、件数を報告する。
import { saveMenuSet } from '@/api/menuSets'

const LEGACY_KEY = 'gl_menusets'
const MIGRATED_KEY = 'gl_menusets_migrated'

export type LegacyMenuSet = { id?: string; name: string; menuIds: string[] }

export type MigrationResult = {
  /** 移行できたセット数 */
  migrated: number
  /** 存在しないメニューを参照していたため飛ばした項目数 */
  skippedItems: number
  /** メニューが1つも残らず移行できなかったセット数 */
  skippedSets: number
  /** 保存に失敗したセット数 */
  failedSets: number
}

/** 旧アプリのメニューセットを読み取る。無い/壊れている/空のときは null */
export function readLegacyMenuSets(storage: Storage = localStorage): LegacyMenuSet[] | null {
  let raw: string | null
  try {
    raw = storage.getItem(LEGACY_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const sets = parsed.filter(
      (s): s is LegacyMenuSet =>
        !!s &&
        typeof s.name === 'string' &&
        Array.isArray(s.menuIds) &&
        s.menuIds.every((i: unknown) => typeof i === 'string'),
    )
    return sets.length ? sets : null
  } catch {
    return null
  }
}

let running = false

/**
 * 移行を実行する。移行対象が無い(または別の実行が進行中)なら null。
 * @param exerciseIds DBに存在するメニューのid
 */
export async function migrateLegacyMenuSets(
  exerciseIds: Set<string>,
  storage: Storage = localStorage,
): Promise<MigrationResult | null> {
  if (running) return null
  const legacy = readLegacyMenuSets(storage)
  if (!legacy) return null
  running = true
  try {
    const result: MigrationResult = { migrated: 0, skippedItems: 0, skippedSets: 0, failedSets: 0 }
    for (const set of legacy) {
      const valid = [...new Set(set.menuIds)].filter((id) => exerciseIds.has(id))
      result.skippedItems += set.menuIds.length - valid.length
      if (valid.length === 0) {
        result.skippedSets++
        continue
      }
      try {
        await saveMenuSet({ name: set.name, exerciseIds: valid })
        result.migrated++
      } catch (e) {
        console.error('failed to migrate a menu set', set, e)
        result.failedSets++
      }
    }
    // すべて処理できたときだけ、旧データに「移行済み」の印を付ける
    if (result.failedSets === 0) {
      try {
        storage.setItem(MIGRATED_KEY, storage.getItem(LEGACY_KEY) ?? '')
        storage.removeItem(LEGACY_KEY)
      } catch {
        /* localStorageが使えない場合は何もしない */
      }
    }
    return result
  } finally {
    running = false
  }
}
