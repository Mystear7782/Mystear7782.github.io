// TC-BODY系: 体重ログ・食事記録
import { expect, footerGo, openApp, test, todayStr } from './fixtures'

test.describe('TC-BODY: 体重ログ', () => {
  test('TC-BODY-01: 体重を記録できる（日付の初期値は今日）', async ({ page, db }) => {
    await openApp(page, '/weight')
    await expect(page.locator('#weight-inp-date')).toHaveValue(todayStr())
    await page.locator('#weight-inp-value').fill('65.4')
    await page.locator('#weight-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('記録しました')
    await expect(page.locator('#weight-list-body .prog-card-name')).toHaveText(['65.4 kg'])
    await expect(page.locator('#weight-inp-value')).toHaveValue('')
    expect(await db.count('body_weight_logs')).toBe(1)
  })

  test('TC-BODY-02: 体重が未入力・0以下だとエラートースト', async ({ page, db }) => {
    await openApp(page, '/weight')
    await page.locator('#weight-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('体重を正しく入力してください')
    await page.locator('#weight-inp-value').fill('0')
    await page.locator('#weight-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('体重を正しく入力してください')
    expect(await db.count('body_weight_logs')).toBe(0)
  })

  test('TC-BODY-03: 同じ日に複数回記録できる', async ({ page, db }) => {
    await openApp(page, '/weight')
    for (const v of ['65.0', '65.6']) {
      await page.locator('#weight-inp-value').fill(v)
      await page.locator('#weight-submit-btn').click()
      await expect(page.locator('#toast')).toContainText('記録しました')
    }
    await expect(page.locator('#weight-list-body .prog-card')).toHaveCount(2)
    expect(await db.count('body_weight_logs')).toBe(2)
  })

  test('TC-BODY-04: 記録を編集できる（ボタンが「更新する」になり、キャンセルで戻せる）', async ({
    page,
    db,
  }) => {
    await db.bodyWeight('2026-10-01', 70)
    await openApp(page, '/weight')
    await page.locator('#weight-list-body .prog-card button', { hasText: '編集' }).click()
    await expect(page.locator('#weight-submit-btn')).toHaveText('更新する')
    await expect(page.locator('#weight-inp-value')).toHaveValue('70')
    await expect(page.locator('#weight-inp-date')).toHaveValue('2026-10-01')

    await page.locator('#weight-cancel-btn').click()
    await expect(page.locator('#weight-submit-btn')).toHaveText('記録する')

    await page.locator('#weight-list-body .prog-card button', { hasText: '編集' }).click()
    await page.locator('#weight-inp-value').fill('69.2')
    await page.locator('#weight-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('更新しました')
    await expect(page.locator('#weight-list-body .prog-card-name')).toHaveText(['69.2 kg'])
    expect(await db.count('body_weight_logs')).toBe(1)
  })

  test('TC-BODY-05: 記録を削除できる（確認ダイアログあり）', async ({ page, db }) => {
    await db.bodyWeight('2026-10-01', 70)
    await openApp(page, '/weight')
    page.once('dialog', (d) => void d.accept())
    await page.locator('#weight-list-body .prog-card button', { hasText: '削除' }).click()
    await expect(page.locator('#weight-list-body .empty-title')).toHaveText('記録がありません')
    expect(await db.count('body_weight_logs')).toBe(0)
  })

  test('TC-BODY-06: 推移グラフは2件以上で表示され、1件以下では表示されない', async ({
    page,
    db,
  }) => {
    await db.bodyWeight('2026-10-01', 70)
    await openApp(page, '/weight')
    await expect(page.locator('#weight-chart-card')).toHaveCount(0)
    await page.locator('#weight-inp-value').fill('69')
    await page.locator('#weight-submit-btn').click()
    await expect(page.locator('#weight-chart-card')).toBeVisible()
    await expect(page.locator('#chart-weight')).toBeVisible()
  })

  test('TC-BODY-07: 一覧は日付の新しい順', async ({ page, db }) => {
    await db.bodyWeight('2026-09-01', 71)
    await db.bodyWeight('2026-10-01', 70)
    await openApp(page, '/weight')
    await expect(page.locator('#weight-list-body .prog-card-meta')).toHaveText([
      '2026年10月1日',
      '2026年9月1日',
    ])
  })

  test('TC-BODY-08: 「体重」「食事」タブで画面を行き来できる', async ({ page }) => {
    await openApp(page, '/weight')
    await page.locator('.ana-tab', { hasText: '食事' }).click()
    await expect(page.locator('#page-meal.active')).toBeVisible()
    await page.locator('.ana-tab', { hasText: '体重' }).click()
    await expect(page.locator('#page-weight.active')).toBeVisible()
    await footerGo(page, 'ボディ')
    await expect(page.locator('#footer-nav .fn-item[data-tab="body"]')).toHaveClass(/active/)
  })
})

test.describe('TC-BODY: 食事記録', () => {
  test('TC-BODY-09: P/F/Cを入力すると推定カロリーが即時に表示される', async ({ page }) => {
    await openApp(page, '/meal')
    await page.locator('#meal-inp-protein').fill('30')
    await page.locator('#meal-inp-fat').fill('10')
    await page.locator('#meal-inp-carb').fill('50')
    await expect(page.locator('#meal-cal-preview')).toHaveText('410') // 30×4 + 10×9 + 50×4
  })

  test('TC-BODY-10: 食事を記録でき、カロリーはDBの計算結果が一覧に表示される', async ({
    page,
    db,
  }) => {
    await openApp(page, '/meal')
    await page.locator('#meal-inp-type').selectOption('昼')
    await page.locator('#meal-inp-protein').fill('30')
    await page.locator('#meal-inp-fat').fill('10')
    await page.locator('#meal-inp-carb').fill('50')
    await page.locator('#meal-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('記録しました')
    await expect(page.locator('#meal-list-body .prog-card-name')).toHaveText(['昼 ・ 410 kcal'])
    await expect(page.locator('#meal-list-body .prog-card-meta')).toHaveText([
      'P 30g ・ F 10g ・ C 50g',
    ])
    const { data } = await db.client.from('meal_logs').select('calories_kcal')
    expect(data).toEqual([{ calories_kcal: 410 }])
  })

  test('TC-BODY-11: P/F/Cがすべて0・未入力だとエラートースト', async ({ page, db }) => {
    await openApp(page, '/meal')
    await page.locator('#meal-submit-btn').click()
    await expect(page.locator('#toast')).toContainText(
      'たんぱく質・脂質・炭水化物のいずれかを入力してください',
    )
    expect(await db.count('meal_logs')).toBe(0)
  })

  test('TC-BODY-12: 日付ごとにまとまり、1日の合計カロリーが表示される', async ({ page, db }) => {
    await db.meal('2026-10-01', '朝', 30, 10, 50) // 410
    await db.meal('2026-10-01', '夜', 40, 20, 80) // 660
    await db.meal('2026-09-30', '朝', 10, 5, 20) // 165
    await openApp(page, '/meal')
    const heads = page.locator('#meal-list-body .sec-title')
    await expect(heads).toHaveCount(2)
    await expect(heads.nth(0)).toContainText('2026年10月1日')
    await expect(heads.nth(0)).toContainText('合計 1070 kcal')
    await expect(heads.nth(1)).toContainText('合計 165 kcal')
  })

  test('TC-BODY-13: 食事を編集・削除できる', async ({ page, db }) => {
    await db.meal('2026-10-01', '朝', 30, 10, 50)
    await openApp(page, '/meal')
    await page.locator('#meal-list-body .prog-card button', { hasText: '編集' }).click()
    await expect(page.locator('#meal-submit-btn')).toHaveText('更新する')
    await expect(page.locator('#meal-inp-protein')).toHaveValue('30')
    await page.locator('#meal-inp-protein').fill('40')
    await page.locator('#meal-inp-type').selectOption('夜')
    await page.locator('#meal-submit-btn').click()
    await expect(page.locator('#toast')).toContainText('更新しました')
    await expect(page.locator('#meal-list-body .prog-card-name')).toHaveText(['夜 ・ 450 kcal'])

    page.once('dialog', (d) => void d.accept())
    await page.locator('#meal-list-body .prog-card button', { hasText: '削除' }).click()
    await expect(page.locator('#meal-list-body .empty-title')).toHaveText('記録がありません')
    expect(await db.count('meal_logs')).toBe(0)
  })

  test('TC-BODY-14: 編集をキャンセルするとフォームが初期状態に戻る', async ({ page, db }) => {
    await db.meal('2026-10-01', '朝', 30, 10, 50)
    await openApp(page, '/meal')
    await page.locator('#meal-list-body .prog-card button', { hasText: '編集' }).click()
    await page.locator('#meal-cancel-btn').click()
    await expect(page.locator('#meal-submit-btn')).toHaveText('記録する')
    await expect(page.locator('#meal-inp-protein')).toHaveValue('')
    await expect(page.locator('#meal-cal-preview')).toHaveText('0')
  })
})
