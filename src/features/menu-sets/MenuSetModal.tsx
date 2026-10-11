import { useState } from 'react'
import { useSaveMenuSet } from '@/api/menuSets'
import { LoadingButton, Modal } from '@/components/ui'
import { NAME_MAX_LENGTH, tagClass } from '@/lib/constants'
import { clampLength } from '@/lib/format'
import { toast } from '@/lib/toast'
import type { Exercise, MenuSet } from '@/types/domain'

/** メニューセットの作成・編集。セット名と、含めるメニュー（アーカイブ済みを除く）を選ぶ */
export function MenuSetModal({
  menuSet,
  exercises,
  onClose,
}: {
  /** 編集対象。新規作成なら undefined */
  menuSet?: MenuSet
  exercises: Exercise[]
  onClose: () => void
}) {
  const save = useSaveMenuSet()
  const [name, setName] = useState(menuSet?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(menuSet?.exerciseIds ?? []))

  const candidates = exercises.filter((m) => !m.archived)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('セット名を入力してください')
      return
    }
    if (selected.size === 0) {
      toast('メニューを1つ以上選択してください')
      return
    }
    // 並び順: 既存のセットでは、これまでの順序(ドラッグで並べ替えた順)を保ち、新しく追加したメニューを末尾に足す
    const kept = (menuSet?.exerciseIds ?? []).filter((id) => selected.has(id))
    const added = candidates.map((m) => m.id).filter((id) => selected.has(id) && !kept.includes(id))
    try {
      await save.mutateAsync({ id: menuSet?.id, name: trimmed, exerciseIds: [...kept, ...added] })
    } catch {
      return
    }
    toast(menuSet ? `「${trimmed}」を更新しました` : `「${trimmed}」を作成しました`)
    onClose()
  }

  return (
    <Modal id="menuset-modal" title={menuSet ? 'セットを編集' : 'セットを作成'} onClose={onClose}>
      <div className="card-label">セット名</div>
      <div className="form-group">
        <input
          type="text"
          className="form-input"
          id="menuset-inp-name"
          placeholder="例：胸・背中デー（全角30文字まで）"
          value={name}
          onChange={(e) => setName(clampLength(e.target.value, NAME_MAX_LENGTH))}
        />
      </div>
      <div className="card-label">含めるメニュー</div>
      <div className="form-group">
        <div id="menuset-menu-checklist" className="menuset-checklist">
          {candidates.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              先に「メニューの追加」からメニューを登録してください
            </div>
          ) : (
            candidates.map((m) => (
              <label className="menuset-check-row" key={m.id}>
                <input
                  type="checkbox"
                  value={m.id}
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span className={`tag ${tagClass(m.type)}`}>{m.type}</span>
                <span>{m.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>（{m.category}）</span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-modal-cancel" onClick={onClose}>
          キャンセル
        </button>
        <LoadingButton className="btn-modal-save" loading={save.isPending} onClick={submit}>
          保存する
        </LoadingButton>
      </div>
    </Modal>
  )
}
