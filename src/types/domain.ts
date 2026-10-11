// 画面・計算ロジックで使うドメイン型。DBの行(src/types/database.ts)から変換して使う。
import type { Tables } from './database'

export type Exercise = Pick<
  Tables<'exercises'>,
  'id' | 'name' | 'category' | 'type' | 'archived' | 'sort_order'
>

export type SetEntry = {
  id: string
  setNo: number
  weight: number
  reps: number
}

export type Cardio = {
  time: number | null
  dist: number | null
  cal: number | null
  hr: number | null
  maxSpd: number | null
  avgSpd: number | null
}

export type SessionData = {
  id: string
  exerciseId: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time: string
  createdAt: string
  /** 筋トレのセット（set_no順）。有酸素のセッションでは空 */
  sets: SetEntry[]
  /** 有酸素の記録。筋トレのセッションでは null */
  cardio: Cardio | null
}

export type BodyWeightLog = Pick<
  Tables<'body_weight_logs'>,
  'id' | 'log_date' | 'weight_kg' | 'created_at'
>

export type MealLog = Pick<
  Tables<'meal_logs'>,
  | 'id'
  | 'log_date'
  | 'meal_type'
  | 'protein_g'
  | 'fat_g'
  | 'carb_g'
  | 'calories_kcal'
  | 'created_at'
>

export type MenuSet = {
  id: string
  name: string
  /** セット内の並び順（position順）に並んだ種目id */
  exerciseIds: string[]
}
