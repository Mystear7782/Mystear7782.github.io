import { useState } from 'react'
import { useUpdateExercise } from '@/api/exercises'
import { LoadingButton, Modal } from '@/components/ui'
import { CARDIO } from '@/lib/constants'
import { toast } from '@/lib/toast'
import type { Exercise } from '@/types/domain'
import { MenuFields } from './MenuFields'

/** メニューの編集（名前・部位・種別）。保存するとメニュー詳細に反映される */
export function EditMenuModal({
  menu,
  all,
  onClose,
}: {
  menu: Exercise
  /** 同名チェック用の全メニュー */
  all: Exercise[]
  onClose: () => void
}) {
  const update = useUpdateExercise()
  const [category, setCategory] = useState(menu.category)
  const [type, setType] = useState<string | null>(menu.type)
  const [name, setName] = useState(menu.name)

  const onCategoryChange = (cat: string) => {
    setCategory(cat)
    if (cat === CARDIO) setType(CARDIO)
    else if (type === CARDIO) setType(null) // 有酸素から他の部位へ変えたら種別を選び直す
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('メニュー名を入力してください')
      return
    }
    if (!type) {
      toast('種別を選択してください')
      return
    }
    if (
      all.some(
        (m) => m.id !== menu.id && m.name === trimmed && m.category === category && !m.archived,
      )
    ) {
      toast('同じ部位に同名のメニューがあります')
      return
    }
    try {
      await update.mutateAsync({ id: menu.id, patch: { name: trimmed, category, type } })
    } catch {
      return
    }
    onClose()
    toast(`「${trimmed}」を更新しました`)
  }

  return (
    <Modal id="edit-menu-modal" title="メニューを編集" onClose={onClose}>
      <MenuFields
        idPrefix="edit-"
        category={category}
        type={type}
        name={name}
        onCategoryChange={onCategoryChange}
        onTypeChange={setType}
        onNameChange={setName}
      />
      <div className="modal-actions">
        <button type="button" className="btn-modal-cancel" onClick={onClose}>
          キャンセル
        </button>
        <LoadingButton className="btn-modal-save" loading={update.isPending} onClick={save}>
          保存する
        </LoadingButton>
      </div>
    </Modal>
  )
}
