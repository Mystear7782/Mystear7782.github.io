// テスト共通: ローカルSupabaseにテスト用ユーザーを作り、そのユーザーでログインしたクライアントを返す。
// 環境変数（`npx supabase status -o env` で確認できるローカル用の値）:
//   SUPABASE_URL                 例: http://host.docker.internal:54321（Dockerのdenoから見たホスト）
//   SUPABASE_PUBLISHABLE_KEY     ローカルの publishable key
//   SUPABASE_SECRET_KEY          ローカルの secret key（テストユーザーの作成にだけ使う。本番では使わない）
// テストごとに新しいユーザーを作るため、データは互いに独立しており、後始末は不要。
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types.ts'
import type { Client } from '../lib/exercises.ts'
import type { ToolResult } from '../lib/result.ts'

export const env = (k: string): string => {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`環境変数 ${k} が未設定です（tests/helpers.ts のコメント参照）`)
  return v
}

export const URL_ = () => env('SUPABASE_URL')
export const PUB_KEY = () => env('SUPABASE_PUBLISHABLE_KEY')

export type TestUser = { sb: Client; email: string; password: string; accessToken: string }

export async function newUser(): Promise<TestUser> {
  const admin = createClient<Database>(URL_(), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `t-${crypto.randomUUID().slice(0, 8)}@example.test`
  const password = crypto.randomUUID()
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error

  const sb = createClient<Database>(URL_(), PUB_KEY(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error: signErr } = await sb.auth.signInWithPassword({ email, password })
  if (signErr) throw signErr
  return { sb, email, password, accessToken: data.session!.access_token }
}

/** ツールの結果（テキスト）をJSONとして取り出す */
export function json<T = Record<string, unknown>>(r: ToolResult): T {
  if (r.isError) throw new Error(`ツールがエラーを返しました: ${r.content[0].text}`)
  return JSON.parse(r.content[0].text) as T
}

/** エラー結果のメッセージを取り出す（成功していたらテスト失敗） */
export function errText(r: ToolResult): string {
  if (!r.isError) throw new Error(`エラーのはずが成功しました: ${r.content[0].text}`)
  return r.content[0].text
}

export const D = '2026-10-01'
