import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type Item = { path: string; icon: ReactNode; label: string; match: (pathname: string) => boolean }

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'メニュー管理',
    items: [
      { path: '/menus/new', icon: '＋', label: 'メニューの追加', match: (p) => p === '/menus/new' },
    ],
  },
  {
    title: '分析・データ',
    items: [
      {
        path: '/analysis',
        icon: '📊',
        label: 'メニュー分析',
        match: (p) => p.startsWith('/analysis'),
      },
      { path: '/rm', icon: '🔢', label: 'RM換算表', match: (p) => p === '/rm' },
      { path: '/csv', icon: '📥', label: 'CSV出力 / 入力', match: (p) => p === '/csv' },
    ],
  },
  {
    title: '体重・食事記録',
    items: [{ path: '/meal', icon: '🍽️', label: '食事記録', match: (p) => p === '/meal' }],
  },
  {
    title: 'その他',
    items: [{ path: '/config', icon: '⚙️', label: '設定', match: (p) => p === '/config' }],
  },
]

/** 左上の設定アイコンから開くサイドバー（メニュー管理・分析・設定など） */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <div id="sidebar" className={open ? 'show' : ''}>
      <div className="sb-head">
        <div className="sb-logo">
          Workout<span>tracker</span>
        </div>
        <div className="sb-tagline">WORKOUT TRACKER</div>
      </div>
      <nav className="sb-nav">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="sb-sec">{section.title}</div>
            {section.items.map((item) => (
              <div
                key={item.path}
                role="link"
                className={`sb-item${item.match(pathname) ? ' active' : ''}`}
                onClick={() => {
                  navigate(item.path)
                  onClose()
                }}
              >
                <span className="sb-icon">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        ))}
      </nav>
    </div>
  )
}
