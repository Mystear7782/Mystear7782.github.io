// 日付・時刻・文字数まわりの小さなユーティリティ。日付はすべて日本時間(端末のローカル時刻)で扱う。

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 今日の日付 YYYY-MM-DD */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** 現在時刻 HH:MM */
export function nowTime(now = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

/** YYYY-MM-DD → 2026年10月1日 */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}年${parseInt(m, 10)}月${parseInt(day, 10)}日`
}

/** グラフ用の短い日付ラベル（年を省く）: 2026年10月1日 → 10月1日 */
export function fmtDateShort(d: string): string {
  return fmtDate(d).replace(/\d{4}年/, '')
}

/** 年月日の文字列 YYYY-MM-DD を作る（month は 0 始まり） */
export function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

/** 先頭から max 文字（サロゲートペアを1文字と数える）に切り詰める */
export function clampLength(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max ? chars.slice(0, max).join('') : value
}
