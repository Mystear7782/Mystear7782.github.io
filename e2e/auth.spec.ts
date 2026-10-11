// TC-AUTH系: ログイン・ログアウト・セッション維持・ユーザー切り替え
import { createTestUser } from './support/supabase'
import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'

/** ログイン済みセッションを仕込まない、まっさらなページ */
async function anonymousPage(browser: import('@playwright/test').Browser, baseURL: string) {
  const ctx = await browser.newContext({ baseURL })
  return { page: await ctx.newPage(), ctx }
}

async function login(page: Page, email: string, password: string) {
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.locator('#auth-login-btn').click()
}

test.describe('TC-AUTH: ログイン', () => {
  test('TC-AUTH-01: 未ログインではログイン画面だけが表示され、アプリ本体は出ない', async ({
    browser,
    baseURL,
  }) => {
    const { page, ctx } = await anonymousPage(browser, baseURL!)
    await page.goto('/')
    await expect(page.locator('#auth-gate')).toBeVisible()
    await expect(page.locator('#app')).toHaveCount(0)
    await ctx.close()
  })

  test('TC-AUTH-02: 正しいメールアドレスとパスワードでログインできる', async ({
    browser,
    baseURL,
  }) => {
    const user = await createTestUser()
    const { page, ctx } = await anonymousPage(browser, baseURL!)
    await page.goto('/')
    await login(page, user.email, user.password)
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    await expect(page.locator('#auth-gate')).toHaveCount(0)
    await ctx.close()
  })

  test('TC-AUTH-03: パスワードが違うとエラーが表示され、ログイン画面にとどまる（詳細はUIに出さない）', async ({
    browser,
    baseURL,
  }) => {
    const user = await createTestUser()
    const { page, ctx } = await anonymousPage(browser, baseURL!)
    await page.goto('/')
    await login(page, user.email, 'wrong-password')
    await expect(page.locator('#auth-error')).toHaveText(
      'メールアドレスまたはパスワードが正しくありません',
    )
    await expect(page.locator('#auth-gate')).toBeVisible()
    await ctx.close()
  })

  test('TC-AUTH-04: 未入力でログインするとエラー', async ({ browser, baseURL }) => {
    const { page, ctx } = await anonymousPage(browser, baseURL!)
    await page.goto('/')
    await page.locator('#auth-login-btn').click()
    await expect(page.locator('#auth-error')).toContainText('入力してください')
    await ctx.close()
  })

  test('TC-AUTH-05: ログイン状態は再読み込みしても維持される', async ({ browser, baseURL }) => {
    const user = await createTestUser()
    const { page, ctx } = await anonymousPage(browser, baseURL!)
    await page.goto('/')
    await login(page, user.email, user.password)
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    await page.reload()
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    await ctx.close()
  })
})

test.describe('TC-AUTH: ログアウト・ユーザー切り替え', () => {
  test('TC-AUTH-06: 設定画面にアカウントが表示され、ログアウトするとログイン画面に戻る', async ({
    page,
    user,
  }) => {
    await openApp(page, '/config')
    await expect(page.locator('#config-account')).toHaveText(user.email)
    await page.locator('#logout-btn').click()
    await expect(page.locator('#auth-gate')).toBeVisible()
    await page.reload()
    await expect(page.locator('#auth-gate')).toBeVisible() // 再読み込みしても復活しない
  })

  test('TC-AUTH-07: 別のユーザーでログインしても、前のユーザーのデータは見えない', async ({
    page,
    db,
  }) => {
    await db.menu({ category: '胸', name: '一人目のメニュー' })
    await openApp(page, '/menus')
    await expect(page.locator('.menu-row-name', { hasText: '一人目のメニュー' })).toBeVisible()

    await openApp(page, '/config')
    await page.locator('#logout-btn').click()
    await expect(page.locator('#auth-gate')).toBeVisible()

    const second = await createTestUser()
    await login(page, second.email, second.password)
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
    await openApp(page, '/menus')
    await expect(page.locator('#list-body .empty-title')).toHaveText('まだメニューがありません')
    await expect(page.locator('.menu-row-name')).toHaveCount(0)
  })

  test('TC-AUTH-08: ログアウトすると、端末に保存した閲覧データ(IndexedDB)も消える', async ({
    page,
    db,
  }) => {
    await db.menu({ category: '胸', name: 'ベンチプレス' })
    await openApp(page, '/menus')
    await expect(page.locator('.menu-row-name')).toBeVisible()
    // キャッシュは1秒間隔で永続化される
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open('keyval-store')
              req.onsuccess = () => {
                const tx = req.result.transaction('keyval', 'readonly')
                const get = tx.objectStore('keyval').get('workout-tracker-query-cache')
                get.onsuccess = () => resolve(!!get.result)
              }
            }),
        ),
      )
      .toBe(true)

    await openApp(page, '/config')
    await page.locator('#logout-btn').click()
    await expect(page.locator('#auth-gate')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open('keyval-store')
              req.onsuccess = () => {
                const tx = req.result.transaction('keyval', 'readonly')
                const get = tx.objectStore('keyval').get('workout-tracker-query-cache')
                get.onsuccess = () => resolve(!!get.result)
              }
            }),
        ),
      )
      .toBe(false)
  })
})
