import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { BackButton, EmptyState, Page, QueryBoundary } from '@/components/ui'
import { nowTime, today } from '@/lib/format'
import { isCardioMenu } from '@/lib/stats'
import { CardioForm } from './CardioForm'
import type { SessionDraft } from './SessionHeader'
import { StrengthForm } from './StrengthForm'

/**
 * セット記録画面（筋トレ・有酸素）。
 * /menus/:menuId/sessions/new は「新規セッション」: サーバーには何も作らず、最初のセット/有酸素記録を
 * 保存する瞬間に初めてセッションを作成する（何も入力せずに戻っても、空のセッションが残らない）。
 */
export function SessionEditPage() {
  const { menuId, sessionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const exercises = useExercises()
  const sessions = useSessions()

  const isNew = sessionId === 'new'
  const menu = exercises.data?.find((m) => m.id === menuId)
  const session = isNew ? undefined : sessions.data?.find((s) => s.id === sessionId)

  // 戻り先: カレンダー・ダッシュボードから開いたときはその画面、通常はメニュー詳細
  const detailPath = `/menus/${menuId}`
  const from = (location.state as { from?: string } | null)?.from ?? detailPath
  // カレンダー/ダッシュボード経由では、保存後も画面にとどまる（メニュー詳細へは自動で戻らない）
  const stayAfterSave = from !== detailPath

  // 新規(未保存)セッションの日時の下書き（開いた時点の現在日時）。
  // 保存済みのセッションでは、日時はサーバーのデータ(session)がそのまま正になる。
  const [draft, setDraft] = useState<SessionDraft>(() => ({ date: today(), time: nowTime() }))

  const back = <BackButton to={from} id="set-back" label="詳細に戻る" />

  if (!menu || (!isNew && !session)) {
    return (
      <Page id="set-edit">
        {back}
        <QueryBoundary
          isPending={exercises.isPending || sessions.isPending}
          isError={(exercises.isError && !exercises.data) || (sessions.isError && !sessions.data)}
          onRetry={() => {
            void exercises.refetch()
            void sessions.refetch()
          }}
        >
          <EmptyState icon="🔍" title="記録が見つかりません" />
        </QueryBoundary>
      </Page>
    )
  }

  const common = {
    menu,
    session,
    draft,
    onDraftChange: setDraft,
    onSaved: (savedSessionId: string) => {
      // 新規セッションが作られたら、そのセッションの画面に切り替える（戻る操作で新規画面に戻らないよう置換）
      if (isNew)
        navigate(`/menus/${menu.id}/sessions/${savedSessionId}`, { replace: true, state: { from } })
    },
    onFinished: () => {
      if (!stayAfterSave) navigate(detailPath)
    },
  }

  return (
    <Page id="set-edit">
      {back}
      <div id="set-edit-body">
        {isCardioMenu(menu) ? <CardioForm {...common} /> : <StrengthForm {...common} />}
      </div>
    </Page>
  )
}
