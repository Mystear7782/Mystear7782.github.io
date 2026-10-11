import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'

/** 未ログイン時に表示するログイン画面 */
export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      console.error('sign-in failed', err)
      const code = (err as { code?: string; status?: number } | null)?.code
      const status = (err as { status?: number } | null)?.status
      setError(
        code === 'invalid_credentials' || status === 400
          ? 'メールアドレスまたはパスワードが正しくありません'
          : 'ログインに失敗しました（通信を確認してください）',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="auth-gate">
      <form className="auth-box" onSubmit={onSubmit} noValidate>
        <div className="auth-logo">
          Workout<span>tracker</span>
        </div>
        <div className="auth-sub">ログインしてください</div>
        <div className="form-group">
          <input
            type="email"
            className="form-input"
            id="auth-email"
            placeholder="メールアドレス"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            id="auth-password"
            placeholder="パスワード"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div id="auth-error" className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn-primary" id="auth-login-btn" type="submit" disabled={busy}>
          ログイン
        </button>
      </form>
    </div>
  )
}
