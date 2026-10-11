// エラー処理を1か所にまとめる。
// 方針: ユーザーには生のエラー詳細を出さず（意味のある日本語のメッセージのみ）、詳細は console に出す。
import { toast } from './toast'

export const DEFAULT_ERROR_MESSAGE = '処理に失敗しました（通信を確認してください）'

/** 失敗を報告する: 詳細をconsoleへ、ユーザーにはメッセージのトーストだけを出す */
export function reportError(error: unknown, userMessage: string = DEFAULT_ERROR_MESSAGE): void {
  console.error(userMessage, error)
  toast(userMessage)
}

/** 一意制約違反（PostgreSQLのエラーコード 23505）か */
export const isUniqueViolation = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { code?: string }).code === '23505'

/** Supabaseの応答を取り出す。error があれば例外にする（TanStack Queryの失敗扱いにするため） */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw res.error
  if (res.data === null) throw new Error('empty response')
  return res.data
}
