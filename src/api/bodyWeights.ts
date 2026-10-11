// 体重ログ（body_weight_logs）。同日に複数回の記録を許容する（一意制約なし）。
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { reportError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { BodyWeightLog } from '@/types/domain'
import { queryKeys } from './keys'
import { fetchAll } from './paging'

const COLUMNS = 'id, log_date, weight_kg, created_at'

/** 日付の新しい順（同日は作成の新しい順） */
const sortDesc = (list: BodyWeightLog[]) =>
  [...list].sort(
    (a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at),
  )

export async function fetchBodyWeights(): Promise<BodyWeightLog[]> {
  return fetchAll<BodyWeightLog>((from, to) =>
    supabase
      .from('body_weight_logs')
      .select(COLUMNS)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )
}

export function useBodyWeights() {
  return useQuery({ queryKey: queryKeys.bodyWeights, queryFn: fetchBodyWeights })
}

const patch = (qc: QueryClient, fn: (list: BodyWeightLog[]) => BodyWeightLog[]) =>
  qc.setQueryData<BodyWeightLog[]>(queryKeys.bodyWeights, (old) => (old ? sortDesc(fn(old)) : old))

export function useSaveBodyWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id?: string; date: string; weight: number }) => {
      if (a.id) {
        const { data, error } = await supabase
          .from('body_weight_logs')
          .update({ log_date: a.date, weight_kg: a.weight })
          .eq('id', a.id)
          .select(COLUMNS)
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('body_weight_logs')
        .insert({ log_date: a.date, weight_kg: a.weight })
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => patch(qc, (list) => [...list.filter((x) => x.id !== row.id), row]),
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteBodyWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('body_weight_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => patch(qc, (list) => list.filter((x) => x.id !== id)),
    onError: (e) => reportError(e, '削除に失敗しました（通信を確認してください）'),
  })
}
