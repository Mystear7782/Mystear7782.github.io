// 旧アプリ（素のJS版）のService Workerが作った Cache Storage（名前が gymlog- で始まる）を削除する。
// 新しいService Workerの activate のたびに呼ばれる。新しいキャッシュ（app-shell, app-assets, google-fonts）には触れない。

export const LEGACY_CACHE_PREFIX = 'gymlog-'

export async function deleteLegacyCaches(
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>,
): Promise<string[]> {
  const names = (await cacheStorage.keys()).filter((k) => k.startsWith(LEGACY_CACHE_PREFIX))
  await Promise.all(names.map((k) => cacheStorage.delete(k)))
  return names
}
