import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDeleteExercise, useExercises, useUpdateExercise } from '@/api/exercises'
import { useDeleteSession, useSessions } from '@/api/sessions'
import {
  ArchiveIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  UnarchiveIcon,
} from '@/components/icons'
import { BackButton, EmptyState, Page, QueryBoundary } from '@/components/ui'
import { exportMenuCsv } from '@/features/csv/exportCsv'
import { tagClass } from '@/lib/constants'
import { fmtDate } from '@/lib/format'
import { isCardioMenu, menuStats, sessionStats, sortSessionsDesc } from '@/lib/stats'
import { toast } from '@/lib/toast'
import type { Exercise, SessionData } from '@/types/domain'
import { EditMenuModal } from './EditMenuModal'

/** メニュー詳細: 統計・操作ボタン・セッション履歴 */
export function MenuDetailPage() {
  const { menuId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const exercises = useExercises()
  const sessions = useSessions()
  const update = useUpdateExercise()
  const deleteMenu = useDeleteExercise()
  const deleteSession = useDeleteSession()
  const [editing, setEditing] = useState(false)

  const menu = exercises.data?.find((m) => m.id === menuId)
  const menuSessions = useMemo(
    () => sortSessionsDesc((sessions.data ?? []).filter((s) => s.exerciseId === menuId)),
    [sessions.data, menuId],
  )

  // メニューセットから開いた場合は「セットに戻る」、それ以外は一覧へ
  const from = (location.state as { from?: string } | null)?.from
  const fromSet = !!from && from.startsWith('/menu-sets')
  const back = fromSet ? from : '/menus'

  const backButton = (
    <BackButton
      to={back}
      id="menu-detail-back"
      labelId="menu-detail-back-label"
      label={fromSet ? 'セットに戻る' : '一覧に戻る'}
    />
  )

  if (!menu) {
    return (
      <Page id="menu-detail">
        {backButton}
        <QueryBoundary
          isPending={exercises.isPending}
          isError={exercises.isError && !exercises.data}
          onRetry={() => void exercises.refetch()}
        >
          <EmptyState icon="🔍" title="メニューが見つかりません" />
        </QueryBoundary>
      </Page>
    )
  }

  async function archive(m: Exercise) {
    if (
      !confirm(
        `「${m.name}」をアーカイブしますか？\n一覧には表示されなくなりますが記録は保持されます。`,
      )
    )
      return
    try {
      await update.mutateAsync({ id: m.id, patch: { archived: true } })
      toast('アーカイブしました')
    } catch {
      /* 通知はonErrorで出している */
    }
  }
  async function unarchive(m: Exercise) {
    try {
      await update.mutateAsync({ id: m.id, patch: { archived: false } })
      toast('アーカイブを解除しました')
    } catch {
      /* 同上 */
    }
  }
  async function remove(m: Exercise) {
    if (
      !confirm(
        `「${m.name}」を完全に削除しますか？\n⚠️ この操作は取り消せません。全記録も削除されます。`,
      )
    )
      return
    try {
      await deleteMenu.mutateAsync(m.id)
    } catch {
      return
    }
    toast('削除しました')
    navigate('/menus', { replace: true })
  }
  async function removeSession(id: string) {
    if (!confirm('このセッションを削除しますか？\n⚠️ この操作は取り消せません。')) return
    try {
      await deleteSession.mutateAsync(id)
      toast('セッションを削除しました')
    } catch {
      /* 同上 */
    }
  }

  const st = menuStats(menu, menuSessions)
  const isBodyweight = menu.type === '自重運動'
  const cardio = isCardioMenu(menu)

  return (
    <Page id="menu-detail">
      {backButton}
      <div id="detail-body">
        <div className={`detail-hero${menu.archived ? ' archived-hero' : ''}`}>
          <div className="detail-name">{menu.name}</div>
          <div className="detail-tags">
            <span className={`tag ${tagClass(menu.type)}`}>{menu.type}</span>
            {menu.type !== menu.category && (
              <span className="tag" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                {menu.category}
              </span>
            )}
            {menu.archived && <span className="tag tag-archived">アーカイブ済</span>}
          </div>
          <div className="stats-grid">
            {st.isCardio ? (
              <>
                <StatBox value={st.maxDist} unit="km" label="最大距離" />
                <StatBox value={st.maxCal} unit="kcal" label="最大消費カロリー" />
                <StatBox value={menuSessions.length} unit="回" label="セッション数" always />
              </>
            ) : isBodyweight ? (
              <StatBox value={menuSessions.length} unit="回" label="セッション数" always />
            ) : (
              <>
                <StatBox value={st.maxOrm} unit="kg" label="最大1RM" />
                <StatBox value={st.maxVol} unit="kg" label="最大ボリューム" />
                <StatBox value={menuSessions.length} unit="回" label="セッション数" always />
              </>
            )}
          </div>
        </div>

        <div className="menu-actions">
          {!menu.archived && (
            <button
              type="button"
              className="btn-action new-sess"
              onClick={() =>
                navigate(`/menus/${menu.id}/sessions/new`, { state: { from: `/menus/${menu.id}` } })
              }
            >
              <PlusIcon />
              新規セッション
            </button>
          )}
          <button type="button" className="btn-action edit-menu" onClick={() => setEditing(true)}>
            <EditIcon />
            編集
          </button>
          {menu.archived ? (
            <button type="button" className="btn-action unarchive" onClick={() => unarchive(menu)}>
              <UnarchiveIcon />
              解除
            </button>
          ) : (
            <button type="button" className="btn-action archive" onClick={() => archive(menu)}>
              <ArchiveIcon />
              アーカイブ
            </button>
          )}
          <button
            type="button"
            className="btn-action"
            style={{
              borderColor: 'var(--green)',
              color: 'var(--green-t)',
              background: 'var(--green-bg)',
            }}
            onClick={() => exportMenuCsv(menu, menuSessions)}
          >
            <DownloadIcon />
            CSV出力
          </button>
          <button type="button" className="btn-action delete" onClick={() => remove(menu)}>
            <TrashIcon />
            完全削除
          </button>
        </div>

        {menuSessions.length ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="hist-table">
                <thead>
                  <tr>
                    {cardio ? (
                      <>
                        <th>日付</th>
                        <th>時間</th>
                        <th>距離</th>
                        <th>消費Cal</th>
                        <th>平均心拍</th>
                      </>
                    ) : isBodyweight ? (
                      <>
                        <th>日付</th>
                        <th>セット数</th>
                        <th>総回数</th>
                      </>
                    ) : (
                      <>
                        <th>日付</th>
                        <th>セット数</th>
                        <th>最大重量</th>
                        <th>ボリューム</th>
                        <th>1RM</th>
                      </>
                    )}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {menuSessions.map((s) => (
                    <HistoryRow
                      key={s.id}
                      session={s}
                      kind={cardio ? 'cardio' : isBodyweight ? 'bodyweight' : 'strength'}
                      onOpen={() =>
                        navigate(`/menus/${menu.id}/sessions/${s.id}`, {
                          state: { from: `/menus/${menu.id}` },
                        })
                      }
                      onDelete={() => removeSession(s.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon="📋"
            title="記録がありません"
            desc="「新規セッション」からトレーニングを記録しましょう"
          />
        )}
      </div>
      {editing && (
        <EditMenuModal menu={menu} all={exercises.data ?? []} onClose={() => setEditing(false)} />
      )}
    </Page>
  )
}

function StatBox({
  value,
  unit,
  label,
  always,
}: {
  value: number
  unit: string
  label: string
  /** 0でも「0」を出す（セッション数）。それ以外は0なら「—」 */
  always?: boolean
}) {
  const has = always || !!value
  return (
    <div className="stat-box">
      <div className="stat-val">{has ? value : '—'}</div>
      <div className="stat-unit">{has ? unit : ''}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function HistoryRow({
  session,
  kind,
  onOpen,
  onDelete,
}: {
  session: SessionData
  kind: 'cardio' | 'bodyweight' | 'strength'
  onOpen: () => void
  onDelete: () => void
}) {
  const timeLabel =
    session.time && session.time !== '00:00' ? (
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{session.time}</div>
    ) : null
  const del = (
    <td>
      <button
        type="button"
        className="btn-del"
        style={{ fontSize: 11, padding: '4px 7px' }}
        aria-label="セッションを削除"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        ✕
      </button>
    </td>
  )
  const dateCell = (
    <td className="td-date">
      {fmtDate(session.date)}
      {timeLabel}
    </td>
  )

  if (kind === 'cardio') {
    const c = session.cardio
    return (
      <tr className="clickable" onClick={onOpen}>
        {dateCell}
        <td>{c?.time != null ? `${c.time} 分` : '—'}</td>
        <td>{c?.dist != null ? `${c.dist} km` : '—'}</td>
        <td className="td-vol">{c?.cal != null ? `${c.cal} kcal` : '—'}</td>
        <td className="td-1rm">{c?.hr != null ? `${c.hr} bpm` : '—'}</td>
        {del}
      </tr>
    )
  }
  const st = sessionStats(session)
  if (kind === 'bodyweight') {
    return (
      <tr className="clickable" onClick={onOpen}>
        {dateCell}
        <td style={{ color: 'var(--text3)' }}>{st.setCount}セット</td>
        <td className="td-vol">{st.totalReps > 0 ? `${st.totalReps} 回` : '—'}</td>
        {del}
      </tr>
    )
  }
  return (
    <tr className="clickable" onClick={onOpen}>
      {dateCell}
      <td style={{ color: 'var(--text3)' }}>{st.setCount}セット</td>
      <td>{st.maxWeight > 0 ? `${st.maxWeight} kg` : '—'}</td>
      <td className="td-vol">{st.volume > 0 ? `${st.volume.toFixed(0)} kg` : '—'}</td>
      <td className="td-1rm">{st.maxOrm > 0 ? `${st.maxOrm.toFixed(1)} kg` : '—'}</td>
      {del}
    </tr>
  )
}
