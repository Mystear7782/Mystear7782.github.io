import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RmPage } from './RmPage'

describe('RmPage', () => {
  it('重量・回数を入力すると、ベンチ/スクワットの推定1RMと換算表が出て、最大RM欄が自動入力される', async () => {
    const user = userEvent.setup()
    const { container } = render(<RmPage />)
    expect(container.querySelector('#rm-orm-result')).toHaveStyle({ display: 'none' })

    await user.type(screen.getByLabelText('使用重量'), '80')
    await user.type(screen.getByLabelText('挙上回数'), '10')

    expect(container.querySelector('#rm-bp-val')).toHaveTextContent('100')
    expect(container.querySelector('#rm-sq-val')).toHaveTextContent('104')
    expect(screen.getByLabelText('現在の最大RM')).toHaveValue(100)
    expect(container.querySelectorAll('.rm-rep-table tbody tr')).toHaveLength(10)
    // 入力した回数(10)の行がハイライトされる
    expect(container.querySelector('tr.rm-highlight .rm-rep-badge')).toHaveTextContent('10')
  })

  it('重量0・回数0では結果を出さない', async () => {
    const user = userEvent.setup()
    const { container } = render(<RmPage />)
    await user.type(screen.getByLabelText('使用重量'), '0')
    await user.type(screen.getByLabelText('挙上回数'), '10')
    expect(container.querySelector('#rm-orm-result')).toHaveStyle({ display: 'none' })
  })

  it('最大RMを直接入力すると換算表が出る（1repは最大RMそのもの）', async () => {
    const user = userEvent.setup()
    const { container } = render(<RmPage />)
    expect(container.querySelector('.rm-rep-table')).toBeNull()
    await user.type(screen.getByLabelText('現在の最大RM'), '120')
    const firstRow = container.querySelector('.rm-rep-table tbody tr')!
    expect(firstRow.textContent).toContain('120 kg')
  })
})
