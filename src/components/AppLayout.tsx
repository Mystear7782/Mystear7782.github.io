import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { useExercises } from '@/api/exercises'
import { useSessions } from '@/api/sessions'
import { BootOverlay } from './BootOverlay'
import { FooterNav } from './FooterNav'
import { SettingsIcon } from './icons'
import { Sidebar } from './Sidebar'
import { ToastHost } from './ToastHost'
import { TopProgress } from './TopProgress'

type RouteHandle = { title?: string }

/** ログイン後の共通レイアウト: ヘッダー（ハンバーガー+ページ名）・サイドバー・本体・フッターナビ */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const matches = useMatches()
  const content = useRef<HTMLDivElement>(null)

  const titled = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)
  const pageTitle = (titled?.handle as RouteHandle | undefined)?.title ?? ''

  // 画面を移動したら、本体を先頭までスクロールし直す（サイドバーは項目を選んだ時点で閉じる）
  useEffect(() => {
    content.current?.scrollTo({ top: 0 })
  }, [pathname])

  // 初回(キャッシュなし)のデータ取得中だけ、全画面の「読み込み中」を出す
  const exercises = useExercises()
  const sessions = useSessions()
  const booting = exercises.isPending || sessions.isPending

  return (
    <>
      <TopProgress />
      <BootOverlay show={booting} />
      <div
        id="overlay"
        className={sidebarOpen ? 'show' : ''}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div id="app">
        <div id="header">
          <button
            type="button"
            id="hamburger"
            className={sidebarOpen ? 'open' : ''}
            aria-label="設定・その他メニュー"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <SettingsIcon />
          </button>
          <div id="page-title">{pageTitle}</div>
        </div>
        <div id="content" ref={content}>
          <Outlet />
        </div>
        <FooterNav />
      </div>
      <ToastHost />
    </>
  )
}
