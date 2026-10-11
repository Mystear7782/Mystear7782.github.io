// TC-NAV系（ナビゲーション）・TC-01系（メニュー追加）
import type { Page } from '@playwright/test'
import { expect, footerGo, openApp, sidebarGo, test } from './fixtures'

test.describe('TC-NAV: ナビゲーション', () => {
  test('TC-NAV-01: ハンバーガーボタンでサイドバーが開く', async ({ page }) => {
    await openApp(page)
    await page.locator('#hamburger').click()
    await expect(page.locator('#sidebar')).toHaveClass(/show/)
  })

  test('TC-NAV-02: オーバーレイクリックでサイドバーが閉じる', async ({ page }) => {
    await openApp(page)
    await page.locator('#hamburger').click()
    await expect(page.locator('#sidebar.show')).toBeVisible()
    await page.locator('#overlay').click({ position: { x: 600, y: 300 } })
    await expect(page.locator('#sidebar')).not.toHaveClass(/show/)
  })

  test('TC-NAV-03: フッターの「記録」タブからメニュー一覧に遷移できる', async ({ page }) => {
    // 旧仕様はサイドバーの「メニュー一覧」。ダッシュボード導入でフッターの「記録」タブに変わった
    await openApp(page)
    await footerGo(page, '記録')
    await expect(page.locator('#page-title')).toHaveText('メニュー一覧')
    await expect(page.locator('#footer-nav .fn-item[data-tab="record"]')).toHaveClass(/active/)
  })

  test('TC-NAV-04: サイドバーで遷移するとサイドバーが閉じる', async ({ page }) => {
    await openApp(page)
    await sidebarGo(page, 'メニューの追加')
    await expect(page.locator('#sidebar')).not.toHaveClass(/show/)
    await expect(page.locator('#page-title')).toHaveText('メニューの追加')
  })

  test('TC-NAV-05: 下部タブ（ホーム/記録/セット/ボディ）で画面を切り替えられる', async ({
    page,
  }) => {
    await openApp(page)
    await footerGo(page, 'セット')
    await expect(page.locator('#page-title')).toHaveText('メニューセット')
    await footerGo(page, 'ボディ')
    await expect(page.locator('#page-title')).toHaveText('体重ログ')
    await footerGo(page, 'ホーム')
    await expect(page.locator('#page-title')).toHaveText('ダッシュボード')
  })
})

test.describe('TC-01: メニュー追加', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/menus/new')
    await expect(page.locator('#page-add-menu.active')).toBeVisible()
  })

  const chip = (page: Page, type: string) =>
    page.locator(`#type-section .type-chip[data-type='${type}']`)

  test('TC-01-01: 筋トレメニューを正常に追加できる', async ({ page, db }) => {
    await page.locator('#sel-cat').selectOption('胸')
    await chip(page, 'フリーウェイト').click()
    await page.locator('#inp-name').fill('ベンチプレス')
    await page.locator('#btn-add').click()

    await expect(page.locator('#toast')).toContainText('ベンチプレス')
    await expect(page.locator('#inp-name')).toHaveValue('')
    await expect(page.locator('#btn-add')).toBeDisabled()
    expect(await db.count('exercises')).toBe(1) // サーバー(DB)にも保存されている
  })

  test('TC-01-02: 有酸素運動メニューを正常に追加できる', async ({ page }) => {
    await page.locator('#sel-cat').selectOption('有酸素運動')
    await expect(page.locator('#type-section')).toBeHidden()
    await page.locator('#inp-name').fill('ランニング')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('ランニング')
  })

  test('TC-01-03: 全項目未入力時に追加ボタンが非活性', async ({ page }) => {
    await expect(page.locator('#btn-add')).toBeDisabled()
  })

  test('TC-01-04: 部位のみ選択時に追加ボタンが非活性', async ({ page }) => {
    await page.locator('#sel-cat').selectOption('胸')
    await expect(page.locator('#btn-add')).toBeDisabled()
  })

  test('TC-01-05: 部位・種別選択済みで名前未入力時に追加ボタンが非活性', async ({ page }) => {
    await page.locator('#sel-cat').selectOption('胸')
    await chip(page, 'マシン').click()
    await expect(page.locator('#btn-add')).toBeDisabled()
  })

  test('TC-01-06: 全項目入力済みで追加ボタンが活性', async ({ page }) => {
    await page.locator('#sel-cat').selectOption('肩')
    await chip(page, '自重運動').click()
    await page.locator('#inp-name').fill('サイドレイズ')
    await expect(page.locator('#btn-add')).toBeEnabled()
  })

  test('TC-01-07: 同一部位に同名メニュー追加でエラートースト', async ({ page, db }) => {
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await page.reload()
    await page.locator('#sel-cat').selectOption('胸')
    await chip(page, 'マシン').click()
    await page.locator('#inp-name').fill('ベンチプレス')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('同じ部位に同名のメニューがあります')
    expect(await db.count('exercises')).toBe(1)
  })

  test('TC-01-08: 全角30文字で登録できる', async ({ page }) => {
    const name30 = 'あ'.repeat(30)
    await page.locator('#sel-cat').selectOption('背中')
    await chip(page, 'マシン').click()
    await page.locator('#inp-name').fill(name30)
    await expect(page.locator('#btn-add')).toBeEnabled()
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText(name30)
  })

  test('TC-01-09: 全角31文字目が入力できない（30文字でカット）', async ({ page }) => {
    await page.locator('#inp-name').fill('あ'.repeat(31))
    expect((await page.locator('#inp-name').inputValue()).length).toBe(30)
  })

  test('TC-01-10: 半角30文字で登録できる', async ({ page }) => {
    await page.locator('#sel-cat').selectOption('腕')
    await chip(page, '自重運動').click()
    await page.locator('#inp-name').fill('a'.repeat(30))
    await expect(page.locator('#btn-add')).toBeEnabled()
  })

  test('TC-01-11: 半角61文字目が入力できない（[...value].length で30文字にカット）', async ({
    page,
  }) => {
    await page.locator('#inp-name').fill('a'.repeat(61))
    expect((await page.locator('#inp-name').inputValue()).length).toBe(30)
  })

  test('TC-01-12: 有酸素運動選択時に種別選択が非表示（他の部位に戻すと再表示）', async ({
    page,
  }) => {
    await page.locator('#sel-cat').selectOption('有酸素運動')
    await expect(page.locator('#type-section')).toBeHidden()
    await page.locator('#sel-cat').selectOption('胸')
    await expect(page.locator('#type-section')).toBeVisible()
  })

  test('TC-01-13: HTMLタグを含む名前は一覧に文字列のまま表示される（太字にならない）', async ({
    page,
  }) => {
    await page.locator('#sel-cat').selectOption('胸')
    await chip(page, 'マシン').click()
    await page.locator('#inp-name').fill('<b>test</b>')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('<b>test</b>')

    await footerGo(page, '記録')
    await expect(page.locator('.menu-row-name')).toContainText('<b>test</b>')
    expect(await page.locator('.menu-row-name b').count()).toBe(0)
  })

  test('TC-01-14: 有酸素運動から他の部位へ変えると種別が未選択に戻り、追加できない', async ({
    page,
  }) => {
    await page.locator('#sel-cat').selectOption('有酸素運動')
    await page.locator('#inp-name').fill('バイク')
    await expect(page.locator('#btn-add')).toBeEnabled()
    await page.locator('#sel-cat').selectOption('胸')
    await expect(page.locator('#btn-add')).toBeDisabled()
  })

  test('TC-01-15: 部位「その他」でメニューを登録できる', async ({ page, db }) => {
    await expect(page.locator('#sel-cat option', { hasText: 'その他' })).toHaveCount(1)
    await page.locator('#sel-cat').selectOption('その他')
    await chip(page, 'マシン').click()
    await page.locator('#inp-name').fill('特殊マシン')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('特殊マシン')
    expect(await db.count('exercises')).toBe(1)
  })
})

test.describe('TC-01: DBの一意制約（アーカイブされていない同名の種目）', () => {
  test('TC-01-16: 画面が古いまま同名を追加しても、DBが拒否してエラーを知らせる', async ({
    page,
    db,
  }) => {
    await openApp(page, '/menus/new')
    // 画面を開いた後に、別の経路（MCP等）で同じ部位・同名のメニューが作られた状態
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await page.locator('#sel-cat').selectOption('胸')
    await page.locator("#type-section .type-chip[data-type='マシン']").click()
    await page.locator('#inp-name').fill('ベンチプレス')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('同じ部位に同名のメニューがあります')
    expect(await db.count('exercises')).toBe(1)
  })

  test('TC-01-17: アーカイブ済みと同名のメニューは作れ、アーカイブ解除は同名の有効なメニューがあると失敗する', async ({
    page,
    db,
  }) => {
    const old = await db.menu({ category: '胸', name: 'ベンチプレス', archived: true })
    await openApp(page, '/menus/new')
    await page.locator('#sel-cat').selectOption('胸')
    await page.locator("#type-section .type-chip[data-type='マシン']").click()
    await page.locator('#inp-name').fill('ベンチプレス')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('を追加しました')
    expect(await db.count('exercises')).toBe(2)

    // 古い(アーカイブ済み)方の解除は、同名の有効なメニューがあるため失敗する
    await page.goto(`/#/menus/${old}`)
    await page.locator('button.btn-action.unarchive').click()
    await expect(page.locator('#toast')).toContainText('同じ部位に同名のメニューがあります')
    await expect(page.locator('button.btn-action.unarchive')).toBeVisible()
  })
})
