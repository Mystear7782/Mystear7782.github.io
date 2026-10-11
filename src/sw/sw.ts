/// <reference lib="webworker" />
// Workout tracker の Service Worker（vite-plugin-pwa の injectManifest で、ビルド時に sw.js として出力される）。
// キャッシュ方針の詳細は routing.ts を参照。
import { clientsClaim } from 'workbox-core'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { deleteLegacyCaches } from './legacyCaches'
import { CACHE_NAMES, NETWORK_TIMEOUT_SECONDS, classifyRequest, staleAssetUrls } from './routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[]
}

// ビルド時に、今の版のファイル一覧が差し込まれる（この指定は1か所だけにする必要がある）
const MANIFEST = self.__WB_MANIFEST

const okOnly = new CacheableResponsePlugin({ statuses: [200] })
// 配信元が `Vary: Origin` を返すと、crossorigin属性付きのスクリプト/CSS(Originヘッダー付きのリクエスト)が
// インストール時に入れたキャッシュ(Originなし)に一致せず、オフラインで読み込めなくなる。Varyは見ない。
const matchOptions = { ignoreVary: true }

// ===== ルーティング =====
registerRoute(
  ({ request, url }) => classifyRequest(request, url, self.location.origin) === 'shell',
  new NetworkFirst({
    cacheName: CACHE_NAMES.shell,
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    matchOptions,
    plugins: [okOnly],
  }),
)
registerRoute(
  ({ request, url }) => classifyRequest(request, url, self.location.origin) === 'assets',
  new NetworkFirst({
    cacheName: CACHE_NAMES.assets,
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    matchOptions,
    plugins: [okOnly],
  }),
)
registerRoute(
  ({ request, url }) => classifyRequest(request, url, self.location.origin) === 'images',
  new StaleWhileRevalidate({ cacheName: CACHE_NAMES.assets, matchOptions, plugins: [okOnly] }),
)
registerRoute(
  ({ request, url }) => classifyRequest(request, url, self.location.origin) === 'fonts',
  new StaleWhileRevalidate({ cacheName: CACHE_NAMES.fonts, plugins: [okOnly] }),
)

// ===== インストール: 今の版の画面・静的ファイルをあらかじめキャッシュする =====
// ネットワーク優先の方針でも、初回の訪問のあとすぐにオフラインになった場合に備える
// （初回の読み込みはService Workerの有効化より前なので、実行時キャッシュには入らない）。
async function warmUp(): Promise<void> {
  const shell = await caches.open(CACHE_NAMES.shell)
  const assets = await caches.open(CACHE_NAMES.assets)
  const scope = self.registration.scope

  const put = async (cache: Cache, url: string) => {
    const req = new Request(new URL(url, scope).href, { cache: 'reload' })
    const res = await fetch(req)
    if (res.ok) await cache.put(req, res)
  }

  const jobs: Promise<void>[] = [put(shell, './'), put(shell, './index.html')]
  for (const entry of MANIFEST) {
    if (entry.url === 'index.html') continue // 上で入れ済み
    jobs.push(put(assets, entry.url))
  }
  // 1つ失敗してもインストール全体は失敗させない（次回の通信時に実行時キャッシュへ入る）
  await Promise.allSettled(jobs)
}

self.addEventListener('install', (event) => {
  event.waitUntil(warmUp())
})

// 古い版のハッシュ付きファイルをキャッシュから消す
async function pruneStaleAssets(): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.assets)
  const current = MANIFEST.map((e) => new URL(e.url, self.registration.scope).href)
  const cached = (await cache.keys()).map((r) => r.url)
  await Promise.all(staleAssetUrls(cached, current).map((u) => cache.delete(u)))
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([deleteLegacyCaches(caches), pruneStaleAssets()]))
})

// 新しい版への切り替えは、ユーザーが画面の「更新」を押したとき（UpdateBanner）に行う
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()
