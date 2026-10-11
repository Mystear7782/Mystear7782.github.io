import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { LazyLineChart as LineChart } from '@/components/LazyLineChart'
import { BackButton, EmptyState, Page, QueryBoundary } from '@/components/ui'
import { tagClass } from '@/lib/constants'
import { fmtDate, fmtDateShort } from '@/lib/format'
import { sessionStats, sortSessionsAsc } from '@/lib/stats'

/** 分析詳細: ボリューム推移・最大1RM推移のグラフと、セッションごとの数値表 */
export function AnalysisDetailPage() {
  const { menuId } = useParams()
  const exercises = useExercises()
  const sessions = useSessions()
  const menu = exercises.data?.find((m) => m.id === menuId)

  const rows = useMemo(
    () =>
      sortSessionsAsc(
        (sessions.data ?? []).filter((s) => s.exerciseId === menuId && s.sets.length > 0),
      ).map((s) => {
        const st = sessionStats(s)
        return { id: s.id, date: s.date, volume: +st.volume.toFixed(0), orm: +st.maxOrm.toFixed(1) }
      }),
    [sessions.data, menuId],
  )

  return (
    <Page id="analysis-detail">
      <BackButton to="/analysis" label="分析に戻る" />
      <div id="analysis-detail-body">
        <QueryBoundary
          isPending={exercises.isPending || sessions.isPending}
          isError={(exercises.isError && !exercises.data) || (sessions.isError && !sessions.data)}
          onRetry={() => {
            void exercises.refetch()
            void sessions.refetch()
          }}
        >
          {!menu ? (
            <EmptyState icon="🔍" title="メニューが見つかりません" />
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}
                >
                  {menu.name}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className={`tag ${tagClass(menu.type)}`}>{menu.type}</span>
                  <span className="tag" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                    {menu.category}
                  </span>
                </div>
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  compact
                  icon="📊"
                  title="記録がありません"
                  desc="セットを記録するとグラフが表示されます"
                />
              ) : (
                <>
                  <div className="chart-card">
                    <div className="chart-head">
                      <div className="chart-title">ボリューム推移 (kg)</div>
                    </div>
                    <div className="chart-wrap">
                      <LineChart
                        id="chart-vol"
                        labels={rows.map((r) => fmtDateShort(r.date))}
                        data={rows.map((r) => r.volume)}
                        label="ボリューム (kg)"
                      />
                    </div>
                  </div>

                  <div className="chart-card">
                    <div className="chart-head">
                      <div className="chart-title">最大1RM推移 (kg)</div>
                    </div>
                    <div className="chart-wrap">
                      <LineChart
                        id="chart-orm"
                        labels={rows.map((r) => fmtDateShort(r.date))}
                        data={rows.map((r) => r.orm)}
                        label="最大1RM (kg)"
                      />
                    </div>
                  </div>

                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-wrap">
                      <table className="hist-table">
                        <thead>
                          <tr>
                            <th>日付</th>
                            <th>ボリューム</th>
                            <th>最大1RM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id}>
                              <td className="td-date">{fmtDate(r.date)}</td>
                              <td className="td-vol">{r.volume} kg</td>
                              <td className="td-1rm">{r.orm} kg</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </QueryBoundary>
      </div>
    </Page>
  )
}
