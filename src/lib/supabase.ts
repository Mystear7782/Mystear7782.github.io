// Supabaseクライアント（アプリ全体で1つ）。
// publishable key はクライアント埋め込み前提の公開キーで、実際のアクセス制御はDB側のRLSが行う。
// secret key(service role)は絶対にここへ書かない。
//
// 認証セッションは supabase-js が localStorage に保存する（キー: sb-<project-ref>-auth-token）。
// 旧アプリ・OAuth同意画面(oauth-consent.html)も同じオリジン・同じプロジェクトを使うため、
// ログイン状態はそのまま共有される。
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://swncmbsamxoyjeojwbyc.supabase.co'
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_fk-EnvdNJKPgqRmVl-bz1g_jdukPtn2'

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
