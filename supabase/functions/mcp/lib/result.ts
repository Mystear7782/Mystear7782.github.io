// ツールの戻り値と、エラーの共通処理。
// 各ツールの本体は「ToolResult を返す普通の関数」にしておき、MCPの登録(tools/register.ts)とは
// 切り離している。これにより、MCPサーバーを介さずにDBへ直接テストできる。

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** 成功: データをJSON文字列にして返す */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

/** 失敗: MCPのツールエラー(isError)として返す。Claudeがメッセージを読んで対処できる */
export function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** 入力の誤りなど、ツール内で想定済みのエラー */
export class ToolError extends Error {}

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

/**
 * Supabase(PostgREST)のエラーを、内容を落とさずにそのまま文字列化する。
 * 例: `[23505] duplicate key value violates unique constraint "..." (details: ...)`
 */
export function formatSupabaseError(error: SupabaseErrorLike): string {
  const head = error.code ? `[${error.code}] ` : ''
  const tail = [
    error.details ? `details: ${error.details}` : '',
    error.hint ? `hint: ${error.hint}` : '',
  ].filter(Boolean).join(' / ')
  return `${head}${error.message ?? 'unknown error'}${tail ? ` (${tail})` : ''}`
}

/** Supabaseの応答にエラーがあれば ToolError として投げる */
export function throwIfError(error: SupabaseErrorLike | null): void {
  if (error) throw new ToolError(formatSupabaseError(error))
}

/** ツール本体を実行し、例外を isError の結果に変換する */
export async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message)
    // 想定外のエラーもメッセージはそのまま返す（Supabaseのエラー内容をそのまま返す方針）
    const msg = e instanceof Error ? e.message : String(e)
    console.error('tool error', e)
    return fail(msg)
  }
}
