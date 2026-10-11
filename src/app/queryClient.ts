// TanStack Query の設定とキャッシュの永続化。
//
// - 画面に戻ったとき(refetchOnWindowFocus)に再取得するので、MCP(Claude)で書いた記録が反映される。
// - 閲覧データは IndexedDB に永続化し、オフラインでも過去の記録を見られるようにする。
//   書き込みは常にサーバーの応答を待つ（オフラインの書き込みキューは持たない）。
// - 取得・書き込みの失敗は共通のエラー処理(lib/errors)に集約する。
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'
import { reportError } from '@/lib/errors'

const ONE_DAY = 1000 * 60 * 60 * 24

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 表示できるキャッシュがあるときの背景再取得の失敗(オフライン等)では通知しない
      if (query.state.data === undefined) {
        reportError(error, 'データの取得に失敗しました（通信を確認してください）')
      } else {
        console.warn('background refetch failed', query.queryKey, error)
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // 永続化したキャッシュを最大7日間使うので、メモリ上でも同じ期間は破棄しない
      gcTime: 7 * ONE_DAY,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const CACHE_MAX_AGE = 7 * ONE_DAY
/** データ構造を変えたら上げる。古い形式のキャッシュを読み込まないようにする */
export const CACHE_BUSTER = 'v1'

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'workout-tracker-query-cache',
  throttleTime: 1000,
})

/** ログアウト・ユーザー切り替え時に、メモリとIndexedDBの両方のキャッシュを消す */
export async function clearCache(): Promise<void> {
  queryClient.clear()
  await persister.removeClient()
}
