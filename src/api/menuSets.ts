// メニューセット（menu_sets / menu_set_items）。
// 旧アプリはlocalStorage(gl_menusets)に保存していたが、DBへ移行した（初回起動時の一度きりの移行は
// features/menu-sets/migrateLegacy.ts）。作成・更新は save_menu_set RPC で1トランザクションにしている。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { MenuSet } from '@/types/domain'
import { queryKeys } from './keys'
import { fetchAll } from './paging'

type MenuSetRow = {
  id: string
  name: string
  created_at: string
  menu_set_items: { exercise_id: string; position: number }[] | null
}

export async function fetchMenuSets(): Promise<MenuSet[]> {
  const rows = await fetchAll<MenuSetRow>(
    (from, to) =>
      supabase
        .from('menu_sets')
        .select('id, name, created_at, menu_set_items(exercise_id, position)')
        .order('created_at')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{
        data: MenuSetRow[] | null
        error: { message: string } | null
      }>,
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    exerciseIds: [...(r.menu_set_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => i.exercise_id),
  }))
}

export function useMenuSets() {
  return useQuery({ queryKey: queryKeys.menuSets, queryFn: fetchMenuSets })
}

/** セットの作成(id なし)・更新(id あり)。exerciseIds の順序がそのまま並び順になる */
export async function saveMenuSet(a: {
  id?: string
  name: string
  exerciseIds: string[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_menu_set', {
    p_id: (a.id ?? null) as unknown as string,
    p_name: a.name,
    p_exercise_ids: a.exerciseIds,
  })
  if (error) throw error
  return data
}

export function useSaveMenuSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveMenuSet,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.menuSets }),
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteMenuSet() {
  const qc = useQueryClient()
  return useMutation({
    // menu_set_items は外部キーのCASCADEで連鎖削除される
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_sets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) =>
      qc.setQueryData<MenuSet[]>(queryKeys.menuSets, (old) => old?.filter((s) => s.id !== id)),
    onError: (e) => reportError(e, '削除に失敗しました（通信を確認してください）'),
  })
}

/** セット内の並び順を保存する（positionだけを1文で更新するため、途中で壊れた並びにならない） */
export function useReorderMenuSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { setId: string; exerciseIds: string[] }) => {
      const { error } = await supabase.from('menu_set_items').upsert(
        a.exerciseIds.map((exerciseId, position) => ({
          menu_set_id: a.setId,
          exercise_id: exerciseId,
          position,
        })),
        { onConflict: 'menu_set_id,exercise_id' },
      )
      if (error) throw error
    },
    onSuccess: (_d, a) =>
      qc.setQueryData<MenuSet[]>(queryKeys.menuSets, (old) =>
        old?.map((s) => (s.id === a.setId ? { ...s, exerciseIds: a.exerciseIds } : s)),
      ),
    onError: (e) => reportError(e, '並び順の保存に失敗しました（通信を確認してください）'),
  })
}
