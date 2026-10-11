import { deleteLegacyCaches } from './legacyCaches'
import { CACHE_NAMES, NETWORK_TIMEOUT_SECONDS, classifyRequest, staleAssetUrls } from './routing'

const OWN = 'https://mystear7782.github.io'
const req = (mode: string, destination: string) => ({ mode, destination })
const u = (s: string) => new URL(s, OWN)

describe('classifyRequest（Service Workerのキャッシュ方針）', () => {
  it('画面の読み込み(navigate)は shell（ネットワーク優先）', () => {
    expect(classifyRequest(req('navigate', 'document'), u('/'), OWN)).toBe('shell')
    expect(classifyRequest(req('navigate', 'document'), u('/index.html'), OWN)).toBe('shell')
  })

  it('自分のJS・CSS・manifest は assets（ネットワーク優先）', () => {
    expect(classifyRequest(req('cors', 'script'), u('/assets/index-abc.js'), OWN)).toBe('assets')
    expect(classifyRequest(req('no-cors', 'style'), u('/assets/index-abc.css'), OWN)).toBe('assets')
    expect(classifyRequest(req('cors', 'manifest'), u('/manifest.json'), OWN)).toBe('assets')
  })

  it('アイコン画像は images', () => {
    expect(classifyRequest(req('no-cors', 'image'), u('/icon-192.png'), OWN)).toBe('images')
  })

  it('Supabaseなど外部APIへの通信は、Service Workerは一切扱わない（キャッシュしない）', () => {
    const supabase = new URL('https://swncmbsamxoyjeojwbyc.supabase.co/rest/v1/exercises?select=*')
    expect(classifyRequest(req('cors', ''), supabase, OWN)).toBeNull()
    expect(classifyRequest(req('cors', 'script'), supabase, OWN)).toBeNull()
    expect(
      classifyRequest(
        req('cors', ''),
        new URL('https://swncmbsamxoyjeojwbyc.supabase.co/auth/v1/token'),
        OWN,
      ),
    ).toBeNull()
  })

  it('Googleフォントは fonts', () => {
    expect(
      classifyRequest(
        req('cors', 'style'),
        new URL('https://fonts.googleapis.com/css2?family=Noto+Sans+JP'),
        OWN,
      ),
    ).toBe('fonts')
    expect(
      classifyRequest(
        req('cors', 'font'),
        new URL('https://fonts.gstatic.com/s/notosansjp/x.woff2'),
        OWN,
      ),
    ).toBe('fonts')
  })

  it('OAuth同意画面(oauth-consent.*)は、画面・JS・CSSとも扱わない（常にネットワーク）', () => {
    expect(
      classifyRequest(
        req('navigate', 'document'),
        u('/oauth-consent.html?authorization_id=x'),
        OWN,
      ),
    ).toBeNull()
    expect(classifyRequest(req('no-cors', 'script'), u('/oauth-consent.js'), OWN)).toBeNull()
    expect(classifyRequest(req('no-cors', 'style'), u('/oauth-consent.css'), OWN)).toBeNull()
  })

  it('それ以外（fetch/XHR 等）は扱わない', () => {
    expect(classifyRequest(req('cors', ''), u('/api/anything'), OWN)).toBeNull()
  })

  it('ネットワークの待ち時間は3秒', () => {
    expect(NETWORK_TIMEOUT_SECONDS).toBe(3)
    expect(Object.values(CACHE_NAMES)).toEqual(['app-shell', 'app-assets', 'google-fonts'])
  })
})

describe('deleteLegacyCaches（旧アプリのキャッシュ gymlog-* の削除）', () => {
  function fakeCaches(names: string[]) {
    const deleted: string[] = []
    return {
      deleted,
      keys: async () => names,
      delete: async (n: string) => {
        deleted.push(n)
        return true
      },
    }
  }

  it('gymlog- で始まるキャッシュだけを削除する', async () => {
    const c = fakeCaches(['gymlog-v4', 'gymlog-v6', 'app-shell', 'app-assets', 'google-fonts'])
    expect(await deleteLegacyCaches(c)).toEqual(['gymlog-v4', 'gymlog-v6'])
    expect(c.deleted.sort()).toEqual(['gymlog-v4', 'gymlog-v6'])
  })

  it('対象が無ければ何も削除しない', async () => {
    const c = fakeCaches(['app-shell'])
    expect(await deleteLegacyCaches(c)).toEqual([])
    expect(c.deleted).toEqual([])
  })
})

describe('staleAssetUrls（古い版のハッシュ付きファイルの掃除）', () => {
  const base = 'https://mystear7782.github.io'
  it('今の版に無い /assets/ 配下のファイルだけを返す', () => {
    const cached = [
      `${base}/assets/index-OLD.js`,
      `${base}/assets/index-NEW.js`,
      `${base}/assets/index-OLD.css`,
      `${base}/icon-192.png`,
      `${base}/manifest.json`,
    ]
    const current = [`${base}/assets/index-NEW.js`, `${base}/icon-192.png`]
    expect(staleAssetUrls(cached, current)).toEqual([
      `${base}/assets/index-OLD.js`,
      `${base}/assets/index-OLD.css`,
    ])
  })
  it('すべて今の版なら空', () => {
    const urls = [`${base}/assets/a.js`]
    expect(staleAssetUrls(urls, urls)).toEqual([])
  })
})
