// TC-12系: メニュー一覧の並び替え（つまみ）・部位「その他」
// 旧仕様は「行の長押し(2秒)でドラッグ」だったが、iOSでテキスト選択と競合するため、
// 行左端の「つまみ」からドラッグする方式に変わっている。
import { dragHandle } from './support/drag'
import { expect, footerGo, openApp, test } from './fixtures'

test.describe('TC-12: メニュー一覧の並び替え', () => {
  test.beforeEach(async ({ page, db }) => {
    await db.menu({ category: '胸', name: 'ベンチプレス', sortOrder: 0 })
    await db.menu({ category: '胸', name: 'インクラインベンチ', sortOrder: 1 })
    await db.menu({ category: '胸', name: 'ペックフライ', sortOrder: 2 })
    await db.menu({ category: '足', name: 'スクワット', sortOrder: 0 })
    await openApp(page, '/menus')
    await expect(page.locator('.menu-row[data-cat="胸"] .menu-row-name')).toHaveText([
      'ベンチプレス',
      'インクラインベンチ',
      'ペックフライ',
    ])
  })

  const chestNames = (page: import('@playwright/test').Page) =>
    page.locator('.menu-row[data-cat="胸"] .menu-row-name')

  test('TC-12-01: つまみをドラッグすると同一部位内の並び順が入れ替わる', async ({ page }) => {
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(0), 80)
    await expect(chestNames(page)).toHaveText([
      'インクラインベンチ',
      'ベンチプレス',
      'ペックフライ',
    ])
  })

  test('TC-12-02: 並び替えの結果はリロード後も保持される（DBのsort_order）', async ({
    page,
    db,
  }) => {
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(0), 220)
    await expect(chestNames(page)).toHaveText([
      'インクラインベンチ',
      'ペックフライ',
      'ベンチプレス',
    ])
    await expect
      .poll(async () => {
        const { data } = await db.client
          .from('exercises')
          .select('name')
          .eq('category', '胸')
          .order('sort_order')
        return data!.map((r) => r.name)
      })
      .toEqual(['インクラインベンチ', 'ペックフライ', 'ベンチプレス'])
    await page.reload()
    await expect(chestNames(page)).toHaveText([
      'インクラインベンチ',
      'ペックフライ',
      'ベンチプレス',
    ])
  })

  test('TC-12-03: 通常のタップ（つまみ以外）は従来どおりメニュー詳細に遷移する', async ({
    page,
  }) => {
    await page
      .locator('.menu-row[data-cat="胸"]')
      .first()
      .click({ position: { x: 100, y: 20 } })
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    await expect(page.locator('.detail-name')).toContainText('ベンチプレス')
  })

  test('TC-12-04: ドラッグ操作の直後にメニュー詳細へ誤遷移しない', async ({ page }) => {
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(0), 80)
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    await expect(page.locator('#page-menu-detail')).toHaveCount(0)
  })

  test('TC-12-09: つまみをタップしただけ（動かさない）では遷移も保存もしない', async ({
    page,
    db,
  }) => {
    const before = (await db.client.from('exercises').select('id, sort_order').order('id')).data
    await page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(1).click()
    await expect(page.locator('#page-menu-list.active')).toBeVisible()
    expect((await db.client.from('exercises').select('id, sort_order').order('id')).data).toEqual(
      before,
    )
  })

  test('TC-12-10: 他の部位の並びには影響しない', async ({ page }) => {
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(0), 80)
    await expect(page.locator('.menu-row[data-cat="足"] .menu-row-name')).toHaveText(['スクワット'])
  })

  test('TC-12-11: 一番下の行を一番上までドラッグできる', async ({ page }) => {
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(2), -220)
    await expect(chestNames(page)).toHaveText([
      'ペックフライ',
      'ベンチプレス',
      'インクラインベンチ',
    ])
  })

  test('TC-12-12: アーカイブ済みを非表示にしていても、並び替え後の番号が衝突しない', async ({
    page,
    db,
  }) => {
    // 非表示のアーカイブ済みメニューが同じ部位にある状態
    await db.client.from('exercises').update({ archived: true }).eq('name', 'ペックフライ')
    await page.reload()
    await expect(chestNames(page)).toHaveText(['ベンチプレス', 'インクラインベンチ'])
    await dragHandle(page, page.locator('.menu-row[data-cat="胸"] .menu-row-handle').nth(0), 80)
    await expect(chestNames(page)).toHaveText(['インクラインベンチ', 'ベンチプレス'])
    await expect
      .poll(async () => {
        const { data } = await db.client.from('exercises').select('sort_order').eq('category', '胸')
        return new Set(data!.map((r) => r.sort_order)).size
      })
      .toBe(3) // 3件とも別々の番号
  })
})

test.describe('TC-12: 部位「その他」', () => {
  test('TC-12-05: メニュー追加画面の部位セレクトに「その他」がある', async ({ page }) => {
    await openApp(page, '/menus/new')
    expect(await page.locator('#sel-cat option').allTextContents()).toContain('その他')
  })

  test('TC-12-06/07: 「その他」で登録したメニューが一覧の「その他」グループに表示される', async ({
    page,
  }) => {
    await openApp(page, '/menus/new')
    await page.locator('#sel-cat').selectOption('その他')
    await page.locator("#type-section .type-chip[data-type='マシン']").click()
    await page.locator('#inp-name').fill('特殊マシン')
    await page.locator('#btn-add').click()
    await expect(page.locator('#toast')).toContainText('特殊マシン')
    await footerGo(page, '記録')
    await expect(page.locator('.group-name', { hasText: 'その他' })).toBeVisible()
    await expect(page.locator('.menu-row-name', { hasText: '特殊マシン' })).toBeVisible()
  })

  test('TC-12-08: 既存メニューの部位を編集で「その他」に変更できる', async ({ page, db }) => {
    const id = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await openApp(page, `/menus/${id}`)
    await page.locator('button.btn-action.edit-menu').click()
    await page.locator('#edit-sel-cat').selectOption('その他')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('.detail-tags')).toContainText('その他')
  })

  test('TC-12-13: 「その他」のメニューもメニュー分析の対象に出る', async ({ page, db }) => {
    const id = await db.menu({ category: 'その他', name: 'アブローラー', type: '自重運動' })
    await db.session(id, '2026-10-01', [[0, 10]])
    await openApp(page, '/analysis?tab=menu')
    await expect(page.locator('.group-name', { hasText: 'その他' })).toBeVisible()
  })
})
