import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useMenuSets, useReorderMenuSet } from '@/api/menuSets'
import { useSessions } from '@/api/sessions'
import { BackButton, EmptyState, Page, QueryBoundary } from '@/components/ui'
import { groupByExercise, menuStats } from '@/lib/stats'
import { useSortable } from '@/lib/useSortable'
import type { Exercise } from '@/types/domain'
import { MenuRow } from '../menus/MenuRow'

/** セット詳細: セットに含まれるメニューの一覧（メニュー一覧と同じ見た目）。メニューを押すとメニュー詳細へ */
export function MenuSetDetailPage() {
  const { setId } = useParams()
  const menuSets = useMenuSets()
  const exercises = useExercises()
  const sessions = useSessions()

  const set = menuSets.data?.find((s) => s.id === setId)
  const byExercise = useMemo(() => groupByExercise(sessions.data ?? []), [sessions.data])
  const byId = new Map((exercises.data ?? []).map((m) => [m.id, m]))
  // 削除されたメニューは一覧に出さない（所属はDBのCASCADEで自動的に消える）
  const members = (set?.exerciseIds ?? [])
    .map((id) => byId.get(id))
    .filter((m): m is Exercise => !!m)

  return (
    <Page id="menuset-detail">
      <BackButton to="/menu-sets" label="セット一覧に戻る" />
      <div id="menuset-detail-body">
        <QueryBoundary
          isPending={menuSets.isPending || exercises.isPending}
          isError={(menuSets.isError && !menuSets.data) || (exercises.isError && !exercises.data)}
          onRetry={() => {
            void menuSets.refetch()
            void exercises.refetch()
          }}
        >
          {!set ? (
            <EmptyState icon="🔍" title="セットが見つかりません" />
          ) : (
            <>
              <div className="sec-head">
                <div className="sec-title">{set.name}</div>
                <div className="sec-sub">{members.length}件のメニュー</div>
              </div>
              {members.length === 0 ? (
                <EmptyState
                  icon="🗂️"
                  title="メニューがありません"
                  desc="セットに含まれるメニューが削除されたか、選択されていません"
                />
              ) : (
                <MemberList
                  setId={set.id}
                  members={members}
                  statsOf={(m) => menuStats(m, byExercise.get(m.id) ?? [])}
                />
              )}
            </>
          )}
        </QueryBoundary>
      </div>
    </Page>
  )
}

function MemberList({
  setId,
  members,
  statsOf,
}: {
  setId: string
  members: Exercise[]
  statsOf: (m: Exercise) => ReturnType<typeof menuStats>
}) {
  const navigate = useNavigate()
  const reorder = useReorderMenuSet()
  const sortable = useSortable(members, (ids) => reorder.mutateAsync({ setId, exerciseIds: ids }))

  return (
    <div className="menu-list">
      {members.map((m) => (
        <MenuRow
          key={m.id}
          menu={m}
          stats={statsOf(m)}
          onOpen={() => navigate(`/menus/${m.id}`, { state: { from: `/menu-sets/${setId}` } })}
          handle={sortable.handleProps(m.id)}
          rowRef={sortable.rowRef(m.id)}
          style={sortable.rowStyle(m.id)}
          dragging={sortable.isDragging(m.id)}
        />
      ))}
      {sortable.placeholderStyle && (
        <div className="drag-row-placeholder" style={sortable.placeholderStyle} />
      )}
    </div>
  )
}
