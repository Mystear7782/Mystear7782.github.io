import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useMemo } from 'react'
import { RouterProvider } from 'react-router-dom'
import { CACHE_BUSTER, CACHE_MAX_AGE, persister, queryClient } from '@/app/queryClient'
import { createAppRouter } from '@/app/routes'
import { BootOverlay } from '@/components/BootOverlay'
import { UpdateBanner } from '@/components/UpdateBanner'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { LegacyMenuSetMigration } from '@/features/menu-sets/LegacyMenuSetMigration'

/** ログイン状態に応じて、ログイン画面かアプリ本体を出す */
function Root() {
  const { loading, session } = useAuth()
  const router = useMemo(() => createAppRouter(), [])

  if (loading) return <BootOverlay show />
  if (!session) return <LoginPage />
  return (
    <>
      <RouterProvider router={router} />
      <LegacyMenuSetMigration />
    </>
  )
}

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
      // 保存済みのキャッシュを復元したら、まず画面に出し(オフラインでも見られる)、
      // すべて「古い」扱いにして最新のデータを取り直す。MCP(Claude)で書いた記録が起動時に反映される。
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <AuthProvider>
        <Root />
        <UpdateBanner />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
