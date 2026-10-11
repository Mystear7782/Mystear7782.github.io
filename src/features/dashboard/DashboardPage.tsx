import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBodyWeights } from '@/api/bodyWeights'
import { useExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { BodyTabIcon, MealIcon } from '@/components/icons'
import { Page, SectionHead } from '@/components/ui'
import { fmtDate, ymd } from '@/lib/format'
import { isCardioMenu } from '@/lib/stats'

type RecentItem = {
  key: string
  date: string
  time: string
  name: string
  value: string
  to: string
  fromDashboard: boolean
}

/** ダッシュボード: 直近7日の集計・クイック記録・最近の記録（セッション+体重） */
export function DashboardPage() {
  const navigate = useNavigate()
  const exercises = useExercises()
  const sessions = useSessions()
  const weights = useBodyWeights()

  const summary = useMemo(() => {
    const menus = new Map((exercises.data ?? []).map((m) => [m.id, m]))
    const cutoffD = new Date()
    cutoffD.setDate(cutoffD.getDate() - 7)
    const cutoff = ymd(cutoffD.getFullYear(), cutoffD.getMonth(), cutoffD.getDate())

    let sessionCount = 0
    let totalVolume = 0
    const items: RecentItem[] = []
    for (const s of sessions.data ?? []) {
      const menu = menus.get(s.exerciseId)
      if (!menu) continue
      if (s.date >= cutoff) {
        sessionCount++
        if (!isCardioMenu(menu)) for (const set of s.sets) totalVolume += set.weight * set.reps
      }
      let value: string
      if (isCardioMenu(menu)) {
        const parts: string[] = []
        if (s.cardio?.dist != null) parts.push(`${s.cardio.dist} km`)
        if (s.cardio?.time != null) parts.push(`${s.cardio.time} 分`)
        value = parts.join(' / ') || '—'
      } else {
        value = `${s.sets.length}セット`
      }
      items.push({
        key: `s-${s.id}`,
        date: s.date,
        time: s.time,
        name: menu.name,
        value,
        to: `/menus/${menu.id}/sessions/${s.id}`,
        fromDashboard: true,
      })
    }

    // 体重変化: 最新と、直近7日より前で一番新しい記録を比較（無ければ最古の記録と比較）
    const sorted = [...(weights.data ?? [])].sort((a, b) =>
      a.log_date < b.log_date ? 1 : a.log_date > b.log_date ? -1 : 0,
    )
    let weightLabel = '—'
    let weightColor = 'var(--text)'
    let weightUnit = ''
    if (sorted.length) {
      weightUnit = 'kg'
      const latest = sorted[0]
      const baseline = sorted.find((w) => w.log_date < cutoff) ?? sorted[sorted.length - 1]
      if (baseline.id !== latest.id) {
        const delta = +(latest.weight_kg - baseline.weight_kg).toFixed(1)
        weightLabel = (delta > 0 ? '+' : '') + delta
        weightColor = delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text)'
      } else {
        // 比較対象がまだ無い(記録が1件のみ)場合は現在値をそのまま出す
        weightLabel = String(latest.weight_kg)
        weightColor = 'var(--accent)'
      }
    }
    for (const w of weights.data ?? []) {
      items.push({
        key: `w-${w.id}`,
        date: w.log_date,
        time: '12:00',
        name: '体重記録',
        value: `${w.weight_kg} kg`,
        to: '/weight',
        fromDashboard: false,
      })
    }
    items.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))

    return {
      sessionCount,
      totalVolume,
      weightLabel,
      weightColor,
      weightUnit,
      recent: items.slice(0, 5),
    }
  }, [exercises.data, sessions.data, weights.data])

  return (
    <Page id="dashboard">
      <SectionHead title="ダッシュボード" sub="直近7日の記録とクイックアクセス" />
      <div className="card-label" style={{ padding: '0 2px' }}>
        直近7日
      </div>
      <div className="stats-grid" id="dash-stats" style={{ marginTop: 0, marginBottom: 18 }}>
        <div className="stat-box">
          <div className="stat-val" style={{ color: 'var(--accent)' }}>
            {summary.sessionCount}
          </div>
          <div className="stat-label">セッション</div>
        </div>
        <div className="stat-box">
          <div className="stat-val" style={{ color: 'var(--accent)' }}>
            {summary.totalVolume > 0 ? summary.totalVolume.toFixed(0) : '—'}
          </div>
          <div className="stat-unit">{summary.totalVolume > 0 ? 'kg' : ''}</div>
          <div className="stat-label">総ボリューム</div>
        </div>
        <div className="stat-box">
          <div className="stat-val" style={{ color: summary.weightColor }}>
            {summary.weightLabel}
          </div>
          <div className="stat-unit">{summary.weightUnit}</div>
          <div className="stat-label">体重変化</div>
        </div>
      </div>

      <div className="card-label" style={{ padding: '0 2px' }}>
        クイック記録
      </div>
      <div className="qa-row">
        <button type="button" className="qa-btn qa-accent" onClick={() => navigate('/menus')}>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 9h6M9 13h6" />
          </svg>
          セット記録
        </button>
        <button type="button" className="qa-btn qa-green" onClick={() => navigate('/weight')}>
          <BodyTabIcon />
          体重記録
        </button>
        <button type="button" className="qa-btn" onClick={() => navigate('/meal')}>
          <MealIcon />
          食事記録
        </button>
      </div>

      <div className="card-label" style={{ padding: '0 2px' }}>
        最近の記録
      </div>
      <div id="dash-recent">
        {summary.recent.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 12px' }}>
            <div className="empty-icon">📋</div>
            <div className="empty-title">まだ記録がありません</div>
            <div className="empty-desc">クイック記録から始めましょう</div>
          </div>
        ) : (
          summary.recent.map((it) => (
            <div
              key={it.key}
              className="dash-recent-row"
              onClick={() =>
                navigate(it.to, it.fromDashboard ? { state: { from: '/' } } : undefined)
              }
            >
              <div>
                <div className="dash-recent-name">{it.name}</div>
                <div className="dash-recent-date">{fmtDate(it.date)}</div>
              </div>
              <div className="dash-recent-val">{it.value}</div>
            </div>
          ))
        )}
      </div>
    </Page>
  )
}
