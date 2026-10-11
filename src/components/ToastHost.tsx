import { useEffect, useRef, useState } from 'react'
import { subscribeToast } from '@/lib/toast'

/** トースト表示。lib/toast の toast() を購読して、2.2秒間メッセージを出す */
export function ToastHost() {
  const [message, setMessage] = useState('')
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () =>
      subscribeToast((msg) => {
        setMessage(msg)
        setShow(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setShow(false), 2200)
      }),
    [],
  )

  return (
    <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">
      {message}
    </div>
  )
}
