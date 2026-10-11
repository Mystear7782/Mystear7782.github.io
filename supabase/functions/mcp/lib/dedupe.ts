// 二重登録の防止。
// Claudeが通信エラー等でツールを再試行したとき、同じ記録が2行できないようにする。
// 「直近2分以内に同じ内容の行があれば、新しく作らずにその既存行を返す」。
// 食事・体重・セットの3種類が対象（スキーマ変更なしで判定できるよう、既存のcreated_atを使う）。
// ※セットのcreated_atは 20261010155612_add_sets_created_at で追加した列。
export const DEDUPE_WINDOW_MS = 2 * 60 * 1000

/** 重複判定の下限時刻（ISO文字列）。この時刻以降に作られた行が「直近」 */
export function dedupeSince(now = Date.now()): string {
  return new Date(now - DEDUPE_WINDOW_MS).toISOString()
}
