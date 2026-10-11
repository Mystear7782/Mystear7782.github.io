// TC-DASH系: ダッシュボード（直近7日の集計・クイック記録・最近の記録）
import { expect, openApp, test, todayStr } from './fixtures'

test('TC-DASH-01: 記録が無いときは「まだ記録がありません」と、集計は0/—になる', async ({
  page,
}) => {
  await openApp(page, '/')
  await expect(page.locator('#dash-recent .empty-title')).toHaveText('まだ記録がありません')
  const stats = page.locator('#dash-stats .stat-box')
  await expect(stats.nth(0).locator('.stat-val')).toHaveText('0')
  await expect(stats.nth(1).locator('.stat-val')).toHaveText('—')
  await expect(stats.nth(2).locator('.stat-val')).toHaveText('—')
})

test.describe('TC-DASH: 記録があるとき', () => {
  test.beforeEach(async ({ db }) => {
    const bench = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    const run = await db.menu({ category: '有酸素運動', name: 'ランニング' })
    await db.session(bench, todayStr(), [
      [80, 10],
      [85, 8],
    ]) // 1480
    await db.session(bench, todayStr(-3), [[60, 10]]) // 600
    await db.session(bench, todayStr(-30), [[100, 10]]) // 直近7日より前
    await db.cardio(run, todayStr(-1), { time: 30, dist: 5, cal: 300, hr: 140 })
    await db.bodyWeight(todayStr(-20), 71)
    await db.bodyWeight(todayStr(), 69.5)
  })

  test('TC-DASH-02: 直近7日のセッション数・総ボリューム(筋トレのみ)・体重変化が集計される', async ({
    page,
  }) => {
    await openApp(page, '/')
    const stats = page.locator('#dash-stats .stat-box')
    await expect(stats.nth(0).locator('.stat-val')).toHaveText('3') // 7日以内: 筋トレ2 + 有酸素1
    await expect(stats.nth(1).locator('.stat-val')).toHaveText('2080') // 1480 + 600（有酸素は含めない）
    await expect(stats.nth(2).locator('.stat-val')).toHaveText('-1.5') // 71 → 69.5
  })

  test('TC-DASH-03: 最近の記録は新しい順に最大5件、セッションと体重が混ざる', async ({ page }) => {
    await openApp(page, '/')
    const rows = page.locator('#dash-recent .dash-recent-row')
    await expect(rows).toHaveCount(5)
    // 同じ日の体重は12:00として扱われるため、00:00のセッションより上に並ぶ
    await expect(rows.nth(0)).toContainText('体重記録')
    await expect(rows.nth(1)).toContainText('2セット')
    const names = await page.locator('#dash-recent .dash-recent-name').allTextContents()
    expect(names).toContain('体重記録')
    expect(names).toContain('ランニング')
    expect(await page.locator('#dash-recent .dash-recent-val').allTextContents()).toContain(
      '5 km / 30 分',
    )
  })

  test('TC-DASH-04: 最近の記録をタップするとセット記録画面が開き、戻るとダッシュボードに戻る', async ({
    page,
  }) => {
    await openApp(page, '/')
    await page.locator('#dash-recent .dash-recent-row', { hasText: '2セット' }).click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
    await page.locator('#set-back').click()
    await expect(page.locator('#page-dashboard.active')).toBeVisible()
  })

  test('TC-DASH-05: ダッシュボードから開いたセッションは、有酸素を保存しても画面にとどまる', async ({
    page,
  }) => {
    await openApp(page, '/')
    await page.locator('#dash-recent .dash-recent-row', { hasText: '5 km' }).click()
    await expect(page.locator('#c-time')).toHaveValue('30')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-DASH-06: 体重の行をタップすると体重ログが開く', async ({ page }) => {
    await openApp(page, '/')
    await page.locator('#dash-recent .dash-recent-row', { hasText: '体重記録' }).first().click()
    await expect(page.locator('#page-weight.active')).toBeVisible()
  })

  test('TC-DASH-07: クイック記録（セット記録・体重記録・食事記録）から各画面に移動できる', async ({
    page,
  }) => {
    await openApp(page, '/')
    await page.locator('.qa-btn', { hasText: '体重記録' }).click()
    await expect(page.locator('#page-weight.active')).toBeVisible()
    await page.locator('#footer-nav .fn-item', { hasText: 'ホーム' }).click()
    await page.locator('.qa-btn', { hasText: '食事記録' }).click()
    await expect(page.locator('#page-meal.active')).toBeVisible()
    await page.locator('#footer-nav .fn-item', { hasText: 'ホーム' }).click()
    await page.locator('.qa-btn', { hasText: 'セット記録' }).click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
  })
})

test('TC-DASH-08: 体重が1件だけのときは、変化ではなく現在値が表示される', async ({ page, db }) => {
  await db.bodyWeight(todayStr(), 68.2)
  await openApp(page, '/')
  await expect(page.locator('#dash-stats .stat-box').nth(2).locator('.stat-val')).toHaveText('68.2')
})
