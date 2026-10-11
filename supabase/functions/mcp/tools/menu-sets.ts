// メニューセット系ツール: list_menu_sets / save_menu_set / delete_menu_set
// メニューセット = 名前を付けた種目の組み合わせ（menu_sets と menu_set_items）。
// 作成・更新は DB の RPC save_menu_set（セットと所属を1トランザクションで入れ替える）を使い、
// 汎用CRUD（insert_record 等）の対象には含めない（所属の並び順を安全に扱うため）。
import { z } from 'zod'
import { type Client, listExercises, resolveExercise } from '../lib/exercises.ts'
import { run, throwIfError, ToolError } from '../lib/result.ts'

const NAME_MAX = 30

// ===== list_menu_sets =====
export const listMenuSetsSchema = z.object({})
export type ListMenuSetsArgs = z.infer<typeof listMenuSetsSchema>

export function listMenuSets(sb: Client, _a: ListMenuSetsArgs = {}) {
  return run(async () => {
    const { data, error } = await sb
      .from('menu_sets')
      .select('id, name, created_at, menu_set_items(exercise_id, position)')
      .order('created_at', { ascending: true })
    throwIfError(error)

    const exercises = new Map((await listExercises(sb)).map((e) => [e.id, e]))
    return {
      menu_sets: (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        exercises: [...(s.menu_set_items ?? [])]
          .sort((x, y) => x.position - y.position)
          .map((i) => {
            const e = exercises.get(i.exercise_id)
            return { id: i.exercise_id, name: e?.name ?? null, category: e?.category ?? null }
          }),
      })),
    }
  })
}

// ===== save_menu_set =====
export const saveMenuSetSchema = z.object({
  menu_set_id: z.string().uuid().optional().describe(
    '更新するメニューセットのid（list_menu_sets で確認）。省略すると新規作成',
  ),
  name: z.string().trim().min(1).max(NAME_MAX).describe(`セット名（${NAME_MAX}文字以内）`),
  exercises: z.array(z.string().min(1)).min(1).max(50).describe(
    '含める種目（名前（部分一致可）またはid）。配列の順がセット内の並び順になる。' +
      '更新のときは、ここに書いた種目だけがセットに残る（置き換え）。アーカイブ済みの種目は指定できない',
  ),
})
export type SaveMenuSetArgs = z.infer<typeof saveMenuSetSchema>

export function saveMenuSet(sb: Client, a: SaveMenuSetArgs) {
  return run(async () => {
    // 種目名をidに解決する（見つからない/複数該当のときは候補つきのエラー）。重複は最初の位置だけ残す
    const ids: string[] = []
    for (const input of a.exercises) {
      const ex = await resolveExercise(sb, input)
      if (!ids.includes(ex.id)) ids.push(ex.id)
    }
    const { data, error } = await sb.rpc('save_menu_set', {
      // RPCの引数は nullable（nullで新規作成）。生成された型は null を許さないためキャストする
      p_id: (a.menu_set_id ?? null) as unknown as string,
      p_name: a.name,
      p_exercise_ids: ids,
    })
    throwIfError(error)
    return { created: !a.menu_set_id, id: data, name: a.name, exercise_ids: ids }
  })
}

// ===== delete_menu_set =====
export const deleteMenuSetSchema = z.object({
  menu_set_id: z.string().uuid().describe('削除するメニューセットのid'),
})
export type DeleteMenuSetArgs = z.infer<typeof deleteMenuSetSchema>

export function deleteMenuSet(sb: Client, a: DeleteMenuSetArgs) {
  return run(async () => {
    // 所属(menu_set_items)はFKのCASCADEで消える。種目そのものと記録は消えない
    const { data, error } = await sb.from('menu_sets').delete().eq('id', a.menu_set_id).select('id, name')
    throwIfError(error)
    if (!data || data.length === 0) {
      throw new ToolError(`メニューセット(id=${a.menu_set_id})が見つかりません。`)
    }
    return { deleted: data[0] }
  })
}
