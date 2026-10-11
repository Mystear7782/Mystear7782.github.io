import { useState } from 'react'
import { Page, SectionHead } from '@/components/ui'
import { rmBP, rmRound, rmSQ, rmTable } from '@/lib/one-rm'

/** RM換算表: 推定1RM（ベンチ / スクワット・DL）の計算と、1〜10rep の換算一覧 */
export function RmPage() {
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [max, setMax] = useState('')

  const weight = parseFloat(w)
  const reps = parseInt(r, 10)
  const valid = weight > 0 && reps >= 1
  const bp = valid ? rmRound(rmBP(weight, reps)) : null
  const sq = valid ? rmRound(rmSQ(weight, reps)) : null

  // 重量・回数を入力すると最大RM欄へベンチプレスの値を自動で入れる（その後は手で直せる）
  const update = (nextW: string, nextR: string) => {
    setW(nextW)
    setR(nextR)
    const ww = parseFloat(nextW)
    const rr = parseInt(nextR, 10)
    if (ww > 0 && rr >= 1) setMax(String(rmRound(rmBP(ww, rr))))
  }

  const maxVal = parseFloat(max)
  const rows = maxVal > 0 ? rmTable(maxVal) : null
  const inputReps = reps || 0

  return (
    <Page id="rm">
      <SectionHead title="RM換算表" sub="推定1RMの計算と1〜10rep換算を行います" />

      <div className="card">
        <div className="card-label">推定1RM 計算</div>
        <div className="rm-input-row">
          <div className="rm-input-box">
            <label htmlFor="rm-inp-w">使用重量</label>
            <div className="rm-input-wrap">
              <input
                type="number"
                className="big-input"
                id="rm-inp-w"
                placeholder="80"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={w}
                onChange={(e) => update(e.target.value, r)}
              />
              <span className="big-unit">kg</span>
            </div>
          </div>
          <div className="rm-input-box">
            <label htmlFor="rm-inp-r">挙上回数</label>
            <div className="rm-input-wrap">
              <input
                type="number"
                className="big-input"
                id="rm-inp-r"
                placeholder="10"
                inputMode="numeric"
                min="1"
                max="20"
                step="1"
                value={r}
                onChange={(e) => update(w, e.target.value)}
              />
              <span className="big-unit">回</span>
            </div>
          </div>
        </div>
        <div id="rm-orm-result" style={{ display: valid ? 'block' : 'none' }}>
          <div className="rm-result-grid">
            <div className="rm-result-card">
              <div className="rm-result-label">ベンチプレス 推定1RM</div>
              <div className="rm-result-val">
                <span id="rm-bp-val">{bp ?? '—'}</span>
                <span className="rm-result-unit"> kg</span>
              </div>
            </div>
            <div className="rm-result-card">
              <div className="rm-result-label">スクワット / デッドリフト 推定1RM</div>
              <div className="rm-result-val">
                <span id="rm-sq-val">{sq ?? '—'}</span>
                <span className="rm-result-unit"> kg</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">1〜10rep 換算一覧</div>
        <div className="rm-max-row">
          <label htmlFor="rm-inp-max">現在の最大RM</label>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="number"
              className="big-input"
              id="rm-inp-max"
              placeholder="例：100"
              inputMode="decimal"
              min="0"
              step="0.5"
              style={{ fontSize: 16, padding: '10px 40px 10px 12px' }}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
            <span className="big-unit">kg</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          推定1RM計算から自動入力されます
        </div>
        <div id="rm-table-wrap">
          {rows ? (
            <div className="table-wrap">
              <table className="rm-rep-table">
                <thead>
                  <tr>
                    <th>rep</th>
                    <th>ベンチプレス</th>
                    <th>スクワット / DL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rep} className={row.rep === inputReps ? 'rm-highlight' : ''}>
                      <td>
                        <span className="rm-rep-badge">{row.rep}</span>
                      </td>
                      <td>{row.bench} kg</td>
                      <td>{row.squat} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon" style={{ fontSize: 24 }}>
                🔢
              </div>
              <div className="empty-title">最大RMを入力してください</div>
              <div className="empty-desc">重量と回数を入力するか、最大RMを直接入力してください</div>
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
