import { useState } from 'react'
import { useDeleteSet, useRecordSet, useUpdateSet } from '@/api/sessions'
import { LoadingButton } from '@/components/ui'
import { BODYWEIGHT } from '@/lib/constants'
import { orm } from '@/lib/one-rm'
import { toast } from '@/lib/toast'
import { DateTimeRow, SessionBar, type SessionFormProps } from './SessionHeader'

/** 筋トレのセット記録: セットの追加・編集(行をタップ)・削除 */
export function StrengthForm({ menu, session, draft, onDraftChange, onSaved }: SessionFormProps) {
  const isBodyweight = menu.type === BODYWEIGHT
  const recordSet = useRecordSet()
  const updateSet = useUpdateSet()
  const deleteSet = useDeleteSet()

  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)

  const sets = session?.sets ?? []
  const editingIdx = editingSetId ? sets.findIndex((s) => s.id === editingSetId) : -1

  const weight = isBodyweight ? 0 : parseFloat(w)
  const reps = parseInt(r, 10)
  // 重量・回数が0以下や未入力のときは追加できない（自重運動は回数だけ）
  const valid = isBodyweight ? reps > 0 : weight > 0 && reps > 0

  let preview: string
  if (isBodyweight) preview = reps > 0 ? `${reps}回` : '回数を入力してください'
  else if (valid) preview = `推定1RM：${orm(weight, reps)} kg（${weight}kg × ${reps}回）`
  else preview = '重量と回数を入力すると 1RM を表示します'

  const resetForm = () => {
    setW('')
    setR('')
    setEditingSetId(null)
  }

  async function commit() {
    if (!valid) return
    try {
      if (editingSetId && session) {
        await updateSet.mutateAsync({ sessionId: session.id, setId: editingSetId, weight, reps })
        toast('セットを更新しました')
      } else if (session) {
        await recordSet.mutateAsync({ sessionId: session.id, weight, reps })
        toast('セットを追加しました')
      } else {
        // 新規(未保存)セッションの最初のセット: セッション作成とセット追加を1回のRPCで行う
        const { row } = await recordSet.mutateAsync({
          exerciseId: menu.id,
          date: draft.date,
          time: draft.time,
          weight,
          reps,
        })
        toast('セットを追加しました')
        resetForm()
        onSaved(row.session_id)
        return
      }
    } catch {
      return // 通知は各mutationのonErrorで出している
    }
    resetForm()
  }

  function editSet(id: string) {
    const s = sets.find((x) => x.id === id)
    if (!s) return
    setEditingSetId(id)
    setW(isBodyweight ? '' : String(s.weight))
    setR(String(s.reps))
  }

  async function removeSet(id: string, idx: number) {
    if (!session) return
    if (!confirm(`セット${idx + 1}を削除しますか？`)) return
    try {
      await deleteSet.mutateAsync({ sessionId: session.id, setId: id })
    } catch {
      return
    }
    if (editingSetId === id) resetForm()
    toast('セットを削除しました')
  }

  const saving = recordSet.isPending || updateSet.isPending

  return (
    <>
      <SessionBar menu={menu} time={session?.time ?? draft.time} />
      <DateTimeRow session={session} draft={draft} onDraftChange={onDraftChange} />
      <div className="card">
        <div className="card-label" id="form-label">
          {editingIdx >= 0 ? `セット${editingIdx + 1}を編集中` : 'セットを追加'}
        </div>
        <div className="set-input-grid">
          {!isBodyweight && (
            <div className="input-box">
              <label htmlFor="inp-w">重量</label>
              <div className="big-wrap">
                <input
                  type="number"
                  className="big-input"
                  id="inp-w"
                  placeholder="60"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={w}
                  onChange={(e) => setW(e.target.value)}
                />
                <span className="big-unit">kg</span>
              </div>
            </div>
          )}
          <div className="input-box">
            <label htmlFor="inp-r">回数</label>
            <div className="big-wrap">
              <input
                type="number"
                className="big-input"
                id="inp-r"
                placeholder="10"
                inputMode="numeric"
                min="1"
                step="1"
                value={r}
                onChange={(e) => setR(e.target.value)}
              />
              <span className="big-unit">回</span>
            </div>
          </div>
        </div>
        <div className="orm-preview" id="orm-prev">
          {preview}
        </div>
        <LoadingButton
          id="btn-add-set"
          disabled={!valid}
          loading={saving}
          loadingLabel="保存中..."
          onClick={commit}
        >
          {editingSetId ? '変更を保存' : 'セットを追加'}
        </LoadingButton>
      </div>

      <div
        className="card-label"
        id="set-count-label"
        style={{ padding: '0 2px', marginBottom: 8 }}
      >
        記録済みセット（{sets.length}セット）
      </div>
      <div className="set-list" id="set-list">
        {sets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>
            まだセットが追加されていません
          </div>
        ) : (
          sets.map((s, i) => {
            const editing = s.id === editingSetId
            return (
              <div
                key={s.id}
                className={`set-row${editing ? ' editing' : ''}`}
                onClick={() => editSet(s.id)}
              >
                <div className="set-num">{i + 1}</div>
                <div className="set-info">
                  <div className="set-main">
                    {isBodyweight ? `${s.reps} 回` : `${s.weight} kg × ${s.reps} 回`}
                  </div>
                  {!isBodyweight && <div className="set-sub">1RM：{orm(s.weight, s.reps)} kg</div>}
                  <div className="set-edit-hint">
                    {editing ? '✏️ 編集中 — 上のフォームで変更できます' : 'タップして編集'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-del"
                  aria-label={`セット${i + 1}を削除`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeSet(s.id, i)
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
