import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExercises, useReorderExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { ArchiveIcon } from '@/components/icons'
import { EmptyState, Page, QueryBoundary, SectionHead } from '@/components/ui'
import { CATEGORIES, dotColor } from '@/lib/constants'
import { groupByExercise, menuStats } from '@/lib/stats'
import { useSortable } from '@/lib/useSortable'
import type { Exercise, SessionData } from '@/types/domain'
import { MenuRow } from './MenuRow'

/** メニュー一覧: 部位ごとのグループ。行左端のつまみを動かして、部位内の並びを変えられる */
export function MenuListPage() {
  const exercises = useExercises()
  const sessions = useSessions()
  const [showArchived, setShowArchived] = useState(false)

  const byExercise = useMemo(() => groupByExercise(sessions.data ?? []), [sessions.data])
  const all = exercises.data ?? []
  const visible = all.filter((m) => showArchived || !m.archived)

  return (
    <Page id="menu-list">
      <SectionHead title="メニュー一覧" sub="部位ごとに登録したメニューが表示されます" />
      <div className="list-toolbar">
        <button
          type="button"
          className={`toggle-archive-btn${showArchived ? ' on' : ''}`}
          id="toggle-archive-btn"
          onClick={() => setShowArchived((v) => !v)}
        >
          <ArchiveIcon />
          {showArchived ? ' アーカイブを非表示' : ' アーカイブを表示'}
        </button>
      </div>
      <div id="list-body">
        <QueryBoundary
          isPending={exercises.isPending}
          isError={exercises.isError && !exercises.data}
          onRetry={() => void exercises.refetch()}
        >
          {visible.length === 0 ? (
            <EmptyState
              icon="🏋️"
              title="まだメニューがありません"
              desc="「メニューの追加」からトレーニングメニューを登録してください"
            />
          ) : (
            CATEGORIES.map((cat) => {
              const items = visible.filter((m) => m.category === cat)
              if (!items.length) return null
              return (
                <CategoryGroup
                  key={cat}
                  category={cat}
                  items={items}
                  all={all}
                  byExercise={byExercise}
                  showArchived={showArchived}
                />
              )
            })
          )}
        </QueryBoundary>
      </div>
    </Page>
  )
}

function CategoryGroup({
  category,
  items,
  all,
  byExercise,
  showArchived,
}: {
  category: string
  items: Exercise[]
  all: Exercise[]
  byExercise: Map<string, SessionData[]>
  showArchived: boolean
}) {
  const navigate = useNavigate()
  const reorder = useReorderExercises()

  const sortable = useSortable(items, (visibleIds) => {
    // アーカイブ非表示のときは、非表示のアーカイブ済みメニューがidsに含まれない。
    // それらのsort_orderを据え置くと新しく振り直す番号と衝突するため、表示中の並びの後ろに
    // （元の順序のまま）追加して、部位内の全メニューの番号を振り直す。
    const hidden = showArchived
      ? []
      : all.filter((m) => m.category === category && m.archived && !visibleIds.includes(m.id))
    return reorder.mutateAsync([...visibleIds, ...hidden.map((m) => m.id)])
  })

  return (
    <div className="group-block">
      <div className="group-head">
        <div className="group-dot" style={{ background: dotColor(category) }} />
        <div className="group-name">{category}</div>
        <div className="group-cnt">{items.length}件</div>
      </div>
      <div className="menu-list">
        {items.map((m) => (
          <MenuRow
            key={m.id}
            menu={m}
            category={category}
            stats={menuStats(m, byExercise.get(m.id) ?? [])}
            onOpen={() => navigate(`/menus/${m.id}`)}
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
    </div>
  )
}
