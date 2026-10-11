import { useState } from 'react'
import { useUpdateSessionDateTime } from '@/api/sessions'
import type { Exercise, SessionData } from '@/types/domain'

export type SessionDraft = { date: string; time: string }

/** 筋トレ・有酸素フォームに共通で渡す props */
export type SessionFormProps = {
  menu: Exercise
  /** 保存済みのセッション。新規(未保存)なら undefined */
  session: SessionData | undefined
  draft: SessionDraft
  onDraftChange: (d: SessionDraft) => void
  /** セッションがサーバーに作られた（最初の保存）とき、そのセッションのid */
  onSaved: (sessionId: string) => void
  /** 保存が完了したとき（有酸素の保存後にメニュー詳細へ戻る判断に使う） */
  onFinished: () => void
}

/** 画面上部の「📋 メニュー名 · 時刻」バー */
export function SessionBar({ menu, time }: { menu: Exercise; time: string }) {
  return (
    <div className="set-session-bar">
      📋 <strong>{menu.name}</strong>
      {time && time !== '00:00' && (
        <span style={{ fontSize: 11, color: 'var(--nav-text)' }}>· {time}</span>
      )}
    </div>
  )
}

/**
 * 記録日・時刻の入力。保存済みセッションなら変更のたびにサーバーへ反映する。
 * 新規(未保存)セッションでは、ローカルの下書きを変えるだけ（最初の保存時にその値が使われる）。
 */
export function DateTimeRow({
  session,
  draft,
  onDraftChange,
}: Pick<SessionFormProps, 'session' | 'draft' | 'onDraftChange'>) {
  const updateDateTime = useUpdateSessionDateTime()
  // 保存中の値（保存済みセッション用）。応答が返るまで入力欄に出し続け、終わったらサーバーのデータに戻す。
  // 失敗したときはサーバーのデータ(=元の値)に戻る。通知はmutation側のonErrorで出している。
  const [pending, setPending] = useState<SessionDraft | null>(null)
  const value: SessionDraft = session
    ? (pending ?? { date: session.date, time: session.time })
    : draft

  function change(next: SessionDraft) {
    if (!session) {
      onDraftChange(next)
      return
    }
    setPending(next)
    updateDateTime.mutate(
      { sessionId: session.id, date: next.date || session.date, time: next.time || '00:00' },
      { onSettled: () => setPending(null) },
    )
  }

  return (
    <div className="date-row">
      <label htmlFor="sess-date">記録日</label>
      <input
        type="date"
        className="date-input"
        id="sess-date"
        value={value.date}
        onChange={(e) => change({ ...value, date: e.target.value })}
      />
      <input
        type="time"
        className="date-input time-input"
        id="sess-time"
        value={value.time}
        onChange={(e) => change({ ...value, time: e.target.value })}
      />
    </div>
  )
}
