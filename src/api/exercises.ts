// メニュー（種目: exercises）の取得・追加・更新・削除・並び替え。
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { isUniqueViolation, reportError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Exercise } from '@/types/domain'
import { queryKeys } from './keys'
import { fetchAll } from './paging'

const COLUMNS = 'id, name, category, type, archived, sort_order'

export async function fetchExercises(): Promise<Exercise[]> {
  return fetchAll<Exercise>((from, to) =>
    supabase
      .from('exercises')
      .select(COLUMNS)
      .order('category')
      .order('sort_order')
      .order('created_at')
      .order('id')
      .range(from, to),
  )
}

export function useExercises() {
  return useQuery({ queryKey: queryKeys.exercises, queryFn: fetchExercises })
}

/** 部位→並び順(sort_order)の順。同じ並び順どうしは元の順序を保つ（Array.sortは安定ソート） */
const sortExercises = (list: Exercise[]) =>
  [...list].sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order)

/** 既存メニューのキャッシュを更新する（サーバーの応答を受け取った後にだけ呼ぶ） */
function patchExercises(qc: QueryClient, fn: (list: Exercise[]) => Exercise[]) {
  qc.setQueryData<Exercise[]>(queryKeys.exercises, (old) => (old ? sortExercises(fn(old)) : old))
}

export type NewExercise = { name: string; category: string; type: string }

/** idは menu_<epoch ms>（旧アプリ・MCPと同じ形式）。部位内の末尾に追加する */
export async function insertExercise(input: NewExercise, existing: Exercise[]): Promise<Exercise> {
  const sortOrder = existing
    .filter((e) => e.category === input.category)
    .reduce((max, e) => Math.max(max, e.sort_order + 1), 0)
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      id: `menu_${Date.now()}`,
      name: input.name,
      category: input.category,
      type: input.type,
      archived: false,
      sort_order: sortOrder,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export function useAddExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, existing }: { input: NewExercise; existing: Exercise[] }) =>
      insertExercise(input, existing),
    onSuccess: (created) => patchExercises(qc, (list) => [...list, created]),
    onError: (e) =>
      // 画面の一覧が古いまま操作しても、DBの一意制約(アーカイブ前の同名)で防がれる
      isUniqueViolation(e)
        ? reportError(e, '同じ部位に同名のメニューがあります')
        : reportError(e, 'メニューの追加に失敗しました（通信を確認してください）'),
  })
}

export type ExercisePatch = Partial<Pick<Exercise, 'name' | 'category' | 'type' | 'archived'>>

export function useUpdateExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ExercisePatch }) => {
      const { error } = await supabase.from('exercises').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, { id, patch }) =>
      patchExercises(qc, (list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    onError: (e) =>
      isUniqueViolation(e)
        ? reportError(e, '同じ部位に同名のメニューがあります')
        : reportError(e, 'サーバーへの反映に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteExercise() {
  const qc = useQueryClient()
  return useMutation({
    // セッション・セット・有酸素記録・セット内の所属は外部キーのCASCADEで連鎖削除される
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      patchExercises(qc, (list) => list.filter((e) => e.id !== id))
      // 連鎖削除された記録・セット所属のキャッシュも古くなる
      void qc.invalidateQueries({ queryKey: queryKeys.sessions })
      void qc.invalidateQueries({ queryKey: queryKeys.menuSets })
    },
    onError: (e) => reportError(e, 'サーバーからの削除に失敗しました（通信を確認してください）'),
  })
}

/**
 * 同一部位内の並び順を保存する。orderedIds は部位内の全メニューのid（新しい順序）。
 * sort_order を 0,1,2… で振り直す。
 */
export function useReorderExercises() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('exercises').update({ sort_order: idx }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: (_d, orderedIds) =>
      patchExercises(qc, (list) =>
        list.map((e) => {
          const idx = orderedIds.indexOf(e.id)
          return idx >= 0 ? { ...e, sort_order: idx } : e
        }),
      ),
    onError: (e) =>
      // 失敗時はキャッシュを更新しない（画面は元の並びに戻る）
      reportError(e, '並び順の保存に失敗しました（元に戻しました。通信を確認してください）'),
  })
}
