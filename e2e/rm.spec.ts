// TC-09系: RM換算表（推定1RM計算・1〜10rep換算一覧）
//
// 計算式:   ベンチプレス: 1RM = w×r÷40 + w / スクワット・DL: 1RM = w×r÷33.3 + w / 逆算: w = 1RM ÷ (r÷divisor + 1)
// 丸め仕様: 小数部 < 0.5 は切り捨て、>= 0.5 は切り上げ（整数表示）
import type { Page } from '@playwright/test'
import { expect, openApp, sidebarGo, test } from './fixtures'

async function fill(page: Page, weight: string, reps: string) {
  await page.locator('#rm-inp-w').fill(weight)
  await page.locator('#rm-inp-r').fill(reps)
}

test.describe('TC-09: RM換算表', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/')
    await sidebarGo(page, 'RM換算表')
    await expect(page.locator('#page-rm.active')).toBeVisible()
  })

  test('TC-09-01: RM換算表ページに遷移できる', async ({ page }) => {
    await expect(page.locator('#page-title')).toHaveText('RM換算表')
  })

  // [TC, 説明, 重量, 回数, ベンチ期待, スクワット期待]
  const cases: [string, string, string, string, string, string][] = [
    ['TC-09-02/03', '80kg×10回（BP=100 整数 / SQ=104 切り捨て）', '80', '10', '100', '104'],
    [
      'TC-09-04/05',
      '100kg×5回（BP=112.5→113 切り上げ / SQ=115.015→115 切り捨て）',
      '100',
      '5',
      '113',
      '115',
    ],
    ['TC-09-06', '45kg×2回（BP=47.25→47 切り捨て）', '45', '2', '47', '48'],
    ['TC-09-07', '60kg×3回（BP=64.5→65 切り上げ）', '60', '3', '65', '65'],
    ['TC-09-12', '最小値 0.5kg×1回（BP/SQ とも 1）', '0.5', '1', '1', '1'],
    ['TC-09-13', '大きい値 200kg×5回（BP=225 / SQ=230.03→230）', '200', '5', '225', '230'],
  ]
  for (const [id, title, w, r, bp, sq] of cases) {
    test(`${id}: ${title}`, async ({ page }) => {
      await fill(page, w, r)
      await expect(page.locator('#rm-orm-result')).toBeVisible()
      await expect(page.locator('#rm-bp-val')).toHaveText(bp)
      await expect(page.locator('#rm-sq-val')).toHaveText(sq)
    })
  }

  test('TC-09-08: 重量未入力時に推定1RM結果が表示されない', async ({ page }) => {
    await page.locator('#rm-inp-r').fill('10')
    await expect(page.locator('#rm-orm-result')).toBeHidden()
  })

  test('TC-09-09: 回数未入力時に推定1RM結果が表示されない', async ({ page }) => {
    await page.locator('#rm-inp-w').fill('80')
    await expect(page.locator('#rm-orm-result')).toBeHidden()
  })

  test('TC-09-10: 重量0で結果が表示されない', async ({ page }) => {
    await fill(page, '0', '10')
    await expect(page.locator('#rm-orm-result')).toBeHidden()
  })

  test('TC-09-11: 回数0で結果が表示されない', async ({ page }) => {
    await fill(page, '80', '0')
    await expect(page.locator('#rm-orm-result')).toBeHidden()
  })

  test('TC-09-14: 推定1RM計算後に最大RM欄へベンチプレスの値が自動連動される', async ({ page }) => {
    await fill(page, '80', '10')
    await expect(page.locator('#rm-inp-max')).toHaveValue('100')
  })

  test('TC-09-15: 最大RM入力後に換算テーブルが表示される', async ({ page }) => {
    await page.locator('#rm-inp-max').fill('100')
    await expect(page.locator('.rm-rep-table')).toBeVisible()
  })

  // 1RM=100kgのときの 1〜10rep 換算（ベンチ / スクワット・DL）
  const BP = [100, 95, 93, 91, 89, 87, 85, 83, 82, 80]
  const SQ = [100, 94, 92, 89, 87, 85, 83, 81, 79, 77]

  test('TC-09-16〜20: 1RM=100kg の1〜10rep換算が表のとおり（1repは最大RMそのもの）', async ({
    page,
  }) => {
    await page.locator('#rm-inp-max').fill('100')
    const rows = page.locator('.rm-rep-table tbody tr')
    await expect(rows).toHaveCount(10)
    for (let i = 0; i < 10; i++) {
      const cells = await rows.nth(i).locator('td').allTextContents()
      expect(cells[1], `BP ${i + 1}rep`).toContain(`${BP[i]} kg`)
      expect(cells[2], `SQ ${i + 1}rep`).toContain(`${SQ[i]} kg`)
    }
  })

  test('TC-09-21: 入力した回数（10回）の行がハイライトされる', async ({ page }) => {
    await fill(page, '80', '10')
    const row = page.locator('.rm-rep-table tbody tr.rm-highlight')
    await expect(row).toBeVisible()
    await expect(row.locator('.rm-rep-badge')).toHaveText('10')
  })

  test('TC-09-22: 最大RM未入力時にテーブルが表示されない（空状態を表示）', async ({ page }) => {
    await expect(page.locator('.rm-rep-table')).toHaveCount(0)
    await expect(page.locator('#rm-table-wrap .empty-title')).toBeVisible()
  })

  test('TC-09-23: 最大RM=0でテーブルが表示されない', async ({ page }) => {
    await page.locator('#rm-inp-max').fill('0')
    await expect(page.locator('.rm-rep-table')).toHaveCount(0)
  })

  test('TC-09-24: 最大RMを直接手入力してテーブルを表示できる（1repは120kg）', async ({ page }) => {
    await page.locator('#rm-inp-max').fill('120')
    const cells = await page
      .locator('.rm-rep-table tbody tr')
      .first()
      .locator('td')
      .allTextContents()
    expect(cells[1]).toContain('120 kg')
  })

  test('TC-09-25: ページを離れて戻るとフォームがクリアされる', async ({ page }) => {
    await fill(page, '80', '10')
    await expect(page.locator('#rm-orm-result')).toBeVisible()
    await page.locator('#footer-nav .fn-item', { hasText: '記録' }).click()
    await sidebarGo(page, 'RM換算表')
    await expect(page.locator('#rm-inp-w')).toHaveValue('')
    await expect(page.locator('#rm-inp-r')).toHaveValue('')
    await expect(page.locator('#rm-inp-max')).toHaveValue('')
    await expect(page.locator('#rm-orm-result')).toBeHidden()
  })
})
