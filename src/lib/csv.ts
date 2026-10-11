// CSVの出力・解析。RFC4180準拠（フィールドはダブルクォートで囲み、内部の " は "" にエスケープ）。
import { orm } from './one-rm'
import { sortSessionsAsc } from './stats'
import type { Exercise, SessionData } from '@/types/domain'

export const csvField = (v: unknown): string => `"${String(v).replace(/"/g, '""')}"`

export const STRENGTH_HEADER =
  'menu_name,category,type,date,session_id,session_time,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg'
export const CARDIO_HEADER =
  'menu_name,category,date,session_id,session_time,time_min,dist_km,cal_kcal,hr_bpm,max_spd_kmh,avg_spd_kmh'

/** 筋トレCSV（推定1RM・ボリューム列つき）。session_time を出力するのでエクスポート→インポートで時刻が保たれる */
export function buildStrengthCsv(
  menus: Exercise[],
  sessionsOf: (exerciseId: string) => SessionData[],
): string {
  const rows = [STRENGTH_HEADER]
  for (const m of menus) {
    for (const sess of sortSessionsAsc(sessionsOf(m.id))) {
      sess.sets.forEach((s, i) => {
        rows.push(
          [
            csvField(m.name),
            m.category,
            m.type,
            sess.date,
            sess.id,
            sess.time || '00:00',
            i + 1,
            s.weight,
            s.reps,
            orm(s.weight, s.reps),
            +(s.weight * s.reps).toFixed(1),
          ].join(','),
        )
      })
    }
  }
  return rows.join('\r\n')
}

export function buildCardioCsv(
  menus: Exercise[],
  sessionsOf: (exerciseId: string) => SessionData[],
): string {
  const rows = [CARDIO_HEADER]
  for (const m of menus) {
    for (const sess of sortSessionsAsc(sessionsOf(m.id))) {
      const c = sess.cardio
      rows.push(
        [
          csvField(m.name),
          m.category,
          sess.date,
          sess.id,
          sess.time || '00:00',
          c?.time ?? '',
          c?.dist ?? '',
          c?.cal ?? '',
          c?.hr ?? '',
          c?.maxSpd ?? '',
          c?.avgSpd ?? '',
        ].join(','),
      )
    }
  }
  return rows.join('\r\n')
}

/** CSVを行×列の文字列配列にする（引用符・"" エスケープ対応。空行は無視） */
export function parseCsv(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
  return lines.map((line) => {
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQuote) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else {
            inQuote = false
          }
        } else {
          cur += c
        }
      } else if (c === '"' && cur === '') {
        inQuote = true
      } else if (c === ',') {
        cols.push(cur.trim())
        cur = ''
      } else {
        cur += c
      }
    }
    cols.push(cur.trim())
    return cols
  })
}
