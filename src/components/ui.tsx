// 共通のUI部品。旧アプリのCSSクラス/IDをそのまま使い、見た目を変えない。
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from './icons'

/** ページ全体の枠。旧アプリの `page active` と `page-<名前>` のIDを引き継ぐ */
export function Page({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="page active" id={`page-${id}`}>
      {children}
    </div>
  )
}

export function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="sec-head">
      <div className="sec-title">{title}</div>
      {sub && <div className="sec-sub">{sub}</div>}
    </div>
  )
}

export function BackButton({
  to,
  label,
  id,
  labelId,
}: {
  /** 戻り先のパス */
  to: string
  label: string
  id?: string
  /** ラベル(span)のid（旧アプリ・E2Eテストとの互換） */
  labelId?: string
}) {
  const navigate = useNavigate()
  return (
    <button type="button" className="back-btn" id={id} onClick={() => navigate(to)}>
      <BackIcon />
      <span id={labelId}>{label}</span>
    </button>
  )
}

export function EmptyState({
  icon,
  title,
  desc,
  compact,
}: {
  icon?: string
  title: string
  desc?: ReactNode
  compact?: boolean
}) {
  return (
    <div className="empty-state" style={compact ? { padding: '32px 16px' } : undefined}>
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
    </div>
  )
}

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  /** ローディング中に表示する文言（省略時は元の文言のまま） */
  loadingLabel?: string
}

/** 通信中にスピナーを出して押せなくするボタン */
export function LoadingButton({
  loading,
  loadingLabel,
  children,
  className = 'btn-primary',
  disabled,
  ...rest
}: LoadingButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`${className}${loading ? ' is-loading' : ''}`}
      disabled={disabled || loading}
    >
      {loading && <div className="spinner" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

/** モーダル。背景クリックで閉じる。旧アプリのID付きスタイル(#edit-menu-modal等)を使う */
export function Modal({
  id,
  title,
  onClose,
  children,
}: {
  id: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      id={id}
      className="show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

/** 初回取得中・取得失敗のときの表示。取得済み(キャッシュ含む)ならそのまま子を描画する */
export function QueryBoundary({
  isPending,
  isError,
  onRetry,
  children,
}: {
  isPending: boolean
  isError: boolean
  onRetry?: () => void
  children: ReactNode
}) {
  if (isPending) return <EmptyState title="読み込み中..." />
  if (isError)
    return (
      <EmptyState
        icon="⚠️"
        title="データを取得できませんでした"
        desc={
          onRetry ? (
            <button type="button" className="btn-mini" onClick={onRetry}>
              再読み込み
            </button>
          ) : (
            '通信を確認してください'
          )
        }
      />
    )
  return <>{children}</>
}
