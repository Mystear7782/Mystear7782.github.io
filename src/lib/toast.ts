// トースト通知。Reactの外（API層・ユーティリティ）からも呼べるよう、小さなイベントバスにしている。
// 表示は components/ToastHost.tsx が購読して行う。
type Listener = (message: string) => void
const listeners = new Set<Listener>()

export function toast(message: string): void {
  for (const fn of listeners) fn(message)
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
