import { useMemo, useState } from 'react'
import { useDeleteMeal, useMeals, useSaveMeal } from '@/api/meals'
import { EmptyState, LoadingButton, Page, QueryBoundary, SectionHead } from '@/components/ui'
import { MEAL_TYPES } from '@/lib/constants'
import { fmtDate, today } from '@/lib/format'
import { calcMealCalories } from '@/lib/one-rm'
import { toast } from '@/lib/toast'
import type { MealLog } from '@/types/domain'
import { BodyTabs } from './BodyTabs'

/** 食事記録: P/F/Cを入力するとカロリーを自動計算（保存値はDBの生成列の計算結果） */
export function MealPage() {
  const meals = useMeals()
  const save = useSaveMeal()
  const remove = useDeleteMeal()

  const [date, setDate] = useState(today())
  const [mealType, setMealType] = useState<string>('朝')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carb, setCarb] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const list = useMemo(() => meals.data ?? [], [meals.data])
  const preview = calcMealCalories(
    parseFloat(protein) || 0,
    parseFloat(fat) || 0,
    parseFloat(carb) || 0,
  )

  // 日付ごとにまとめる（新しい日付から）
  const groups = useMemo(() => {
    const byDate = new Map<string, MealLog[]>()
    for (const m of list) {
      const arr = byDate.get(m.log_date)
      if (arr) arr.push(m)
      else byDate.set(m.log_date, [m])
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  }, [list])

  const resetForm = () => {
    setEditingId(null)
    setDate(today())
    setMealType('朝')
    setProtein('')
    setFat('')
    setCarb('')
  }

  async function submit() {
    const p = parseFloat(protein) || 0
    const f = parseFloat(fat) || 0
    const c = parseFloat(carb) || 0
    if (!date) {
      toast('日付を入力してください')
      return
    }
    if (p === 0 && f === 0 && c === 0) {
      toast('たんぱく質・脂質・炭水化物のいずれかを入力してください')
      return
    }
    try {
      await save.mutateAsync({
        id: editingId ?? undefined,
        date,
        mealType,
        protein: p,
        fat: f,
        carb: c,
      })
    } catch {
      return
    }
    toast(editingId ? '更新しました' : '記録しました')
    resetForm()
  }

  async function del(id: string) {
    if (!confirm('この食事記録を削除しますか？')) return
    try {
      await remove.mutateAsync(id)
    } catch {
      return
    }
    if (id === editingId) resetForm()
    toast('削除しました')
  }

  function edit(m: MealLog) {
    setEditingId(m.id)
    setDate(m.log_date)
    setMealType(m.meal_type)
    setProtein(String(m.protein_g))
    setFat(String(m.fat_g))
    setCarb(String(m.carb_g))
  }

  return (
    <Page id="meal">
      <SectionHead
        title="食事記録"
        sub="たんぱく質・脂質・炭水化物を入力するとカロリーを自動計算します"
      />
      <BodyTabs active="meal" />
      <div className="card">
        <div className="card-label">食事を記録</div>
        <div className="form-group">
          <label htmlFor="meal-inp-date">日付</label>
          <input
            type="date"
            className="form-input"
            id="meal-inp-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="meal-inp-type">区分</label>
          <select
            className="form-input"
            id="meal-inp-type"
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
          >
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="rm-input-row">
          <NutrientInput
            id="meal-inp-protein"
            label="たんぱく質"
            value={protein}
            onChange={setProtein}
          />
          <NutrientInput id="meal-inp-fat" label="脂質" value={fat} onChange={setFat} />
        </div>
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <NutrientInput id="meal-inp-carb" label="炭水化物" value={carb} onChange={setCarb} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          推定カロリー: <span id="meal-cal-preview">{preview}</span> kcal
        </div>
        <LoadingButton
          id="meal-submit-btn"
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
            id="meal-cancel-btn"
            style={{ marginTop: 8, width: '100%' }}
            onClick={resetForm}
          >
            キャンセル
          </button>
        )}
      </div>

      <div id="meal-list-body">
        <QueryBoundary
          isPending={meals.isPending}
          isError={meals.isError && !meals.data}
          onRetry={() => void meals.refetch()}
        >
          {groups.length === 0 ? (
            <EmptyState
              icon="🍽️"
              title="記録がありません"
              desc="上のフォームから食事を記録してください"
            />
          ) : (
            groups.map(([d, items]) => {
              const totalCal = items.reduce((s, m) => s + (m.calories_kcal ?? 0), 0)
              return (
                <div key={d}>
                  <div className="sec-title" style={{ fontSize: 13, margin: '16px 0 8px' }}>
                    {fmtDate(d)}
                    <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 12 }}>
                      {' '}
                      ・ 合計 {totalCal.toFixed(0)} kcal
                    </span>
                  </div>
                  {items.map((m) => (
                    <div className="prog-card" key={m.id}>
                      <div className="prog-card-head">
                        <div>
                          <div className="prog-card-name">
                            {m.meal_type} ・ {(m.calories_kcal ?? 0).toFixed(0)} kcal
                          </div>
                          <div className="prog-card-meta">
                            P {m.protein_g}g ・ F {m.fat_g}g ・ C {m.carb_g}g
                          </div>
                        </div>
                      </div>
                      <div className="menu-actions" style={{ marginTop: 10, marginBottom: 0 }}>
                        <button type="button" className="btn-mini" onClick={() => edit(m)}>
                          編集
                        </button>
                        <button
                          type="button"
                          className="btn-mini"
                          style={{ borderColor: 'var(--red)', color: 'var(--red-t)' }}
                          onClick={() => del(m.id)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </QueryBoundary>
      </div>
    </Page>
  )
}

function NutrientInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rm-input-box">
      <label htmlFor={id}>{label}</label>
      <div className="rm-input-wrap">
        <input
          type="number"
          className="big-input"
          id={id}
          placeholder="0"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="big-unit">g</span>
      </div>
    </div>
  )
}
