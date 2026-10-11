import { useQueryClient } from '@tanstack/react-query'
import { useState, type ChangeEvent } from 'react'
import { useExercises } from '@/api/exercises'
import { queryKeys } from '@/api/keys'
import { fetchExercises } from '@/api/exercises'
import { fetchSessions, useSessions } from '@/api/sessions'
import { DownloadIcon, FileIcon, InfoIcon, UploadIcon } from '@/components/icons'
import { Page, SectionHead } from '@/components/ui'
import { CARDIO_HEADER, STRENGTH_HEADER } from '@/lib/csv'
import { reportError } from '@/lib/errors'
import { CsvFormatError, importCsvText, summaryMessage } from './importCsv'
import { exportAllCsv } from './exportCsv'

type Result = { kind: 'ok' | 'err'; message: string } | null

/** CSV出力 / 入力: 筋トレ・有酸素のエクスポートと、CSVファイルのインポート */
export function CsvPage() {
  const qc = useQueryClient()
  const exercises = useExercises()
  const sessions = useSessions()
  const [result, setResult] = useState<Result>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const text = await file.text()
      // 重複判定とメニュー照合のため、取り込み直前の最新のデータをサーバーから取得する
      const [latestMenus, latestSessions] = await Promise.all([fetchExercises(), fetchSessions()])
      const summary = await importCsvText(text, latestMenus, latestSessions)
      setResult({ kind: summary.errors ? 'err' : 'ok', message: summaryMessage(summary) })
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.exercises }),
        qc.invalidateQueries({ queryKey: queryKeys.sessions }),
      ])
    } catch (err) {
      if (err instanceof CsvFormatError) {
        setResult({ kind: 'err', message: err.message })
      } else {
        reportError(err, 'CSVの読み込みに失敗しました')
        setResult({ kind: 'err', message: 'CSVの読み込みに失敗しました' })
      }
    } finally {
      setBusy(false)
      input.value = '' // 同じファイルをもう一度選べるようにする
    }
  }

  const menus = exercises.data ?? []
  const all = sessions.data ?? []

  return (
    <Page id="csv">
      <SectionHead title="CSV出力 / 入力" sub="データのエクスポートとインポートができます" />

      <div className="csv-section">
        <div className="csv-section-title">
          <DownloadIcon />
          エクスポート
        </div>
        <button
          type="button"
          className="csv-btn"
          onClick={() => exportAllCsv('strength', menus, all)}
        >
          <FileIcon />
          <div className="csv-btn-body">
            <div className="csv-btn-label">筋トレ記録をエクスポート</div>
            <div className="csv-btn-sub">胸・背中・肩・足・腕のメニュー全件</div>
          </div>
        </button>
        <button
          type="button"
          className="csv-btn"
          onClick={() => exportAllCsv('cardio', menus, all)}
        >
          <FileIcon />
          <div className="csv-btn-body">
            <div className="csv-btn-label">有酸素運動記録をエクスポート</div>
            <div className="csv-btn-sub">有酸素運動のメニュー全件</div>
          </div>
        </button>
      </div>

      <div className="csv-section">
        <div className="csv-section-title">
          <UploadIcon />
          インポート
        </div>
        <div className="csv-notice">
          ⚠️ インポートの仕様
          <br />
          ・既存セッションと重複する場合はスキップします（上書きなし・INSERT方式）
          <br />
          ・CSVに記載されているメニュー名がアプリ未登録の場合、自動で新規登録します
          <br />
          ・session_idは空欄でもOK。空欄の場合は同日同メニューを同一セッションにまとめます
          <br />
          ・インポート前にエクスポートでバックアップを取ることを推奨します
        </div>
        <label
          className="import-file-btn"
          style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          <UploadIcon width={18} height={18} />
          {busy ? 'インポート中...' : 'CSVファイルを選択してインポート'}
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onFile}
            disabled={busy}
          />
        </label>
        <div
          id="import-result"
          className={result ? `csv-import-result ${result.kind}` : undefined}
          style={{ whiteSpace: 'pre-line' }}
        >
          {result?.message}
        </div>
      </div>

      <div className="csv-section">
        <div className="csv-section-title">
          <InfoIcon />
          CSVフォーマット
        </div>
        <div className="csv-format-block">
          <div className="csv-format-title">筋トレ用（エクスポート列）</div>
          <div className="csv-format-code">{STRENGTH_HEADER.split(',').join(', ')}</div>
        </div>
        <div className="csv-format-block">
          <div className="csv-format-title">有酸素運動用（エクスポート列）</div>
          <div className="csv-format-code">{CARDIO_HEADER.split(',').join(', ')}</div>
        </div>
        <div className="csv-format-block">
          <div className="csv-format-title">session_timeについて</div>
          <div className="csv-format-code">
            セッションの記録時刻(HH:MM)。旧バージョンのCSV（この列がないもの）をインポートした場合は00:00として扱われます。
          </div>
        </div>
        <div className="csv-format-block">
          <div className="csv-format-title">手入力インポート時のsession_idの扱い</div>
          <div className="csv-format-code">
            session_idは空欄でOK。空欄の場合、同じ日付・同じメニューの行は自動的に1セッションにまとめられます。
          </div>
        </div>
      </div>
    </Page>
  )
}
