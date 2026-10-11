// TC-05系: 有酸素運動記録
import type { Page } from '@playwright/test'
import { expect, openApp, test, todayStr } from './fixtures'

const REQUIRED_FIELDS: [string, string][] = [
  ['c-time', '合計時間'],
  ['c-dist', '合計距離'],
  ['c-cal', '消費カロリー'],
  ['c-hr', '平均心拍数'],
]
const VALUES: Record<string, string> = {
  'c-time': '30',
  'c-dist': '5.0',
  'c-cal': '300',
  'c-hr': '140',
}

async function fillRequired(page: Page, skip?: string) {
  for (const [id] of REQUIRED_FIELDS) {
    if (id !== skip) await page.locator(`#${id}`).fill(VALUES[id])
  }
}

test.describe('TC-05: 有酸素運動記録', () => {
  let menuId: string

  test.beforeEach(async ({ page, db }) => {
    menuId = await db.menu({ category: '有酸素運動', name: 'ランニング' })
    await openApp(page, `/menus/${menuId}`)
    await page.locator('button.btn-action.new-sess').click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-05-01: 必須4項目を入力して有酸素運動を記録できる', async ({ page, db }) => {
    await fillRequired(page)
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
    // カレンダー経由でない場合はメニュー詳細に遷移する
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    expect(await db.count('cardio_logs')).toBe(1)
    const { data } = await db.client
      .from('cardio_logs')
      .select('time_min, dist_km, cal_kcal, hr_bpm')
    expect(data).toEqual([{ time_min: 30, dist_km: 5, cal_kcal: 300, hr_bpm: 140 }])
  })

  test('TC-05-02: 任意項目（速度）も入力して保存できる', async ({ page, db }) => {
    await fillRequired(page)
    await page.locator('#c-maxspd').fill('12.0')
    await page.locator('#c-avgspd').fill('8.5')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
    const { data } = await db.client.from('cardio_logs').select('max_spd_kmh, avg_spd_kmh')
    expect(data).toEqual([{ max_spd_kmh: 12, avg_spd_kmh: 8.5 }])
  })

  test('TC-05-03: 必須項目が全て未入力で保存するとエラートーストが出て画面にとどまる', async ({
    page,
    db,
  }) => {
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toBeVisible()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
    expect(await db.count('workout_sessions')).toBe(0)
  })

  for (const [skipId, fieldName] of REQUIRED_FIELDS) {
    test(`TC-05-04〜07: 「${fieldName}」が未入力だとトーストに項目名が含まれ、画面にとどまる`, async ({
      page,
    }) => {
      await fillRequired(page, skipId)
      await page.locator('#btn-save-cardio').click()
      await expect(page.locator('#toast')).toContainText(fieldName)
      await expect(page.locator('#page-set-edit.active')).toBeVisible()
    })
  }

  test('TC-05-08: 時間0分で保存できない（0は無効値）', async ({ page }) => {
    await fillRequired(page, 'c-time')
    await page.locator('#c-time').fill('0')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('合計時間')
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-05-09: 距離0.1km（最小刻み）で保存できる', async ({ page }) => {
    await fillRequired(page, 'c-dist')
    await page.locator('#c-dist').fill('0.1')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
  })

  test('TC-05-10: 入力中は「入力中のプレビュー」が表示される', async ({ page }) => {
    await expect(page.locator('#cardio-preview')).toBeEmpty()
    await page.locator('#c-time').fill('45')
    await expect(page.locator('#cardio-preview')).toContainText('入力中のプレビュー')
    await expect(page.locator('#cardio-preview')).toContainText('45')
  })
})

test.describe('TC-05: 保存済みの有酸素セッション', () => {
  test('TC-05-11: 保存済みの有酸素セッションを開き直して値を更新できる', async ({ page, db }) => {
    // アプリを開く前にデータを用意する（開いた後に別経路で増えたデータはフォーカス時の再取得で反映される）
    const menuId = await db.menu({ category: '有酸素運動', name: 'ランニング' })
    const sid = await db.cardio(menuId, todayStr(), { time: 20, dist: 3, cal: 200, hr: 130 })
    await openApp(page, `/menus/${menuId}/sessions/${sid}`)
    await expect(page.locator('#c-time')).toHaveValue('20')
    await page.locator('#c-dist').fill('4.5')
    await page.locator('#btn-save-cardio').click()
    await expect(page.locator('#toast')).toContainText('記録を保存しました')
    const { data } = await db.client.from('cardio_logs').select('dist_km').eq('session_id', sid)
    expect(data).toEqual([{ dist_km: 4.5 }])
  })
})
