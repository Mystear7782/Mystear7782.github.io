import { useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { EmptyState, Page, QueryBoundary, SectionHead } from '@/components/ui'
import { ANALYSIS_CATEGORIES, dotColor } from '@/lib/constants'
import { fmtDate, today, ymd } from '@/lib/format'
import { groupByExercise, isCardioMenu, menuStats, sessionStats } from '@/lib/stats'
import type { Exercise, SessionData } from '@/types/domain'

const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]
const DOW = ['日', '月', '火', '水', '木', '金', '土']

/**
 * メニュー分析: カレンダー / メニュー別の2タブ。
 * 表示中のタブ・年月・選択日はURLのクエリ(?tab=&y=&m=&d=)に持つので、セット記録画面から戻っても同じ状態に戻れる。
 */
export function AnalysisPage() {
  const [params, setParams] = useSearchParams()
  const exercises = useExercises()
  const sessions = useSessions()

  const tab = params.get('tab') === 'menu' ? 'menu' : 'cal'
  const now = new Date()
  const year = Number(params.get('y')) || now.getFullYear()
  const month = params.has('m') ? Number(params.get('m')) : now.getMonth() // 0始まり
  const selected = params.get('d')

  const setState = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  return (
    <Page id="analysis">
      <SectionHead title="メニュー分析" sub="トレーニングの記録を可視化します" />
      <div className="ana-tabs">
        <button
          type="button"
          className={`ana-tab${tab === 'cal' ? ' active' : ''}`}
          id="ana-tab-cal"
          onClick={() => setState({ tab: null })}
        >
          カレンダー
        </button>
        <button
          type="button"
          className={`ana-tab${tab === 'menu' ? ' active' : ''}`}
          id="ana-tab-menu"
          onClick={() => setState({ tab: 'menu' })}
        >
          メニュー
        </button>
      </div>
      <QueryBoundary
        isPending={exercises.isPending || sessions.isPending}
        isError={(exercises.isError && !exercises.data) || (sessions.isError && !sessions.data)}
        onRetry={() => {
          void exercises.refetch()
          void sessions.refetch()
        }}
      >
        {tab === 'cal' ? (
          <CalendarView
            year={year}
            month={month}
            selected={selected}
            exercises={exercises.data ?? []}
            sessions={sessions.data ?? []}
            onMove={(dir) => {
              let y = year
              let m = month + dir
              if (m < 0) {
                m = 11
                y--
              }
              if (m > 11) {
                m = 0
                y++
              }
              setState({ y: String(y), m: String(m), d: null })
            }}
            onSelect={(d) => setState({ d: selected === d ? null : d })}
          />
        ) : (
          <MenuAnalysisList exercises={exercises.data ?? []} sessions={sessions.data ?? []} />
        )}
      </QueryBoundary>
    </Page>
  )
}

function CalendarView({
  year,
  month,
  selected,
  exercises,
  sessions,
  onMove,
  onSelect,
}: {
  year: number
  month: number
  selected: string | null
  exercises: Exercise[]
  sessions: SessionData[]
  onMove: (dir: -1 | 1) => void
  onSelect: (date: string) => void
}) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const recordDates = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) if (s.date.startsWith(prefix)) set.add(s.date)
    return set
  }, [sessions, prefix])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = ymd(year, month, d)
    const hasRec = recordDates.has(dateStr)
    const cls = ['cal-cell']
    if (hasRec || dateStr === selected) cls.push('has-record')
    if (dateStr === todayStr) cls.push('today')
    cells.push(
      <div
        key={dateStr}
        className={cls.join(' ')}
        data-date={dateStr}
        onClick={hasRec ? () => onSelect(dateStr) : undefined}
      >
        <div className="cal-day-num">{d}</div>
        {hasRec && <div className="cal-dot" />}
      </div>,
    )
  }

  return (
    <div id="ana-cal-view">
      <div className="cal-nav">
        <button
          type="button"
          className="cal-nav-btn"
          aria-label="前の月"
          onClick={() => onMove(-1)}
        >
          <ChevronLeftIcon />
        </button>
        <div className="cal-title">
          {year}年 {MONTH_NAMES[month]}
        </div>
        <button type="button" className="cal-nav-btn" aria-label="次の月" onClick={() => onMove(1)}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="cal-grid">
        <div className="cal-dow">
          {DOW.map((d) => (
            <div key={d} className="cal-dow-cell">
              {d}
            </div>
          ))}
        </div>
        <div className="cal-days">{cells}</div>
      </div>
      <div id="cal-detail-area">
        {selected && <CalendarDetail date={selected} exercises={exercises} sessions={sessions} />}
      </div>
    </div>
  )
}

function CalendarDetail({
  date,
  exercises,
  sessions,
}: {
  date: string
  exercises: Exercise[]
  sessions: SessionData[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const menus = new Map(exercises.map((m) => [m.id, m]))
  const rows = sessions
    .filter((s) => s.date === date && menus.has(s.exerciseId))
    .map((s) => ({ s, menu: menus.get(s.exerciseId)! }))
  if (!rows.length) return null

  return (
    <div className="cal-detail">
      <div className="cal-detail-title">
        <CalendarIcon />
        {fmtDate(date)}の記録
      </div>
      {rows.map(({ s, menu }) => {
        const st = sessionStats(s)
        const c = s.cardio
        const cardioSummary =
          `${c?.time != null ? c.time + '分 ' : ''} ${c?.dist != null ? c.dist + 'km ' : ''} ${c?.cal != null ? c.cal + 'kcal' : ''}`.trim()
        return (
          <div
            key={s.id}
            className="cal-sess-row"
            onClick={() =>
              // セット記録画面の戻るボタンで、同じカレンダー表示に戻れるよう現在のURLを渡す
              navigate(`/menus/${menu.id}/sessions/${s.id}`, {
                state: { from: location.pathname + location.search },
              })
            }
          >
            <div className="cal-sess-name">{menu.name}</div>
            <div className="cal-sess-stats">
              {isCardioMenu(menu) ? (
                <div className="cal-sess-stat">
                  有酸素<span>{cardioSummary || '—'}</span>
                </div>
              ) : (
                <>
                  <div className="cal-sess-stat">
                    セット数<span>{st.setCount}</span>
                  </div>
                  <div className="cal-sess-stat">
                    最大1RM<span>{st.maxOrm.toFixed(1)} kg</span>
                  </div>
                  <div className="cal-sess-stat">
                    ボリューム<span>{st.volume.toFixed(0)} kg</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MenuAnalysisList({
  exercises,
  sessions,
}: {
  exercises: Exercise[]
  sessions: SessionData[]
}) {
  const navigate = useNavigate()
  const byExercise = useMemo(() => groupByExercise(sessions), [sessions])
  const menus = exercises.filter((m) => !isCardioMenu(m))

  if (!menus.length) {
    return (
      <div id="ana-menu-view">
        <EmptyState
          icon="📊"
          title="分析できるメニューがありません"
          desc="メニューを追加して記録を付けると分析できます"
        />
      </div>
    )
  }
  return (
    <div id="ana-menu-view">
      {ANALYSIS_CATEGORIES.map((cat) => {
        const items = menus.filter((m) => m.category === cat)
        if (!items.length) return null
        return (
          <div className="group-block" key={cat}>
            <div className="group-head">
              <div className="group-dot" style={{ background: dotColor(cat) }} />
              <div className="group-name">{cat}</div>
              <div className="group-cnt">{items.length}件</div>
            </div>
            {items.map((m) => {
              const list = byExercise.get(m.id) ?? []
              const st = menuStats(m, list)
              return (
                <div
                  className="ana-menu-row"
                  key={m.id}
                  onClick={() => navigate(`/analysis/${m.id}`)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="ana-menu-name">{m.name}</div>
                    <div className="ana-menu-meta">
                      {list.length}セッション
                      {!st.isCardio && st.maxOrm > 0 ? ` · 最大1RM ${st.maxOrm} kg` : ''}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text3)', fontSize: 16 }}>›</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
