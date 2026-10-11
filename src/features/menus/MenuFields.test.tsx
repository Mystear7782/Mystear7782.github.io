import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MenuFields } from './MenuFields'

/** 状態を持つ入れ物（MenuAddPage / EditMenuModal と同じ使い方） */
function Harness({ initialCategory = '' }: { initialCategory?: string }) {
  const [category, setCategory] = useState(initialCategory)
  const [type, setType] = useState<string | null>(null)
  const [name, setName] = useState('')
  return (
    <MenuFields
      withPlaceholder
      category={category}
      type={type}
      name={name}
      onCategoryChange={(c) => {
        setCategory(c)
        setType(c === '有酸素運動' ? '有酸素運動' : null)
      }}
      onTypeChange={setType}
      onNameChange={setName}
    />
  )
}

describe('MenuFields', () => {
  it('部位の選択肢に「その他」「有酸素運動」を含む', () => {
    render(<Harness />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([
      '-- 部位を選択 --',
      '胸',
      '背中',
      '肩',
      '足',
      '腕',
      '有酸素運動',
      'その他',
    ])
  })

  it('メニュー名は30文字(全角・半角とも [...value].length)で入力が止まる', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByPlaceholderText(/ベンチプレス/)
    await user.click(input)
    await user.paste('あ'.repeat(31))
    expect(input).toHaveValue('あ'.repeat(30))
    await user.clear(input)
    await user.paste('a'.repeat(61))
    expect(input).toHaveValue('a'.repeat(30))
  })

  it('種別チップを選ぶと選択状態(sel)になる。有酸素運動では種別が非表示', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    const chip = (t: string) => container.querySelector(`.type-chip[data-type="${t}"]`)!
    await user.click(chip('マシン'))
    expect(chip('マシン')).toHaveClass('sel')
    expect(chip('フリーウェイト')).not.toHaveClass('sel')

    await user.selectOptions(screen.getByRole('combobox'), '有酸素運動')
    expect(container.querySelector('#type-section')).toHaveStyle({ display: 'none' })
    await user.selectOptions(screen.getByRole('combobox'), '胸')
    expect(container.querySelector('#type-section')).toHaveStyle({ display: 'block' })
    expect(chip('マシン')).not.toHaveClass('sel') // 部位を変えたら種別は選び直し
  })

  it('編集モーダル用のIDプレフィックスが付く', () => {
    const { container } = render(
      <MenuFields
        idPrefix="edit-"
        category="胸"
        type="マシン"
        name="x"
        onCategoryChange={() => undefined}
        onTypeChange={() => undefined}
        onNameChange={() => undefined}
      />,
    )
    expect(container.querySelector('#edit-sel-cat')).not.toBeNull()
    expect(container.querySelector('#edit-type-section')).not.toBeNull()
    expect(container.querySelector('#edit-inp-name')).not.toBeNull()
  })
})
