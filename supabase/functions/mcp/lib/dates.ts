// 日付・時刻の検証。
// 「今日」「昨日」の解釈はClaude側が行う。Edge FunctionはUTCで動くため、サーバー側では
// 「今日」を決めない（日本時間とずれるため）。ここでは形式と実在する日付かだけを検証する。
import { z } from 'zod'

/** YYYY-MM-DD で、実在する日付(2026-02-30などは不可) */
export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください（日本時間の日付。例: 2026-10-11）')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, '実在しない日付です')

/** HH:MM（24時間表記、日本時間） */
export const timeSchema = z.string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM 形式で指定してください（日本時間。例: 07:30）')

export const DATE_DESC = '日本時間の日付 YYYY-MM-DD。「今日」「昨日」などは呼び出し側(Claude)が日本時間で解釈して具体的な日付にすること'
export const TIME_DESC = '日本時間の時刻 HH:MM（省略可）'
