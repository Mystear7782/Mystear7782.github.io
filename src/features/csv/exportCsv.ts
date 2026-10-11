// CSVエクスポート（メニュー単位 / 筋トレ全体 / 有酸素全体）。
import { buildCardioCsv, buildStrengthCsv } from '@/lib/csv'
import { downloadCsv, safeFileName } from '@/lib/download'
import { today } from '@/lib/format'
import { groupByExercise, isCardioMenu } from '@/lib/stats'
import { toast } from '@/lib/toast'
import type { Exercise, SessionData } from '@/types/domain'

/** 個別メニューのエクスポート */
export function exportMenuCsv(menu: Exercise, sessions: SessionData[]): void {
  const sessionsOf = () => sessions
  const content = isCardioMenu(menu)
    ? buildCardioCsv([menu], sessionsOf)
    : buildStrengthCsv([menu], sessionsOf)
  downloadCsv(`gymlog_${safeFileName(menu.name)}_${today()}.csv`, content)
  toast(`「${menu.name}」のCSVをエクスポートしました`)
}

/** 筋トレ全体 / 有酸素全体のエクスポート。対象メニューが無ければトーストで知らせる */
export function exportAllCsv(
  kind: 'strength' | 'cardio',
  menus: Exercise[],
  sessions: SessionData[],
): void {
  const grouped = groupByExercise(sessions)
  const sessionsOf = (id: string) => grouped.get(id) ?? []
  const date = today()
  if (kind === 'strength') {
    const targets = menus.filter((m) => !isCardioMenu(m))
    if (!targets.length) {
      toast('筋トレメニューがありません')
      return
    }
    downloadCsv(`gymlog_strength_${date}.csv`, buildStrengthCsv(targets, sessionsOf))
    toast('筋トレCSVをエクスポートしました')
  } else {
    const targets = menus.filter(isCardioMenu)
    if (!targets.length) {
      toast('有酸素運動メニューがありません')
      return
    }
    downloadCsv(`gymlog_cardio_${date}.csv`, buildCardioCsv(targets, sessionsOf))
    toast('有酸素運動CSVをエクスポートしました')
  }
}
