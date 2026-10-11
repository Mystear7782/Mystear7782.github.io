import { useMemo, useState } from 'react'
import { useBodyWeights, useDeleteBodyWeight, useSaveBodyWeight } from '@/api/bodyWeights'
import { LazyLineChart as LineChart } from '@/components/LazyLineChart'
import { EmptyState, LoadingButton, Page, QueryBoundary, SectionHead } from '@/components/ui'
import { fmtDate, fmtDateShort, today } from '@/lib/format'
import { toast } from '@/lib/toast'
import { BodyTabs } from './BodyTabs'

/** 体重ログ: 記録フォーム・推移グラフ・履歴（同日に複数回の記録も可能） */
export function WeightPage() {
  const weights = useBodyWeights()
  const save = useSaveBodyWeight()
  const remove = useDeleteBodyWeight()

  const [date, setDate] = useState(today())
  const [value, setValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const list = useMemo(() => weights.data ?? [], [weights.data])

  // グラフ用に古い順へ並べ替える。1件以下では推移が描けないので非表示
  const chart = useMemo(() => {
    const sorted = [...list].sort((a, b) =>
      a.log_date !== b.log_date
        ? a.log_date < b.log_date
          ? -1
          : 1
        : a.created_at < b.created_at
          ? -1
          : 1,
    )
    return {
      labels: sorted.map((w) => fmtDateShort(w.log_date)),
      data: sorted.map((w) => w.weight_kg),
    }
  }, [list])

  const resetForm = () => {
    setEditingId(null)
    setDate(today())
    setValue('')
  }

  async function submit() {
    const weight = parseFloat(value)
    if (!date) {
      toast('日付を入力してください')
      return
    }
    if (value === '' || isNaN(weight) || weight <= 0) {
      toast('体重を正しく入力してください')
      return
    }
    try {
      await save.mutateAsync({ id: editingId ?? undefined, date, weight })
    } catch {
      return
    }
    toast(editingId ? '更新しました' : '記録しました')
    resetForm()
  }

  async function del(id: string) {
    if (!confirm('この体重記録を削除しますか？')) return
    try {
      await remove.mutateAsync(id)
    } catch {
      return
    }
    if (id === editingId) resetForm()
    toast('削除しました')
  }

  return (
    <Page id="weight">
      <SectionHead title="体重ログ" sub="日々の体重を記録します（1日に複数回の記録も可能です）" />
      <BodyTabs active="weight" />
      <div className="card">
        <div className="card-label">体重を記録</div>
        <div className="form-group">
          <label htmlFor="weight-inp-date">日付</label>
          <input
            type="date"
            className="form-input"
            id="weight-inp-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="rm-input-box" style={{ marginBottom: 14 }}>
          <label htmlFor="weight-inp-value">体重</label>
          <div className="rm-input-wrap">
            <input
              type="number"
              className="big-input"
              id="weight-inp-value"
              placeholder="65.0"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="big-unit">kg</span>
          </div>
        </div>
        <LoadingButton
          id="weight-submit-btn"
          loading={save.isPending}
          loadingLabel="保存中..."
          onClick={submit}
        >
          {editingId ? '更新する' : '記録する'}
        </LoadingButton>
        {editingId && (
          <button
            type="button"
            className="btn-mini"
            id="weight-cancel-btn"
            style={{ marginTop: 8, width: '100%' }}
            onClick={resetForm}
          >
            キャンセル
          </button>
        )}
      </div>

      {chart.labels.length >= 2 && (
        <div className="chart-card" id="weight-chart-card">
          <div className="chart-head">
            <div className="chart-title">体重推移 (kg)</div>
          </div>
          <div className="chart-wrap">
            <LineChart
              id="chart-weight"
              labels={chart.labels}
              data={chart.data}
              label="体重 (kg)"
            />
          </div>
        </div>
      )}

      <div id="weight-list-body">
        <QueryBoundary
          isPending={weights.isPending}
          isError={weights.isError && !weights.data}
          onRetry={() => void weights.refetch()}
        >
          {list.length === 0 ? (
            <EmptyState
              icon="⚖️"
              title="記録がありません"
              desc="上のフォームから体重を記録してください"
            />
          ) : (
            list.map((w) => (
              <div className="prog-card" key={w.id}>
                <div className="prog-card-head">
                  <div>
                    <div className="prog-card-name">{w.weight_kg} kg</div>
                    <div className="prog-card-meta">{fmtDate(w.log_date)}</div>
                  </div>
                </div>
                <div className="menu-actions" style={{ marginTop: 10, marginBottom: 0 }}>
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => {
                      setEditingId(w.id)
                      setDate(w.log_date)
                      setValue(String(w.weight_kg))
                    }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="btn-mini"
                    style={{ borderColor: 'var(--red)', color: 'var(--red-t)' }}
                    onClick={() => del(w.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </QueryBoundary>
      </div>
    </Page>
  )
}
