import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useDeleteMenuSet, useMenuSets } from '@/api/menuSets'
import { EmptyState, Page, QueryBoundary, SectionHead } from '@/components/ui'
import { toast } from '@/lib/toast'
import type { MenuSet } from '@/types/domain'
import { MenuSetModal } from './MenuSetModal'

/** メニューセット一覧: セットの作成・編集・削除。セットを押すと、含まれるメニューの一覧(セット詳細)へ */
export function MenuSetListPage() {
  const navigate = useNavigate()
  const menuSets = useMenuSets()
  const exercises = useExercises()
  const remove = useDeleteMenuSet()
  // undefined: 閉じている / null: 新規作成 / MenuSet: 編集
  const [modal, setModal] = useState<MenuSet | null | undefined>(undefined)

  const menuIds = new Set((exercises.data ?? []).map((m) => m.id))

  async function del(set: MenuSet) {
    if (!confirm(`「${set.name}」を削除しますか？`)) return
    try {
      await remove.mutateAsync(set.id)
    } catch {
      return
    }
    toast('削除しました')
  }

  return (
    <Page id="menuset-list">
      <SectionHead
        title="メニューセット"
        sub="よく使うメニューの組み合わせをセットとして登録・一覧できます"
      />
      <button
        type="button"
        className="btn-primary"
        style={{ marginBottom: 14 }}
        onClick={() => setModal(null)}
      >
        ＋ 新規セットを作成
      </button>
      <div id="menuset-list-body">
        <QueryBoundary
          isPending={menuSets.isPending}
          isError={menuSets.isError && !menuSets.data}
          onRetry={() => void menuSets.refetch()}
        >
          {(menuSets.data ?? []).length === 0 ? (
            <EmptyState
              icon="🗂️"
              title="メニューセットがありません"
              desc="「新規セットを作成」からよく使うメニューの組み合わせを登録してください"
            />
          ) : (
            (menuSets.data ?? []).map((set) => (
              <div
                key={set.id}
                className="prog-card clickable"
                onClick={() => navigate(`/menu-sets/${set.id}`)}
              >
                <div className="prog-card-head">
                  <div>
                    <div className="prog-card-name">{set.name}</div>
                    <div className="prog-card-meta">
                      {set.exerciseIds.filter((id) => menuIds.has(id)).length}件のメニュー
                    </div>
                  </div>
                  <span className="row-chevron">›</span>
                </div>
                <div className="menu-actions" style={{ marginTop: 10, marginBottom: 0 }}>
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={(e) => {
                      e.stopPropagation()
                      setModal(set)
                    }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="btn-mini"
                    style={{ borderColor: 'var(--red)', color: 'var(--red-t)' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void del(set)
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </QueryBoundary>
      </div>
      {modal !== undefined && (
        <MenuSetModal
          // 編集対象が切り替わったらフォームの状態を作り直す
          key={modal?.id ?? 'new'}
          menuSet={modal ?? undefined}
          exercises={exercises.data ?? []}
          onClose={() => setModal(undefined)}
        />
      )}
    </Page>
  )
}
