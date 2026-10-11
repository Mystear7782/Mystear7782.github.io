import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * ヘッダー下の細い進捗バー。通信中に表示する。
 * 瞬時に終わる通信でちらつかないよう、150ms以上続いたときだけ表示する（非表示は即時）。
 */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0
  const [show, setShow] = useState(false)

  useEffect(() => {
    // 通信が始まって150ms経ってから表示する。終わったらすぐ(次のタイマーで)消す
    const t = setTimeout(() => setShow(busy), busy ? 150 : 0)
    return () => clearTimeout(t)
  }, [busy])

  return (
    <div id="top-progress" className={show ? 'show' : ''} aria-hidden="true">
      <div className="bar" />
    </div>
  )
}
