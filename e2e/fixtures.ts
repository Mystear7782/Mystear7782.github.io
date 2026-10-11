// E2E共通のフィクスチャ。テストごとに新しいユーザーを作り、ログイン済みの状態でアプリを開く。
import { expect, test as base, type Page } from '@playwright/test'
import { authStorageKey, createTestUser, Seeder, type TestUser } from './support/supabase'

type Fixtures = {
  /** このテスト専用に作ったユーザー（ログイン済みセッション付き） */
  user: TestUser
  /** ユーザー本人として、画面を介さずデータを投入する */
  db: Seeder
}

export const test = base.extend<Fixtures>({
  user: async ({ browserName: _b }, use) => {
    await use(await createTestUser())
  },
  db: async ({ user }, use) => {
    await use(new Seeder(user.session.access_token))
  },
  // 標準の page を、ログイン済みセッションを localStorage に仕込んだものに置き換える
  page: async ({ page, user }, use) => {
    await page.addInitScript(
      ([key, session]) => {
        // アプリより先にセッションを入れておく。ログアウト後の再読み込みで復活しないよう、一度だけ
        if (!sessionStorage.getItem('e2e-session-seeded')) {
          localStorage.setItem(key as string, JSON.stringify(session))
          sessionStorage.setItem('e2e-session-seeded', '1')
        }
      },
      [authStorageKey(), user.session] as const,
    )
    await use(page)
  },
})

export { expect }

// ===== 画面操作の共通ヘルパー =====

/** アプリの画面を開く（HashRouter）。例: openApp(page, '/menus') */
export async function openApp(page: Page, path = '/') {
  await page.goto(`/#${path}`)
  // 初回の読み込み中オーバーレイが消えるまで待つ
  await expect(page.locator('#boot-overlay.show')).toHaveCount(0)
}

/** サイドバーを開き、項目を選ぶ */
export async function sidebarGo(page: Page, label: string) {
  await page.locator('#hamburger').click()
  await expect(page.locator('#sidebar.show')).toBeVisible()
  await page.locator('#sidebar .sb-item', { hasText: label }).click()
  await expect(page.locator('#sidebar.show')).toHaveCount(0)
}

/** フッターのタブを押す */
export async function footerGo(page: Page, label: string) {
  await page.locator('#footer-nav .fn-item', { hasText: label }).click()
}

/** 今日の日付 YYYY-MM-DD（ブラウザのローカル時刻と同じ） */
export function todayStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
