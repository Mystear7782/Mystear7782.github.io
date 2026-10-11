import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import { DragHandleIcon } from '@/components/icons'
import { BODYWEIGHT, tagClass } from '@/lib/constants'
import { fmtDate } from '@/lib/format'
import { isCardioMenu, type MenuStats } from '@/lib/stats'
import type { Exercise } from '@/types/domain'

type Props = {
  menu: Exercise
  stats: MenuStats
  onOpen: () => void
  /** 並び替え用のつまみ。省略するとつまみを出さない */
  handle?: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onClick: (e: MouseEvent) => void
  }
  rowRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  dragging?: boolean
  /** 部位（data-cat）。メニュー一覧のみ */
  category?: string
}

/** メニュー一覧・メニューセット詳細で共通の1行 */
export function MenuRow({ menu, stats, onOpen, handle, rowRef, style, dragging, category }: Props) {
  return (
    <div
      ref={rowRef}
      className={`menu-row${menu.archived ? ' archived' : ''}${dragging ? ' dragging' : ''}`}
      data-id={menu.id}
      data-cat={category}
      style={style}
      onClick={onOpen}
    >
      {handle && (
        <div className="menu-row-handle" {...handle}>
          <DragHandleIcon />
        </div>
      )}
      <div className="menu-row-left">
        <div className="menu-row-name">{menu.name}</div>
        <div className="menu-row-tags">
          <span className={`tag ${tagClass(menu.type)}`}>{menu.type}</span>
          {menu.archived && <span className="tag tag-archived">アーカイブ済</span>}
          {stats.lastDate && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              最終: {fmtDate(stats.lastDate)}
            </span>
          )}
        </div>
      </div>
      <div className="menu-row-right">
        {isCardioMenu(menu) || stats.isCardio || menu.type === BODYWEIGHT ? null : stats.maxOrm >
          0 ? (
          <>
            <div className="row-1rm">
              {stats.maxOrm}
              <span className="row-1rm-unit"> kg</span>
            </div>
            <div className="row-1rm-label">最大1RM</div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>未記録</div>
        )}
      </div>
      <span className="row-chevron">›</span>
    </div>
  )
}
