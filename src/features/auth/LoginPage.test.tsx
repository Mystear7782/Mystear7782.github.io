import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'

const signIn = vi.hoisted(() => vi.fn())
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ signIn }) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('LoginPage', () => {
  it('未入力ではログインを呼ばずにエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'メールアドレスとパスワードを入力してください',
    )
    expect(signIn).not.toHaveBeenCalled()
  })

  it('入力した値（メールは前後の空白を除く）でログインを呼ぶ', async () => {
    signIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByPlaceholderText('メールアドレス'), ' me@example.test ')
    await user.type(screen.getByPlaceholderText('パスワード'), 'secret')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(signIn).toHaveBeenCalledWith('me@example.test', 'secret')
  })

  it('認証エラーは日本語の簡潔なメッセージにし、生のエラー詳細は画面に出さない', async () => {
    signIn.mockRejectedValue({
      code: 'invalid_credentials',
      status: 400,
      message: 'Invalid login credentials',
    })
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByPlaceholderText('メールアドレス'), 'a@example.test')
    await user.type(screen.getByPlaceholderText('パスワード'), 'bad')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('メールアドレスまたはパスワードが正しくありません')
    expect(alert).not.toHaveTextContent('Invalid login credentials')
  })

  it('通信エラーは別のメッセージにする', async () => {
    signIn.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByPlaceholderText('メールアドレス'), 'a@example.test')
    await user.type(screen.getByPlaceholderText('パスワード'), 'x')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('通信を確認してください')
  })
})
