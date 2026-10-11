// 食事記録（meal_logs）。calories_kcal はDBの生成列（P×4 + F×9 + C×4）なので書き込まない。
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { reportError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { MealLog } from '@/types/domain'
import { queryKeys } from './keys'
import { fetchAll } from './paging'

const COLUMNS = 'id, log_date, meal_type, protein_g, fat_g, carb_g, calories_kcal, created_at'

const sortDesc = (list: MealLog[]) =>
  [...list].sort(
    (a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at),
  )

export async function fetchMeals(): Promise<MealLog[]> {
  return fetchAll<MealLog>((from, to) =>
    supabase
      .from('meal_logs')
      .select(COLUMNS)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )
}

export function useMeals() {
  return useQuery({ queryKey: queryKeys.meals, queryFn: fetchMeals })
}

const patch = (qc: QueryClient, fn: (list: MealLog[]) => MealLog[]) =>
  qc.setQueryData<MealLog[]>(queryKeys.meals, (old) => (old ? sortDesc(fn(old)) : old))

export type MealInput = {
  id?: string
  date: string
  mealType: string
  protein: number
  fat: number
  carb: number
}

export function useSaveMeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: MealInput) => {
      const values = {
        log_date: a.date,
        meal_type: a.mealType,
        protein_g: a.protein,
        fat_g: a.fat,
        carb_g: a.carb,
      }
      if (a.id) {
        const { data, error } = await supabase
          .from('meal_logs')
          .update(values)
          .eq('id', a.id)
          .select(COLUMNS)
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('meal_logs')
        .insert(values)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => patch(qc, (list) => [...list.filter((x) => x.id !== row.id), row]),
    onError: (e) => reportError(e, '保存に失敗しました（通信を確認してください）'),
  })
}

export function useDeleteMeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => patch(qc, (list) => list.filter((x) => x.id !== id)),
    onError: (e) => reportError(e, '削除に失敗しました（通信を確認してください）'),
  })
}
