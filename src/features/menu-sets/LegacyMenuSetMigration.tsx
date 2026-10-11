import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useExercises } from '@/api/exercises'
import { queryKeys } from '@/api/keys'
import { useMenuSets } from '@/api/menuSets'
import { toast } from '@/lib/toast'
import { migrateLegacyMenuSets } from './migrateLegacy'

/**
 * 旧アプリのメニューセット(localStorage)をDBへ移行する。画面は持たない。
 * メニューとセットの一覧を取得し終え、DB側のセットが空のときにだけ一度だけ実行する。
 */
export function LegacyMenuSetMigration() {
  const qc = useQueryClient()
  const exercises = useExercises()
  const menuSets = useMenuSets()

  const ready = !!exercises.data && !!menuSets.data && !menuSets.isFetching
  const dbEmpty = ready && menuSets.data!.length === 0

  useEffect(() => {
    if (!dbEmpty || !exercises.data) return
    void migrateLegacyMenuSets(new Set(exercises.data.map((m) => m.id))).then((r) => {
      if (!r) return
      void qc.invalidateQueries({ queryKey: queryKeys.menuSets })
      const notes = [`メニューセットを${r.migrated}件移行しました`]
      if (r.skippedItems) notes.push(`存在しないメニュー${r.skippedItems}件を除外`)
      if (r.skippedSets) notes.push(`空になった${r.skippedSets}セットは移行せず`)
      if (r.failedSets) notes.push(`${r.failedSets}件は保存に失敗しました`)
      toast(notes.join('・'))
    })
  }, [dbEmpty, exercises.data, qc])

  return null
}
