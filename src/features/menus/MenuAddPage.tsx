import { useState } from 'react'
import { useAddExercise, useExercises } from '@/api/exercises'
import { LoadingButton, Page, SectionHead } from '@/components/ui'
import { CARDIO } from '@/lib/constants'
import { toast } from '@/lib/toast'
import { MenuFields } from './MenuFields'

/** メニューの追加（部位・種別・メニュー名） */
export function MenuAddPage() {
  const { data: exercises = [] } = useExercises()
  const add = useAddExercise()
  const [category, setCategory] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [name, setName] = useState('')

  const onCategoryChange = (cat: string) => {
    setCategory(cat)
    // 有酸素運動は種別が固定。それ以外へ切り替えたときは種別を選び直す
    setType(cat === CARDIO ? CARDIO : null)
  }

  const trimmed = name.trim()
  const canSubmit = !!category && !!trimmed && !!type

  async function submit() {
    if (!canSubmit || !type) return
    if (exercises.some((m) => m.name === trimmed && m.category === category && !m.archived)) {
      toast('同じ部位に同名のメニューがあります')
      return
    }
    try {
      await add.mutateAsync({ input: { name: trimmed, category, type }, existing: exercises })
    } catch {
      return // 通知は useAddExercise の onError で出している
    }
    toast(`「${trimmed}」を追加しました`)
    setCategory('')
    setType(null)
    setName('')
  }

  return (
    <Page id="add-menu">
      <SectionHead title="メニューの追加" sub="部位・種別・メニュー名を入力してください" />
      <div className="card">
        <MenuFields
          withPlaceholder
          category={category}
          type={type}
          name={name}
          onCategoryChange={onCategoryChange}
          onTypeChange={setType}
          onNameChange={setName}
        />
        <LoadingButton id="btn-add" disabled={!canSubmit} loading={add.isPending} onClick={submit}>
          追加する
        </LoadingButton>
      </div>
    </Page>
  )
}
