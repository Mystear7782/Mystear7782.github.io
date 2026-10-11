// TC-02系（メニュー一覧）・TC-03系（アーカイブ・復元・削除）
import { expect, openApp, test } from './fixtures'

test.describe('TC-02: メニュー一覧', () => {
  test('TC-02-01: 追加したメニューが部位グループに表示される', async ({ page, db }) => {
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await openApp(page, '/menus')
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).toBeVisible()
    await expect(page.locator('.group-name', { hasText: '胸' })).toBeVisible()
  })

  test('TC-02-02: 複数部位のメニューが正しいグループに表示される', async ({ page, db }) => {
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.menu({ category: '背中', type: 'マシン', name: 'ラットプルダウン' })
    await db.menu({ category: '有酸素運動', name: 'ランニング' })
    await openApp(page, '/menus')
    for (const g of ['胸', '背中', '有酸素運動']) {
      await expect(page.locator('.group-name', { hasText: g })).toBeVisible()
    }
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: 'ラットプルダウン' })).toBeVisible()
  })

  test('TC-02-03: メニューが無いときは空の案内が出る', async ({ page }) => {
    await openApp(page, '/menus')
    await expect(page.locator('#list-body .empty-title')).toHaveText('まだメニューがありません')
  })

  test('TC-02-04: メニュー一覧の部位順は 胸→背中→肩→足→腕→その他→有酸素運動', async ({
    page,
    db,
  }) => {
    for (const c of ['有酸素運動', 'その他', '腕', '足', '肩', '背中', '胸']) {
      await db.menu({ category: c, name: `${c}の種目` })
    }
    await openApp(page, '/menus')
    await expect(page.locator('.group-name')).toHaveText([
      '胸',
      '背中',
      '肩',
      '足',
      '腕',
      'その他',
      '有酸素運動',
    ])
  })
})

test.describe('TC-03: アーカイブ・復元・削除', () => {
  test.beforeEach(async ({ page, db }) => {
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await openApp(page, '/menus')
    await page.locator('.menu-row').first().click()
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    page.on('dialog', (d) => void d.accept())
  })

  test('TC-03-01: アーカイブするとメニュー一覧から消える', async ({ page }) => {
    await page.locator('button.btn-action.archive').click()
    await expect(page.locator('#toast')).toContainText('アーカイブしました')
    await page.locator('#menu-detail-back').click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).not.toBeVisible()
  })

  test('TC-03-02: アーカイブ表示トグルONでアーカイブ済みが表示される', async ({ page }) => {
    await page.locator('button.btn-action.archive').click()
    await expect(page.locator('#toast')).toContainText('アーカイブしました')
    await page.locator('#menu-detail-back').click()
    await page.locator('.toggle-archive-btn').click()

    await expect(page.locator('.menu-row.archived')).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).toBeVisible()
  })

  test('TC-03-03: アーカイブ解除するとメニュー一覧に戻る', async ({ page }) => {
    await page.locator('button.btn-action.archive').click()
    await expect(page.locator('button.btn-action.unarchive')).toBeVisible()
    await page.locator('button.btn-action.unarchive').click()
    await expect(page.locator('#toast')).toContainText('アーカイブを解除しました')

    await page.locator('#menu-detail-back').click()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).toBeVisible()
    await expect(page.locator('.menu-row.archived')).not.toBeVisible()
  })

  test('TC-03-04: 完全削除するとメニュー一覧から消える', async ({ page, db }) => {
    await page.locator('button.btn-action.delete').click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).not.toBeVisible()
    expect(await db.count('exercises')).toBe(0)
  })

  test('TC-03-05: 完全削除後はアーカイブ表示しても存在しない', async ({ page }) => {
    await page.locator('button.btn-action.delete').click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    await page.locator('.toggle-archive-btn').click()
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).not.toBeVisible()
  })

  test('TC-03-06: 完全削除でそのメニューの記録(セッション・セット)も消える', async ({
    page,
    db,
  }) => {
    // beforeEachで開いた詳細画面のメニューに、記録を足してから削除する
    const { data } = await db.client.from('exercises').select('id').single()
    await db.session(data!.id, '2026-10-01', [[60, 10]])
    expect(await db.count('workout_sessions')).toBe(1)
    await page.locator('button.btn-action.delete').click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    expect(await db.count('workout_sessions')).toBe(0)
    expect(await db.count('sets')).toBe(0)
  })
})
