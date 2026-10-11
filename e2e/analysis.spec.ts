// TC-07系: メニュー分析（カレンダービュー・メニュービュー・グラフ）
import { expect, openApp, sidebarGo, test, todayStr } from './fixtures'

test.describe('TC-07: カレンダービュー', () => {
  let menuId: string

  test.beforeEach(async ({ page, db }) => {
    menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, '/')
    await sidebarGo(page, 'メニュー分析')
    await expect(page.locator('#page-analysis.active')).toBeVisible()
  })

  test('TC-07-01: 記録のある日付がカレンダーで強調表示される', async ({ page }) => {
    await expect(page.locator('.cal-cell.has-record').first()).toBeVisible()
    await expect(page.locator('.cal-cell.today')).toHaveCount(1)
  })

  test('TC-07-02: 前月ボタンで月が変わる', async ({ page }) => {
    const before = (await page.locator('.cal-title').textContent())!
    await page.locator('.cal-nav-btn').first().click()
    await expect(page.locator('.cal-title')).not.toHaveText(before)
  })

  test('TC-07-03: 翌月ボタンで月が変わる', async ({ page }) => {
    const before = (await page.locator('.cal-title').textContent())!
    await page.locator('.cal-nav-btn').last().click()
    await expect(page.locator('.cal-title')).not.toHaveText(before)
  })

  test('TC-07-04: 記録日をタップするとセッション一覧が展開される（もう一度タップで閉じる）', async ({
    page,
  }) => {
    await page.locator('.cal-cell.has-record').first().click()
    await expect(page.locator('.cal-detail')).toBeVisible()
    await page.locator('.cal-cell.has-record').first().click()
    await expect(page.locator('.cal-detail')).toHaveCount(0)
  })

  test('TC-07-05: セッション一覧にメニュー名・セット数・1RM・ボリュームが表示される', async ({
    page,
  }) => {
    await page.locator('.cal-cell.has-record').first().click()
    const row = page.locator('.cal-sess-row').first()
    await expect(row.locator('.cal-sess-name')).toContainText('ベンチプレス')
    await expect(row.locator('.cal-sess-stat', { hasText: 'セット数' })).toBeVisible()
    await expect(row.locator('.cal-sess-stat', { hasText: '最大1RM' })).toBeVisible()
    await expect(row.locator('.cal-sess-stat', { hasText: 'ボリューム' })).toBeVisible()
  })

  test('TC-07-06: セッション行をタップするとセット記録画面に遷移する', async ({ page }) => {
    await page.locator('.cal-cell.has-record').first().click()
    await page.locator('.cal-sess-row').first().click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-07-07: カレンダー経由のセット記録画面で戻ると、同じカレンダー表示の分析画面に戻る', async ({
    page,
  }) => {
    await page.locator('.cal-cell.has-record').first().click()
    await page.locator('.cal-sess-row').first().click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()

    await page.locator('#set-back').click()
    await expect(page.locator('#page-analysis.active')).toBeVisible()
    await expect(page.locator('#page-menu-detail.active')).toHaveCount(0)
    // 選択していた日の詳細が開いたまま
    await expect(page.locator('.cal-detail')).toBeVisible()
  })
})

test.describe('TC-07: メニュービュー・グラフ', () => {
  test.beforeEach(async ({ page, db }) => {
    const menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, todayStr(-7), [[80, 10]])
    await db.session(menuId, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, '/analysis')
    await page.locator('#ana-tab-menu').click()
  })

  test('TC-07-08: メニュービューでメニューを選択すると分析詳細に遷移する', async ({ page }) => {
    await page.locator('.ana-menu-row').first().click()
    await expect(page.locator('#page-analysis-detail.active')).toBeVisible()
  })

  test('TC-07-09: 分析詳細にボリューム推移グラフが表示される', async ({ page }) => {
    await page.locator('.ana-menu-row').first().click()
    await expect(page.locator('#chart-vol')).toBeVisible()
  })

  test('TC-07-10: 分析詳細に最大1RM推移グラフが表示される', async ({ page }) => {
    await page.locator('.ana-menu-row').first().click()
    await expect(page.locator('#chart-orm')).toBeVisible()
  })

  test('TC-07-12: 分析詳細の表にセッションごとのボリュームと最大1RMが出る', async ({ page }) => {
    await page.locator('.ana-menu-row').first().click()
    const rows = page.locator('#analysis-detail-body .hist-table tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.last()).toContainText('1480 kg') // 80×10 + 85×8
    await expect(rows.last()).toContainText('102 kg') // 85×(1+8/40)
  })

  test('TC-07-14: 分析詳細から「分析に戻る」で分析画面に戻る', async ({ page }) => {
    await page.locator('.ana-menu-row').first().click()
    await page.getByRole('button', { name: '分析に戻る' }).click()
    await expect(page.locator('#page-analysis.active')).toBeVisible()
  })
})

test.describe('TC-07: 有酸素を含む場合', () => {
  test.beforeEach(async ({ db }) => {
    const menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, todayStr(), [[80, 10]])
    const cardioId = await db.menu({ category: '有酸素運動', name: 'ランニング' })
    await db.cardio(cardioId, todayStr(), { time: 30, dist: 5, cal: 300, hr: 140 })
  })

  test('TC-07-11: カレンダー経由で有酸素を保存しても、メニュー詳細へ自動では戻らない', async ({
    page,
  }) => {
    await openApp(page, '/analysis')
    await page.locator('.cal-cell.has-record').first().click()
    await page.locator('.cal-sess-row', { hasText: 'ランニング' }).click()
    await expect(page.locator('#c-time')).toHaveValue('30')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-07-13: 有酸素のメニューは分析対象に出ない', async ({ page }) => {
    await openApp(page, '/analysis')
    await page.locator('#ana-tab-menu').click()
    await expect(page.locator('.ana-menu-name', { hasText: 'ベンチプレス' })).toBeVisible()
    await expect(page.locator('.ana-menu-name', { hasText: 'ランニング' })).toHaveCount(0)
  })
})
