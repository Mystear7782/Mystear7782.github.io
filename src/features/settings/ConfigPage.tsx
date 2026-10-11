import { useAuth } from '@/features/auth/AuthProvider'
import { LoadingButton, Page, SectionHead } from '@/components/ui'
import { reportError } from '@/lib/errors'
import { useState } from 'react'

/** 設定: ログイン中のアカウントの表示とログアウト */
export function ConfigPage() {
  const { session, signOut } = useAuth()
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await signOut()
    } catch (e) {
      reportError(e, 'ログアウトに失敗しました（通信を確認してください）')
      setBusy(false)
    }
  }

  return (
    <Page id="config">
      <SectionHead title="設定" sub="アカウントの確認とログアウト" />
      <div className="card">
        <div className="card-label">ログイン中のアカウント</div>
        <div id="config-account" style={{ fontSize: 14, marginBottom: 14, wordBreak: 'break-all' }}>
          {session?.user.email ?? '—'}
        </div>
        <LoadingButton
          id="logout-btn"
          loading={busy}
          loadingLabel="ログアウト中..."
          onClick={logout}
        >
          ログアウト
        </LoadingButton>
      </div>
    </Page>
  )
}
