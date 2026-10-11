/** アプリを開いた直後、初回のデータ取得中に全画面で出す「読み込み中」 */
export function BootOverlay({ show }: { show: boolean }) {
  return (
    <div id="boot-overlay" className={show ? 'show' : ''} role="status" aria-hidden={!show}>
      <div className="boot-card">
        <div className="spinner" />
        <div className="boot-card-label">読み込み中...</div>
      </div>
    </div>
  )
}
