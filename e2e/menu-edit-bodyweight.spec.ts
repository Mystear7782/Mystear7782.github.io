// MYST-7: メニュー編集 / MYST-29: 初期表示 / MYST-30: セッション削除 /
// MYST-31: 自重運動で重量を非表示 / BW-DET: 自重メニュー詳細で1RM・ボリュームを非表示
import { expect, openApp, test, todayStr } from './fixtures'

test.describe('MYST-29: 初期表示', () => {
  test('TC-29-01: 起動直後はダッシュボードが表示される（旧: メニュー一覧）', async ({ page }) => {
    // 旧仕様(MYST-29)はメニュー一覧が初期画面。ダッシュボード導入で、初期画面はダッシュボードになった
    await openApp(page, '/')
    await expect(page.locator('#page-dashboard')).toBeVisible()
    await expect(page.locator('#page-menu-list')).toHaveCount(0)
    await expect(page.locator('#page-title')).toHaveText('ダッシュボード')
  })

  test('TC-29-02: 起動直後、フッターの「ホーム」タブが点灯する', async ({ page }) => {
    await openApp(page, '/')
    await expect(page.locator('#footer-nav .fn-item[data-tab="dashboard"]')).toHaveClass(/active/)
    await expect(page.locator('#footer-nav .fn-item[data-tab="record"]')).not.toHaveClass(/active/)
  })

  test('TC-29-03: サイドバーの「メニューの追加」は、追加画面を開いているときだけ点灯する', async ({
    page,
  }) => {
    await openApp(page, '/')
    await page.locator('#hamburger').click()
    await expect(page.locator('#sidebar .sb-item', { hasText: 'メニューの追加' })).not.toHaveClass(
      /active/,
    )
    await page.locator('#overlay').click({ position: { x: 600, y: 300 } })
    await openApp(page, '/menus/new')
    await page.locator('#hamburger').click()
    await expect(page.locator('#sidebar .sb-item', { hasText: 'メニューの追加' })).toHaveClass(
      /active/,
    )
  })
})

test.describe('MYST-7: メニュー編集', () => {
  test.beforeEach(async ({ page, db }) => {
    const id = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.menu({ category: '胸', type: 'マシン', name: 'チェストプレス' }) // 同名チェック用
    await openApp(page, `/menus/${id}`)
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
  })

  const openModal = async (page: import('@playwright/test').Page) => {
    await page.locator('button.btn-action.edit-menu').click()
    await expect(page.locator('#edit-menu-modal')).toHaveClass(/show/)
  }

  test('TC-MYST7-01: メニュー詳細に「編集」ボタンが表示される', async ({ page }) => {
    await expect(page.locator('button.btn-action.edit-menu')).toBeVisible()
  })

  test('TC-MYST7-02: 「編集」ボタンでモーダルが表示される', async ({ page }) => {
    await openModal(page)
  })

  test('TC-MYST7-03: モーダルに現在のメニュー名・部位が初期入力されている', async ({ page }) => {
    await openModal(page)
    await expect(page.locator('#edit-inp-name')).toHaveValue('ベンチプレス')
    await expect(page.locator('#edit-sel-cat')).toHaveValue('胸')
    await expect(
      page.locator("#edit-type-section .type-chip[data-type='フリーウェイト']"),
    ).toHaveClass(/sel/)
  })

  test('TC-MYST7-04: メニュー名を変更して保存するとメニュー詳細に反映される', async ({
    page,
    db,
  }) => {
    await openModal(page)
    await page.locator('#edit-inp-name').fill('インクラインベンチプレス')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('.detail-name')).toHaveText('インクラインベンチプレス')
    const { data } = await db.client.from('exercises').select('name').order('name')
    expect(data!.map((r) => r.name)).toContain('インクラインベンチプレス')
    expect(data!.map((r) => r.name)).not.toContain('ベンチプレス')
  })

  test('TC-MYST7-05: 部位を変更して保存するとメニュー詳細に反映される', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-sel-cat').selectOption('肩')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('.detail-tags')).toContainText('肩')
  })

  test('TC-MYST7-06: 種別を変更して保存するとメニュー詳細に反映される', async ({ page }) => {
    await openModal(page)
    await page.locator("#edit-type-section .type-chip[data-type='マシン']").click()
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('.detail-tags')).toContainText('マシン')
  })

  test('TC-MYST7-07: 同じ部位に同名メニューが存在する場合エラートースト', async ({ page }) => {
    await page.locator('#footer-nav .fn-item', { hasText: '記録' }).click()
    await page.locator('.menu-row', { hasText: 'チェストプレス' }).click()
    await openModal(page)
    await page.locator('#edit-inp-name').fill('ベンチプレス')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('#toast')).toContainText('同じ部位に同名のメニューがあります')
  })

  test('TC-MYST7-08: 「キャンセル」でモーダルが閉じ、変更は保存されない', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-inp-name').fill('変更しない')
    await page.locator('#edit-menu-modal .btn-modal-cancel').click()
    await expect(page.locator('#edit-menu-modal')).toHaveCount(0)
    await expect(page.locator('.detail-name')).toHaveText('ベンチプレス')
  })

  test('TC-MYST7-09: 保存成功時にトーストが表示される', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-inp-name').fill('ダンベルプレス')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('#toast')).toContainText('ダンベルプレス')
  })

  test('TC-MYST7-10: 有酸素運動を選択すると種別セクションが非表示になる', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-sel-cat').selectOption('有酸素運動')
    await expect(page.locator('#edit-type-section')).toBeHidden()
  })

  test('TC-MYST7-11: 背景クリックでモーダルが閉じる', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-menu-modal').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#edit-menu-modal')).toHaveCount(0)
  })

  test('TC-MYST7-12: メニュー名が空だと保存できない', async ({ page }) => {
    await openModal(page)
    await page.locator('#edit-inp-name').fill('')
    await page.locator('#edit-menu-modal .btn-modal-save').click()
    await expect(page.locator('#toast')).toContainText('メニュー名を入力してください')
    await expect(page.locator('#edit-menu-modal')).toHaveClass(/show/)
  })
})

test.describe('MYST-30: セッション削除', () => {
  test.beforeEach(async ({ page, db }) => {
    const id = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(id, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await db.session(id, todayStr(-1), [[70, 10]])
    await openApp(page, `/menus/${id}`)
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(2)
  })

  test('TC-30-01: セッション履歴の各行に削除ボタンが表示される', async ({ page }) => {
    await expect(page.locator('.hist-table tbody tr .btn-del').first()).toBeVisible()
  })

  test('TC-30-02: セッション削除後に履歴テーブルの行数が1件減る', async ({ page }) => {
    page.once('dialog', (d) => void d.accept())
    await page.locator('.hist-table tbody tr .btn-del').first().click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(1)
  })

  test('TC-30-03: セッション削除後にトーストが表示される', async ({ page }) => {
    page.once('dialog', (d) => void d.accept())
    await page.locator('.hist-table tbody tr .btn-del').first().click()
    await expect(page.locator('#toast')).toContainText('削除しました')
  })

  test('TC-30-04: 全セッション削除後にメニュー詳細で空状態メッセージが表示される', async ({
    page,
  }) => {
    page.on('dialog', (d) => void d.accept())
    await page.locator('.hist-table tbody tr .btn-del').first().click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(1)
    await page.locator('.hist-table tbody tr .btn-del').first().click()
    await expect(page.locator('#detail-body .empty-state')).toBeVisible()
  })

  test('TC-30-05: 削除確認ダイアログをキャンセルするとセッションが残る', async ({ page }) => {
    page.once('dialog', (d) => void d.dismiss())
    await page.locator('.hist-table tbody tr .btn-del').first().click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(2)
  })
})

test.describe('MYST-31: 自重運動のセッション画面', () => {
  let menuId: string

  test.beforeEach(async ({ db }) => {
    menuId = await db.menu({ category: '足', type: '自重運動', name: 'スクワット' })
  })

  test('TC-31-01: 新規セッション画面で重量入力欄が表示されない', async ({ page }) => {
    await openApp(page, `/menus/${menuId}/sessions/new`)
    await expect(page.locator('#inp-r')).toBeVisible()
    await expect(page.locator('#inp-w')).toHaveCount(0)
  })

  test('TC-31-02/03: 回数のみ入力でセット追加ボタンが活性になる', async ({ page }) => {
    await openApp(page, `/menus/${menuId}/sessions/new`)
    await expect(page.locator('#btn-add-set')).toBeDisabled()
    await page.locator('#inp-r').fill('10')
    await expect(page.locator('#btn-add-set')).toBeEnabled()
  })

  test('TC-31-05〜07: セット一覧は「○回」形式で、1RM表示がなく、複数セットを記録できる', async ({
    page,
  }) => {
    await openApp(page, `/menus/${menuId}/sessions/new`)
    await page.locator('#inp-r').fill('10')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-row')).toHaveCount(1)
    await page.locator('#inp-r').fill('15')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-row')).toHaveCount(2)

    await expect(page.locator('.set-main').first()).toContainText('10 回')
    const texts = await page.locator('.set-main').allTextContents()
    expect(texts.every((t) => !t.includes('kg'))).toBe(true)
    await expect(page.locator('.set-sub')).toHaveCount(0)
  })
})

test.describe('BW-DET: 自重メニュー詳細', () => {
  test.beforeEach(async ({ page, db }) => {
    const id = await db.menu({ category: '足', type: '自重運動', name: 'スクワット' })
    await db.session(id, todayStr(), [
      [0, 10],
      [0, 15],
    ])
    await openApp(page, `/menus/${id}`)
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
  })

  test('TC-BW-DET-01〜03: 統計に「セッション数」だけが表示される（最大1RM・最大ボリュームなし）', async ({
    page,
  }) => {
    const labels = await page.locator('.stat-label').allTextContents()
    expect(labels).toEqual(['セッション数'])
  })

  test('TC-BW-DET-04〜06: 履歴テーブルは「日付・セット数・総回数」の列だけ', async ({ page }) => {
    const headers = (await page.locator('.hist-table thead th').allTextContents()).filter(Boolean)
    expect(headers).toEqual(['日付', 'セット数', '総回数'])
  })

  test('TC-BW-DET-07: 履歴に正しい総回数が表示される（10+15=25回）', async ({ page }) => {
    await expect(page.locator('.hist-table tbody tr').first().locator('.td-vol')).toContainText(
      '25 回',
    )
  })
})
