// TC-PWA系: Service Worker・オフライン閲覧・CSP・キャッシュ方針（本番ビルドのプレビューに対して実行）
import { expect, test } from './fixtures'

test.describe('TC-PWA', () => {
  test('TC-PWA-01: Service Worker が登録・有効化され、sw.js という名前で配信される', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    const scriptUrl = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.scriptURL ?? null
    })
    expect(scriptUrl).toMatch(/\/sw\.js$/)
  })

  test('TC-PWA-02: sw.js はネットワーク優先の方針で、旧キャッシュ(gymlog-*)を削除し、同意画面をプリキャッシュしない', async ({
    request,
  }) => {
    const sw = await (await request.get('/sw.js')).text()
    expect(sw).toContain('app-shell')
    expect(sw).toContain('gymlog-')
    // プリキャッシュ対象に同意画面のファイルは含まれない（除外の判定にだけ名前が出る）
    expect(sw).not.toMatch(/["']oauth-consent\.(html|js|css)["']/)
    // 旧版の方式(importScriptsで別ファイルを読む)ではなくなっている
    expect(sw).not.toContain('legacy-cache-cleanup.js')
  })

  test('TC-PWA-03: Supabaseへの通信はService Workerにキャッシュされない', async ({ page, db }) => {
    await db.menu({ category: '胸', name: 'ベンチプレス' })
    await page.goto('/#/menus')
    await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス'])
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = []
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url)
      }
      return urls
    })
    expect(cachedUrls.some((u) => u.includes('/rest/v1/') || u.includes('/auth/v1/'))).toBe(false)
    expect(cachedUrls.some((u) => u.includes('oauth-consent'))).toBe(false)
  })

  test('TC-PWA-04: オフラインで再読み込みしても、アプリが起動し、過去の記録を閲覧できる', async ({
    page,
    context,
    db,
  }) => {
    const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await db.session(menuId, '2026-10-01', [[80, 10]])
    await page.goto('/#/menus')
    await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス'])
    await page.locator('.menu-row').first().click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(1)
    // Service Workerが有効になり、キャッシュ(IndexedDB)の永続化が済むまで待つ
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
    await page.waitForTimeout(2000)

    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    await expect(page.locator('.detail-name')).toHaveText('ベンチプレス')
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(1) // 過去の記録が見える
    await expect(page.locator('#auth-gate')).toHaveCount(0) // オフラインでもログイン画面にならない

    // オフライン中の書き込みは失敗し、エラーを知らせる
    await page.getByRole('button', { name: 'メニューの追加' }).count()
    await page.locator('button.btn-action.new-sess').click()
    await page.locator('#inp-w').fill('90')
    await page.locator('#inp-r').fill('5')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('#toast')).toContainText('保存に失敗しました')
    await context.setOffline(false)
  })

  test('TC-PWA-08: ネットワークの応答が3秒を超えて遅いときは、キャッシュ済みの画面とファイルで起動する', async ({
    page,
    context,
    db,
  }) => {
    const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await db.session(menuId, '2026-10-01', [[80, 10]])
    await page.goto('/#/menus')
    await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス'])
    // Service Workerが有効になり、画面とファイルがキャッシュされるまで待つ
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const shell = await caches.open('app-shell')
          const assets = await caches.open('app-assets')
          return (await shell.keys()).length > 0 && (await assets.keys()).length > 0
        }),
      )
      .toBe(true)

    // アプリ自身のファイル(HTML/JS/CSS)の応答を10秒遅らせる。Supabaseへの通信は遅らせない
    const own = new URL(page.url()).origin
    let delayed = 0
    await context.route(
      (url) => url.origin === own,
      async (route) => {
        delayed++
        await new Promise((r) => setTimeout(r, 10_000))
        await route.continue().catch(() => undefined)
      },
    )
    const started = Date.now()
    await page.reload()
    await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス'])
    const elapsed = Date.now() - started
    // 3秒で見切ってキャッシュに切り替えるので、10秒の遅延を待たずに起動できる
    expect(delayed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(9_000)
    await context.unroute((url) => url.origin === own)
  })

  test('TC-PWA-05: 本番ビルドのCSPは script-src に unsafe-inline を含まず、違反なしで動作する', async ({
    page,
    db,
  }) => {
    const csp = await (await page.request.get('/')).text()
    const m = csp.match(/Content-Security-Policy" content="([^"]+)"/)
    expect(m).not.toBeNull()
    const policy = m![1]
    expect(policy).toMatch(/script-src 'self'(;|$)/)
    expect(policy).not.toContain("'unsafe-inline'")
    expect(policy).not.toContain("'unsafe-eval'")

    const violations: string[] = []
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text())
    })
    const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await db.session(menuId, '2026-10-01', [[80, 10]])
    // 主要な画面を一通り開く（グラフ・モーダル・並び替えを含む）
    for (const path of [
      '/',
      '/menus',
      `/menus/${menuId}`,
      '/analysis',
      `/analysis/${menuId}`,
      '/weight',
      '/meal',
      '/rm',
      '/csv',
      '/menu-sets',
      '/config',
    ]) {
      await page.goto(`/#${path}`)
      await expect(page.locator('#page-title')).not.toHaveText('')
    }
    expect(violations).toEqual([])
  })

  test('TC-PWA-06: マニフェストが sw.js と同じオリジンで配信され、アイコンが定義されている', async ({
    request,
  }) => {
    const res = await request.get('/manifest.json')
    expect(res.ok()).toBe(true)
    const manifest = await res.json()
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
  })

  test('TC-PWA-07: OAuth同意画面は Service Worker を通らず、常にネットワークから取得される', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
    const res = await request.get('/oauth-consent.html')
    expect(res.ok()).toBe(true)
    expect(await res.text()).toContain('oauth-consent.js')
    // SW配下のページとして開いても、アプリ(SPA)のindex.htmlに置き換わらない
    await page.goto('/oauth-consent.html')
    await expect(
      page.locator('#oc-error, #oc-login, #oc-consent, #oc-loading').first(),
    ).toBeAttached()
    expect(await page.title()).toContain('連携の許可')
  })
})
