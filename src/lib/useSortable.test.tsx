import { act, fireEvent, render, screen } from '@testing-library/react'
import { useSortable } from './useSortable'

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const ROW_HEIGHT = 70
const PITCH = 78 // 行の高さ + 行間

/** useSortable を使う最小のリスト。行の位置は固定値でモックする（jsdomにはレイアウトが無いため） */
function List({ onCommit }: { onCommit: (ids: string[]) => Promise<unknown> }) {
  const sortable = useSortable(ITEMS, onCommit)
  return (
    <div data-testid="list">
      {ITEMS.map((item, i) => (
        <div
          key={item.id}
          data-testid={`row-${item.id}`}
          data-order={sortable.rowStyle(item.id)?.order ?? ''}
          data-dragging={sortable.isDragging(item.id)}
          ref={(el) => {
            sortable.rowRef(item.id)(el)
            if (el) {
              el.getBoundingClientRect = () =>
                ({
                  top: i * PITCH,
                  left: 0,
                  width: 300,
                  height: ROW_HEIGHT,
                  bottom: i * PITCH + ROW_HEIGHT,
                  right: 300,
                  x: 0,
                  y: i * PITCH,
                }) as DOMRect
            }
          }}
          style={sortable.rowStyle(item.id)}
        >
          <button data-testid={`handle-${item.id}`} {...sortable.handleProps(item.id)} />
        </div>
      ))}
      <div data-testid="placeholder-state">{sortable.placeholderStyle ? 'on' : 'off'}</div>
    </div>
  )
}

const press = (id: string, clientY: number) =>
  fireEvent.pointerDown(screen.getByTestId(`handle-${id}`), {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientY,
  })
const move = (clientY: number) =>
  act(() => void fireEvent.pointerMove(window, { pointerId: 1, clientY }))
const release = () => act(() => void fireEvent.pointerUp(window, { pointerId: 1 }))

describe('useSortable', () => {
  it('他の行の中心を越えるまで動かすと、その位置に入れ替わって onCommit に新しい並びが渡る', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    render(<List onCommit={onCommit} />)
    press('a', ROW_HEIGHT / 2) // 先頭行の中心をつかむ
    move(ROW_HEIGHT / 2 + PITCH * 2 + 10) // 3番目の行の中心より下まで動かす
    expect(screen.getByTestId('placeholder-state')).toHaveTextContent('on')
    release()
    await act(async () => undefined)
    expect(onCommit).toHaveBeenCalledWith(['b', 'c', 'a'])
  })

  it('1つ下の行の中心を越えたところで離すと、隣と入れ替わる', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    render(<List onCommit={onCommit} />)
    press('a', ROW_HEIGHT / 2)
    move(ROW_HEIGHT / 2 + PITCH + 5)
    release()
    await act(async () => undefined)
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('下から上へも動かせる', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    render(<List onCommit={onCommit} />)
    press('c', 2 * PITCH + ROW_HEIGHT / 2)
    move(ROW_HEIGHT / 2 - 10) // 先頭行の中心より上
    release()
    await act(async () => undefined)
    expect(onCommit).toHaveBeenCalledWith(['c', 'a', 'b'])
  })

  it('4px未満の動き（タップ相当）ではドラッグを始めず、onCommit も呼ばない', async () => {
    const onCommit = vi.fn()
    render(<List onCommit={onCommit} />)
    press('a', 35)
    move(37)
    expect(screen.getByTestId('placeholder-state')).toHaveTextContent('off')
    release()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('動かしても元の並びのまま離したときは onCommit を呼ばない', async () => {
    const onCommit = vi.fn()
    render(<List onCommit={onCommit} />)
    press('a', 35)
    move(35 + 20) // ドラッグは始まるが、隣の中心は越えない
    release()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('pointercancel（通知・画面端スワイプ等）では並びを確定しない', () => {
    const onCommit = vi.fn()
    render(<List onCommit={onCommit} />)
    press('a', 35)
    move(35 + PITCH * 2)
    act(() => void fireEvent.pointerCancel(window, { pointerId: 1 }))
    expect(screen.getByTestId('placeholder-state')).toHaveTextContent('off')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('ドラッグ中は、見た目の並び(CSS order)だけを変え、DOMの並びは変えない', () => {
    render(<List onCommit={vi.fn().mockResolvedValue(undefined)} />)
    press('a', 35)
    move(35 + PITCH + 5)
    // b が先頭、a(ドラッグ中)は fixed、c は最後のまま
    expect(screen.getByTestId('row-b').dataset.order).toBe('0')
    expect(screen.getByTestId('row-c').dataset.order).toBe('2')
    expect(screen.getByTestId('row-a').dataset.dragging).toBe('true')
    const ids = [...screen.getByTestId('list').children].map((el) => el.getAttribute('data-testid'))
    expect(ids.slice(0, 3)).toEqual(['row-a', 'row-b', 'row-c']) // DOM順は不変
  })

  it('保存が失敗(reject)したら、確定した並びの表示をやめて元に戻る', async () => {
    let rejectFn: (e: unknown) => void = () => undefined
    const onCommit = vi.fn(() => new Promise((_, reject) => (rejectFn = reject)))
    render(<List onCommit={onCommit} />)
    press('a', 35)
    move(35 + PITCH + 5)
    release()
    // 保存中は確定した並び(b, a, c)を表示する
    expect(screen.getByTestId('row-b').dataset.order).toBe('0')
    expect(screen.getByTestId('row-a').dataset.order).toBe('1')
    await act(async () => rejectFn(new Error('save failed')))
    // 失敗後は並びの上書きをやめる（データ側の並びに戻る）
    expect(screen.getByTestId('row-b').dataset.order).toBe('')
  })

  it('右クリックなど、主ボタン以外ではドラッグしない', () => {
    render(<List onCommit={vi.fn()} />)
    fireEvent.pointerDown(screen.getByTestId('handle-a'), {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientY: 35,
    })
    move(35 + PITCH * 2)
    expect(screen.getByTestId('placeholder-state')).toHaveTextContent('off')
  })
})
