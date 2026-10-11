import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BodyTabIcon, HomeTabIcon, RecordTabIcon, SetTabIcon } from './icons'

type Tab = {
  key: string
  path: string
  label: string
  icon: ReactNode
  match: (pathname: string) => boolean
}

const TABS: Tab[] = [
  { key: 'dashboard', path: '/', label: 'ホーム', icon: <HomeTabIcon />, match: (p) => p === '/' },
  {
    key: 'record',
    path: '/menus',
    label: '記録',
    icon: <RecordTabIcon />,
    match: (p) => p.startsWith('/menus'),
  },
  {
    key: 'menuset',
    path: '/menu-sets',
    label: 'セット',
    icon: <SetTabIcon />,
    match: (p) => p.startsWith('/menu-sets'),
  },
  {
    key: 'body',
    path: '/weight',
    label: 'ボディ',
    icon: <BodyTabIcon />,
    match: (p) => p === '/weight' || p === '/meal',
  },
]

/**
 * 下部のタブナビ。メニュー分析・RM換算表・CSV・設定は左上のサイドバー経由なので、
 * どのタブも点灯しない。
 */
export function FooterNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <div id="footer-nav">
      {TABS.map((t) => (
        <div
          key={t.key}
          role="link"
          data-tab={t.key}
          className={`fn-item${t.match(pathname) ? ' active' : ''}`}
          onClick={() => navigate(t.path)}
        >
          <div className="fn-icon-wrap">{t.icon}</div>
          <div className="fn-label">{t.label}</div>
        </div>
      ))}
    </div>
  )
}
