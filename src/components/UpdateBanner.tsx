import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * 新しい版のService Workerが見つかったときに出すバナー。
 * ユーザーが「更新」を押したときに新しい版へ切り替えてリロードする（入力中の突然のリロードを避ける）。
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.error('service worker registration failed', e),
  })

  if (!needRefresh) return null
  return (
    <div className="update-banner" role="alert">
      <span>新しいバージョンがあります</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        更新
      </button>
    </div>
  )
}
