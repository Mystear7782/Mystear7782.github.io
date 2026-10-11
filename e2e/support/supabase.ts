// E2E用のSupabase操作（ローカルのSupabaseのみ）。テスト用ユーザーの作成・ログイン・データの投入。
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database'

const env = (k: string): string => {
  const v = process.env[k]
  if (!v) throw new Error(`環境変数 ${k} が未設定です（playwright.config.ts が設定します）`)
  return v
}

export const apiUrl = () => env('E2E_SUPABASE_URL')
const publishableKey = () => env('E2E_SUPABASE_PUBLISHABLE_KEY')

/** supabase-js が認証セッションを保存する localStorage のキー（sb-<ホスト名の最初の要素>-auth-token） */
export const authStorageKey = () => `sb-${new URL(apiUrl()).hostname.split('.')[0]}-auth-token`

export type TestUser = { id: string; email: string; password: string; session: Session }

/** テストごとに新しいユーザーを作る。ユーザーごとにRLSでデータが分離されるので、後始末は不要 */
export async function createTestUser(): Promise<TestUser> {
  const admin = createClient<Database>(apiUrl(), env('E2E_SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `e2e-${crypto.randomUUID().slice(0, 8)}@example.test`
  const password = crypto.randomUUID()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  const anon = createClient<Database>(apiUrl(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password })
  if (signErr || !signIn.session) throw signErr ?? new Error('no session')
  return { id: data.user.id, email, password, session: signIn.session }
}

type SeedMenu = {
  category: string
  type?: string
  name: string
  archived?: boolean
  sortOrder?: number
}

/** ユーザー本人として、画面を介さずにデータを投入する（テストの前提条件づくり用） */
export class Seeder {
  readonly client: SupabaseClient<Database>
  private counter = 0

  constructor(accessToken: string) {
    this.client = createClient<Database>(apiUrl(), publishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
  }

  /** メニューを1件作り、そのidを返す */
  async menu(m: SeedMenu): Promise<string> {
    const id = `menu_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    this.counter++
    const { error } = await this.client.from('exercises').insert({
      id,
      name: m.name,
      category: m.category,
      type: m.type ?? (m.category === '有酸素運動' ? '有酸素運動' : 'フリーウェイト'),
      archived: m.archived ?? false,
      sort_order: m.sortOrder ?? this.counter,
    })
    if (error) throw error
    return id
  }

  /** セッションを作り、セット（[重量, 回数]の配列）を登録する。セッションidを返す */
  async session(
    menuId: string,
    date: string,
    sets: [number, number][],
    time = '00:00',
  ): Promise<string> {
    const { data, error } = await this.client
      .from('workout_sessions')
      .insert({ exercise_id: menuId, session_date: date, session_time: time })
      .select('id')
      .single()
    if (error) throw error
    if (sets.length) {
      const { error: setErr } = await this.client
        .from('sets')
        .insert(
          sets.map(([w, r], i) => ({ session_id: data.id, set_no: i + 1, weight_kg: w, reps: r })),
        )
      if (setErr) throw setErr
    }
    return data.id
  }

  /** 有酸素のセッションを作る */
  async cardio(
    menuId: string,
    date: string,
    c: { time: number; dist: number; cal: number; hr: number; maxSpd?: number; avgSpd?: number },
    time = '00:00',
  ): Promise<string> {
    const { data, error } = await this.client
      .from('workout_sessions')
      .insert({ exercise_id: menuId, session_date: date, session_time: time })
      .select('id')
      .single()
    if (error) throw error
    const { error: cErr } = await this.client.from('cardio_logs').insert({
      session_id: data.id,
      time_min: c.time,
      dist_km: c.dist,
      cal_kcal: c.cal,
      hr_bpm: c.hr,
      max_spd_kmh: c.maxSpd ?? null,
      avg_spd_kmh: c.avgSpd ?? null,
    })
    if (cErr) throw cErr
    return data.id
  }

  async bodyWeight(date: string, kg: number): Promise<void> {
    const { error } = await this.client
      .from('body_weight_logs')
      .insert({ log_date: date, weight_kg: kg })
    if (error) throw error
  }

  async meal(date: string, mealType: string, p: number, f: number, c: number): Promise<void> {
    const { error } = await this.client
      .from('meal_logs')
      .insert({ log_date: date, meal_type: mealType, protein_g: p, fat_g: f, carb_g: c })
    if (error) throw error
  }

  /** メニューセットを作り、idを返す */
  async menuSet(name: string, menuIds: string[]): Promise<string> {
    const { data, error } = await this.client.rpc('save_menu_set', {
      p_id: null as unknown as string,
      p_name: name,
      p_exercise_ids: menuIds,
    })
    if (error) throw error
    return data
  }

  /** テーブルの行数（検証用） */
  async count(
    table:
      | 'exercises'
      | 'workout_sessions'
      | 'sets'
      | 'cardio_logs'
      | 'body_weight_logs'
      | 'meal_logs'
      | 'menu_sets',
  ): Promise<number> {
    const { count, error } = await this.client
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) throw error
    return count ?? 0
  }
}
