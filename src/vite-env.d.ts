/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SupabaseプロジェクトのURL（未指定なら本番）。E2E/ローカル開発ではローカルのSupabaseを指す */
  readonly VITE_SUPABASE_URL?: string
  /** publishable key（未指定なら本番）。クライアントに埋め込んでよい公開キー（アクセス制御はRLS） */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}
