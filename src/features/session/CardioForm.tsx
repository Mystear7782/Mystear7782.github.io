import { useState } from 'react'
import { useSaveCardio } from '@/api/sessions'
import { LoadingButton } from '@/components/ui'
import { toast } from '@/lib/toast'
import type { Cardio } from '@/types/domain'
import { DateTimeRow, SessionBar, type SessionFormProps } from './SessionHeader'

type Fields = Record<'time' | 'dist' | 'cal' | 'hr' | 'maxSpd' | 'avgSpd', string>

const toFields = (c: Cardio | null | undefined): Fields => ({
  time: c?.time != null ? String(c.time) : '',
  dist: c?.dist != null ? String(c.dist) : '',
  cal: c?.cal != null ? String(c.cal) : '',
  hr: c?.hr != null ? String(c.hr) : '',
  maxSpd: c?.maxSpd != null ? String(c.maxSpd) : '',
  avgSpd: c?.avgSpd != null ? String(c.avgSpd) : '',
})

/** 空欄・0以下は null として扱う（0分・0km などは無効値） */
const num = (s: string): number | null => {
  if (s === '') return null
  const n = parseFloat(s)
  return n > 0 ? n : null
}

const toCardio = (f: Fields): Cardio => ({
  time: num(f.time),
  dist: num(f.dist),
  cal: num(f.cal),
  hr: num(f.hr),
  maxSpd: num(f.maxSpd),
  avgSpd: num(f.avgSpd),
})

const REQUIRED: { key: keyof Fields; label: string }[] = [
  { key: 'time', label: '合計時間' },
  { key: 'dist', label: '合計距離' },
  { key: 'cal', label: '消費カロリー' },
  { key: 'hr', label: '平均心拍数' },
]

/** 有酸素運動の記録（必須4項目 + 任意の速度2項目）。入力中はローカルだけで、「記録を保存」で送信する */
export function CardioForm({
  menu,
  session,
  draft,
  onDraftChange,
  onSaved,
  onFinished,
}: SessionFormProps) {
  const saveCardio = useSaveCardio()
  const [f, setF] = useState<Fields>(() => toFields(session?.cardio))
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }))

  const c = toCardio(f)

  async function save() {
    const missing = REQUIRED.filter(({ key }) => c[key] == null).map((x) => x.label)
    if (missing.length) {
      toast(`未入力項目: ${missing.join('・')}`)
      return
    }
    try {
      const { sessionId } = await saveCardio.mutateAsync({
        sessionId: session?.id,
        exerciseId: menu.id,
        date: draft.date,
        time: draft.time,
        cardio: c,
      })
      toast('記録を保存しました')
      if (!session) onSaved(sessionId)
      onFinished()
    } catch {
      /* 通知はuseSaveCardioのonErrorで出している */
    }
  }

  const hasAny = [c.time, c.dist, c.cal, c.hr].some((v) => v != null)

  return (
    <>
      <SessionBar menu={menu} time={session?.time ?? draft.time} />
      <DateTimeRow session={session} draft={draft} onDraftChange={onDraftChange} />
      <div className="card">
        <div className="card-label">有酸素記録</div>

        <div className="cardio-grid">
          <CardioInput
            id="c-time"
            label="合計時間"
            required
            unit="分"
            placeholder="30"
            inputMode="numeric"
            step="1"
            value={f.time}
            onChange={set('time')}
          />
          <CardioInput
            id="c-dist"
            label="合計距離"
            required
            unit="km"
            placeholder="5.0"
            inputMode="decimal"
            step="0.1"
            value={f.dist}
            onChange={set('dist')}
          />
          <CardioInput
            id="c-cal"
            label="消費カロリー"
            required
            unit="kcal"
            placeholder="300"
            inputMode="numeric"
            step="1"
            value={f.cal}
            onChange={set('cal')}
          />
          <CardioInput
            id="c-hr"
            label="平均心拍数"
            required
            unit="bpm"
            placeholder="140"
            inputMode="numeric"
            step="1"
            value={f.hr}
            onChange={set('hr')}
          />
        </div>

        <div className="cardio-optional-label">任意項目</div>

        <div className="cardio-grid">
          <CardioInput
            id="c-maxspd"
            label="最大速度"
            unit="km/h"
            placeholder="12.0"
            inputMode="decimal"
            step="0.1"
            value={f.maxSpd}
            onChange={set('maxSpd')}
          />
          <CardioInput
            id="c-avgspd"
            label="平均速度"
            unit="km/h"
            placeholder="8.0"
            inputMode="decimal"
            step="0.1"
            value={f.avgSpd}
            onChange={set('avgSpd')}
          />
        </div>

        <LoadingButton
          id="btn-save-cardio"
          style={{ marginTop: 4 }}
          loading={saveCardio.isPending}
          loadingLabel="保存中..."
          onClick={save}
        >
          記録を保存
        </LoadingButton>
      </div>

      <div id="cardio-preview">
        {hasAny && (
          <>
            <div className="card-label" style={{ padding: '0 2px', marginBottom: 8 }}>
              入力中のプレビュー
            </div>
            <div className="cardio-record">
              <div className="cardio-record-head">
                <div className="cardio-record-title">{menu.name}</div>
              </div>
              <div className="cardio-stats">
                <PreviewStat value={c.time} unit="分" label="合計時間" />
                <PreviewStat value={c.dist} unit="km" label="合計距離" />
                <PreviewStat value={c.cal} unit="kcal" label="消費カロリー" />
                <PreviewStat value={c.hr} unit="bpm" label="平均心拍数" />
                <PreviewStat value={c.maxSpd} unit="km/h" label="最大速度" />
                <PreviewStat value={c.avgSpd} unit="km/h" label="平均速度" />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function CardioInput({
  id,
  label,
  required,
  unit,
  ...input
}: {
  id: string
  label: string
  required?: boolean
  unit: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="cardio-field">
      <label htmlFor={id}>
        {label} {required && <span style={{ color: 'var(--red)', fontSize: 10 }}>必須</span>}
      </label>
      <div className="cardio-input-wrap">
        <input type="number" className="cardio-input" id={id} min="0" {...input} />
        <span className="cardio-unit">{unit}</span>
      </div>
    </div>
  )
}

function PreviewStat({
  value,
  unit,
  label,
}: {
  value: number | null
  unit: string
  label: string
}) {
  if (value == null) return null
  return (
    <div className="cardio-stat">
      <div className="cardio-stat-val">
        {value}
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}> {unit}</span>
      </div>
      <div className="cardio-stat-label">{label}</div>
    </div>
  )
}
