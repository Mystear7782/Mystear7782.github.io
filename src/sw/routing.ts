// Service Workerのキャッシュ方針（どのリクエストをどの戦略で扱うか）を決める純粋な関数。
// Service Worker本体(sw.ts)から使い、テストでも同じ判定を検証できるよう切り出している。
//
// 方針:
// - HTML(画面の読み込み)・JS・CSS は「ネットワーク優先」。応答が3秒以内に返ればそれを使い(最新の版が出る)、
//   遅い・つながらないときはキャッシュに切り替える（電波の弱いジムで起動が止まらないように）。
//   正常な応答(200)だけをキャッシュする。
// - Supabaseなど外部APIへの通信は一切キャッシュしない（ルートを登録せず、ブラウザの通常の通信に任せる）。
//   旧アプリでは、GETの応答が古いままキャッシュされ続ける不具合があった。
// - OAuth同意画面(oauth-consent.*)は、常にネットワークから取る（キャッシュしない）。
// - 外部のGoogleフォントだけは、再検証つきキャッシュ(stale-while-revalidate)。

export const NETWORK_TIMEOUT_SECONDS = 3

export const CACHE_NAMES = {
  /** 画面(HTML) */
  shell: 'app-shell',
  /** JS・CSS・アイコンなど、アプリ自身の静的ファイル */
  assets: 'app-assets',
  fonts: 'google-fonts',
} as const

const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

export type RouteKind = 'shell' | 'assets' | 'images' | 'fonts' | null

/** 同意画面のファイル（常にネットワークから取る） */
const isConsentPage = (pathname: string) => /\/oauth-consent\./.test(pathname)

/**
 * リクエストの扱いを決める。null は「Service Workerは何もせず、ブラウザの通常の通信に任せる」。
 * @param ownOrigin このアプリのオリジン（self.location.origin）
 */
export function classifyRequest(
  request: { mode: string; destination: string },
  url: URL,
  ownOrigin: string,
): RouteKind {
  if (FONT_ORIGINS.includes(url.origin)) return 'fonts'
  // 外部オリジン(Supabaseなど)は触らない
  if (url.origin !== ownOrigin) return null
  if (isConsentPage(url.pathname)) return null

  if (request.mode === 'navigate') return 'shell'
  if (['script', 'style', 'worker', 'manifest'].includes(request.destination)) return 'assets'
  if (request.destination === 'image') return 'images'
  return null
}

/**
 * キャッシュ済みのファイルのうち、今の版では使わない（古い版の）ハッシュ付きファイルのURLを返す。
 * ファイル名にハッシュが付くため、版が変わるたびに古いファイルがキャッシュにたまるのを防ぐ。
 * 対象は /assets/ 配下のファイルだけ（アイコンなどの固定名のファイルは消さない）。
 */
export function staleAssetUrls(cachedUrls: string[], currentUrls: string[]): string[] {
  const keep = new Set(currentUrls)
  return cachedUrls.filter((u) => new URL(u).pathname.includes('/assets/') && !keep.has(u))
}
