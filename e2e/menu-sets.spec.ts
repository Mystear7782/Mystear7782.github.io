// TC-11系: メニューセット（作成・一覧・詳細・編集・削除・並び替え・旧データの移行）
import type { Page } from '@playwright/test'
import { dragHandle } from './support/drag'
import { expect, footerGo, openApp, test } from './fixtures'

const openSetList = async (page: Page) => {
  await openApp(page, '/')
  await footerGo(page, 'セット')
  await expect(page.locator('#page-menuset-list.active')).toBeVisible()
}

const newSetButton = (page: Page) => page.getByRole('button', { name: '＋ 新規セットを作成' })

test.describe('TC-11: メニューセットの作成', () => {
  test.beforeEach(async ({ page, db }) => {
    await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await openSetList(page)
  })

  test('TC-11-01: セットを作成すると一覧に表示される（DBにも保存される）', async ({ page, db }) => {
    await newSetButton(page).click()
    await expect(page.locator('#menuset-modal.show')).toBeVisible()
    await page.locator('#menuset-inp-name').fill('プッシュデー')
    await page.locator('#menuset-menu-checklist input[type=checkbox]').first().check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('.prog-card-name', { hasText: 'プッシュデー' })).toBeVisible()
    expect(await db.count('menu_sets')).toBe(1)
  })

  test('TC-11-02: セット名未入力時はトーストでエラー表示される', async ({ page }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-menu-checklist input[type=checkbox]').first().check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('#toast')).toContainText('セット名を入力してください')
  })

  test('TC-11-03: メニュー未選択時はトーストでエラー表示される', async ({ page }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-inp-name').fill('空セット')
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('#toast')).toContainText('メニューを1つ以上選択してください')
  })

  test('TC-11-04: 作成したセットはリロード後も保持される', async ({ page }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-inp-name').fill('保持テスト')
    await page.locator('#menuset-menu-checklist input[type=checkbox]').first().check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('.prog-card-name', { hasText: '保持テスト' })).toBeVisible()
    await page.reload()
    await expect(page.locator('.prog-card-name', { hasText: '保持テスト' })).toBeVisible()
  })

  test('TC-11-05: キャンセルするとセットは作成されない', async ({ page, db }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-inp-name').fill('キャンセルテスト')
    await page.locator('#menuset-modal .btn-modal-cancel').click()
    await expect(page.locator('#menuset-modal')).toHaveCount(0)
    await expect(page.locator('.prog-card-name', { hasText: 'キャンセルテスト' })).toHaveCount(0)
    expect(await db.count('menu_sets')).toBe(0)
  })

  test('TC-11-06: セット名にHTMLタグを含めても文字列としてそのまま表示される', async ({ page }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-inp-name').fill('<b>test</b>')
    await page.locator('#menuset-menu-checklist input[type=checkbox]').first().check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('.prog-card-name')).toContainText('<b>test</b>')
    expect(await page.locator('.prog-card-name b').count()).toBe(0)
  })

  test('TC-11-22: セット名は全角30文字までしか入力できない', async ({ page }) => {
    await newSetButton(page).click()
    await page.locator('#menuset-inp-name').fill('あ'.repeat(31))
    expect((await page.locator('#menuset-inp-name').inputValue()).length).toBe(30)
  })

  test('TC-11-23: アーカイブ済みのメニューはチェックリストに出ない', async ({ page, db }) => {
    await db.menu({ category: '背中', name: 'ラットプルダウン', archived: true })
    await page.reload()
    await footerGo(page, 'セット')
    await newSetButton(page).click()
    await expect(page.locator('#menuset-menu-checklist .menuset-check-row')).toHaveCount(1)
    await expect(page.locator('#menuset-menu-checklist')).not.toContainText('ラットプルダウン')
  })
})

test.describe('TC-11: メニューセットの一覧・詳細', () => {
  test('TC-11-07: セットをクリックすると含まれるメニューが表示される', async ({ page, db }) => {
    const m = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.menuSet('プッシュデー', [m])
    await openSetList(page)
    await page.locator('.prog-card').first().click()
    await expect(page.locator('#page-menuset-detail.active')).toBeVisible()
    await expect(
      page.locator('#menuset-detail-body .menu-row-name', { hasText: 'ベンチプレス' }),
    ).toBeVisible()
  })

  test('TC-11-08: セットカードにメニュー件数が表示される', async ({ page, db }) => {
    const m = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await db.menuSet('プッシュデー', [m])
    await openSetList(page)
    await expect(page.locator('.prog-card-meta', { hasText: '1件のメニュー' })).toBeVisible()
  })

  test('TC-11-09: セットが1件もない場合、空状態メッセージが表示される', async ({ page }) => {
    await openSetList(page)
    await expect(
      page.locator('.empty-title', { hasText: 'メニューセットがありません' }),
    ).toBeVisible()
  })

  test('TC-11-15: セットを1つも作らなくても、メニュー一覧は従来どおり動作する', async ({
    page,
    db,
  }) => {
    await db.menu({ category: '胸', name: 'ベンチプレス' })
    await openApp(page, '/menus')
    await expect(page.locator('.menu-row-name', { hasText: 'ベンチプレス' })).toBeVisible()
  })
})

test.describe('TC-11: メニューセットの編集・削除', () => {
  test.beforeEach(async ({ db }) => {
    const a = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.menu({ category: '足', type: 'フリーウェイト', name: 'スクワット' })
    await db.menuSet('プッシュデー', [a])
  })

  test('TC-11-10: 編集でセット名を変更できる', async ({ page }) => {
    await openSetList(page)
    await page.locator('.prog-card button', { hasText: '編集' }).click()
    await page.locator('#menuset-inp-name').fill('更新後の名前')
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('.prog-card-name', { hasText: '更新後の名前' })).toBeVisible()
  })

  test('TC-11-11: 編集モーダルに現在のセット名・選択メニューが初期入力されている', async ({
    page,
  }) => {
    await openSetList(page)
    await page.locator('.prog-card button', { hasText: '編集' }).click()
    await expect(page.locator('#menuset-inp-name')).toHaveValue('プッシュデー')
    const checks = page.locator('#menuset-menu-checklist input[type=checkbox]')
    await expect(checks.first()).toBeChecked() // ベンチプレス（胸）
    await expect(checks.nth(1)).not.toBeChecked() // スクワット
  })

  test('TC-11-12: 編集で含まれるメニューの選択を変更できる', async ({ page }) => {
    await openSetList(page)
    await page.locator('.prog-card button', { hasText: '編集' }).click()
    await page.locator('#menuset-menu-checklist input[type=checkbox]').nth(1).check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('#menuset-modal')).toHaveCount(0)
    await page.locator('.prog-card').first().click()
    await expect(
      page.locator('#menuset-detail-body .menu-row-name', { hasText: 'スクワット' }),
    ).toBeVisible()
    await expect(page.locator('#menuset-detail-body .menu-row')).toHaveCount(2)
  })

  test('TC-11-13: セットを削除すると一覧から消える', async ({ page, db }) => {
    await openSetList(page)
    page.once('dialog', (d) => void d.accept())
    await page.locator('.prog-card button', { hasText: '削除' }).click()
    await expect(page.locator('.prog-card-name', { hasText: 'プッシュデー' })).toHaveCount(0)
    expect(await db.count('menu_sets')).toBe(0)
    expect(await db.count('exercises')).toBe(2) // メニュー自体は消えない
  })

  test('TC-11-14: 削除確認ダイアログをキャンセルするとセットが残る', async ({ page }) => {
    await openSetList(page)
    page.once('dialog', (d) => void d.dismiss())
    await page.locator('.prog-card button', { hasText: '削除' }).click()
    await expect(page.locator('.prog-card-name', { hasText: 'プッシュデー' })).toBeVisible()
  })

  test('TC-11-24: メニューを完全削除すると、セット詳細からも消える（セット自体は残る）', async ({
    page,
    db,
  }) => {
    const { data } = await db.client
      .from('exercises')
      .select('id')
      .eq('name', 'ベンチプレス')
      .single()
    await db.client.from('exercises').delete().eq('id', data!.id)
    await openSetList(page)
    await page.locator('.prog-card').first().click()
    await expect(page.locator('#menuset-detail-body .empty-title')).toHaveText(
      'メニューがありません',
    )
  })
})

test.describe('TC-11: メニューセット詳細からの遷移', () => {
  test.beforeEach(async ({ page, db }) => {
    const m = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.menuSet('プッシュデー', [m])
    await openSetList(page)
    await page.locator('.prog-card').first().click()
    await expect(page.locator('#page-menuset-detail.active')).toBeVisible()
  })

  test('TC-11-16/17: セットカードでセット詳細に遷移し、メニュー一覧と同じ形式でメンバーが並ぶ', async ({
    page,
  }) => {
    await expect(page.locator('#menuset-detail-body')).toContainText('プッシュデー')
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText(['ベンチプレス'])
  })

  test('TC-11-18: メンバーメニューを押すとメニュー詳細に遷移する', async ({ page }) => {
    await page.locator('#menuset-detail-body .menu-row').first().click()
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    await expect(page.locator('.detail-name')).toContainText('ベンチプレス')
  })

  test('TC-11-19: セット経由で開いたメニュー詳細の戻るボタンはセット詳細に戻る', async ({
    page,
  }) => {
    await page.locator('#menuset-detail-body .menu-row').first().click()
    await expect(page.locator('#menu-detail-back-label')).toHaveText('セットに戻る')
    await page.locator('#menu-detail-back').click()
    await expect(page.locator('#page-menuset-detail.active')).toBeVisible()
  })

  test('TC-11-20: セット詳細の「セット一覧に戻る」で一覧に戻る', async ({ page }) => {
    await page.getByRole('button', { name: 'セット一覧に戻る' }).click()
    await expect(page.locator('#page-menuset-list.active')).toBeVisible()
  })
})

test('TC-11-21: メニュー一覧から直接開いた詳細の戻るボタンは「一覧に戻る」（リグレッション確認）', async ({
  page,
  db,
}) => {
  await db.menu({ category: '胸', name: 'ベンチプレス' })
  await openApp(page, '/menus')
  await page.locator('.menu-row').first().click()
  await expect(page.locator('#menu-detail-back-label')).toHaveText('一覧に戻る')
  await page.locator('#menu-detail-back').click()
  await expect(page.locator('#page-menu-list.active')).toBeVisible()
})

test('TC-11-20b: 「編集」ボタンはカードのクリックと衝突せず、モーダルだけが開く', async ({
  page,
  db,
}) => {
  const m = await db.menu({ category: '胸', name: 'ベンチプレス' })
  await db.menuSet('プッシュデー', [m])
  await openSetList(page)
  await page.locator('.prog-card button', { hasText: '編集' }).click()
  await expect(page.locator('#menuset-modal.show')).toBeVisible()
  await expect(page.locator('#page-menuset-detail')).toHaveCount(0)
})

test.describe('TC-11: メニューセット内の並び替え（つまみ）', () => {
  let setId: string

  test.beforeEach(async ({ page, db }) => {
    const a = await db.menu({ category: '胸', name: 'ベンチプレス' })
    const b = await db.menu({ category: '足', name: 'スクワット' })
    const c = await db.menu({ category: '背中', name: 'デッドリフト' })
    setId = await db.menuSet('フルボディ', [a, b, c])
    await openApp(page, `/menu-sets/${setId}`)
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText([
      'ベンチプレス',
      'スクワット',
      'デッドリフト',
    ])
  })

  test('TC-11-25: つまみをドラッグするとセット内の並びが変わり、DBに保存される', async ({
    page,
    db,
  }) => {
    const rows = page.locator('#menuset-detail-body .menu-row')
    await dragHandle(page, rows.nth(0).locator('.menu-row-handle'), 220)
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText([
      'スクワット',
      'デッドリフト',
      'ベンチプレス',
    ])
    await expect
      .poll(async () => {
        const { data } = await db.client
          .from('menu_set_items')
          .select('position, exercises(name)')
          .eq('menu_set_id', setId)
          .order('position')
        return data!.map((r) => (r.exercises as unknown as { name: string }).name)
      })
      .toEqual(['スクワット', 'デッドリフト', 'ベンチプレス'])
  })

  test('TC-11-26: 並び替えの結果はリロード後も保持される', async ({ page }) => {
    const rows = page.locator('#menuset-detail-body .menu-row')
    await dragHandle(page, rows.nth(2).locator('.menu-row-handle'), -220)
    await expect(page.locator('#menuset-detail-body .menu-row-name').first()).toHaveText(
      'デッドリフト',
    )
    // 保存の完了を待ってから再読み込みする
    await expect(page.locator('#top-progress.show')).toHaveCount(0)
    await page.waitForTimeout(300)
    await page.reload()
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText([
      'デッドリフト',
      'ベンチプレス',
      'スクワット',
    ])
  })

  test('TC-11-27: 並び替え後にセットを編集しても、並び順は保たれ新しいメニューは末尾に付く', async ({
    page,
    db,
  }) => {
    await db.menu({ category: '腕', name: 'ハンマーカール' })
    const rows = page.locator('#menuset-detail-body .menu-row')
    await dragHandle(page, rows.nth(0).locator('.menu-row-handle'), 220)
    await expect(page.locator('#menuset-detail-body .menu-row-name').last()).toHaveText(
      'ベンチプレス',
    )
    await expect(page.locator('#top-progress.show')).toHaveCount(0)
    await page.waitForTimeout(300)

    await openApp(page, '/menu-sets')
    await page.reload()
    await page.locator('.prog-card button', { hasText: '編集' }).click()
    await page
      .locator('#menuset-menu-checklist label', { hasText: 'ハンマーカール' })
      .locator('input')
      .check()
    await page.locator('#menuset-modal .btn-modal-save').click()
    await expect(page.locator('#menuset-modal')).toHaveCount(0)
    await page.locator('.prog-card').first().click()
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText([
      'スクワット',
      'デッドリフト',
      'ベンチプレス',
      'ハンマーカール',
    ])
  })
})

test.describe('TC-11: 旧アプリ（localStorage）のメニューセットの移行', () => {
  test('TC-11-28: 旧アプリのメニューセットがDBへ一度だけ移行される', async ({ page, db }) => {
    const a = await db.menu({ category: '胸', name: 'ベンチプレス' })
    const b = await db.menu({ category: '足', name: 'スクワット' })
    const legacy = [
      { id: 'mset_1', name: '旧セット1', menuIds: [b, a] },
      // 存在しないメニューを参照している項目は飛ばされ、メニューが残らないセットは移行されない
      { id: 'mset_2', name: '旧セット2', menuIds: [a, 'menu_deleted'] },
      { id: 'mset_3', name: '空になるセット', menuIds: ['menu_gone'] },
    ]
    await page.addInitScript((data) => {
      if (!localStorage.getItem('gl_menusets') && !localStorage.getItem('gl_menusets_migrated')) {
        localStorage.setItem('gl_menusets', JSON.stringify(data))
      }
    }, legacy)

    await openApp(page, '/menu-sets')
    await expect(page.locator('#toast')).toContainText('メニューセットを2件移行しました')
    await expect(page.locator('#toast')).toContainText('存在しないメニュー2件を除外')
    await expect(page.locator('.prog-card-name')).toHaveText(['旧セット1', '旧セット2'])
    expect(await db.count('menu_sets')).toBe(2)

    // 旧キーは「移行済み」に名前が変わり、元のデータは残る
    const keys = await page.evaluate(() => ({
      old: localStorage.getItem('gl_menusets'),
      migrated: localStorage.getItem('gl_menusets_migrated'),
    }))
    expect(keys.old).toBeNull()
    expect(JSON.parse(keys.migrated!)).toHaveLength(3)

    // 順序の保持: 旧セット1は スクワット → ベンチプレス
    await page.locator('.prog-card').first().click()
    await expect(page.locator('#menuset-detail-body .menu-row-name')).toHaveText([
      'スクワット',
      'ベンチプレス',
    ])

    // 再読み込みしても二重に移行されない
    await page.reload()
    await expect(page.locator('.menu-row-name').first()).toBeVisible()
    expect(await db.count('menu_sets')).toBe(2)
  })

  test('TC-11-29: DB側にすでにセットがある場合は、旧データを移行しない', async ({ page, db }) => {
    const a = await db.menu({ category: '胸', name: 'ベンチプレス' })
    await db.menuSet('すでにあるセット', [a])
    await page.addInitScript((id) => {
      localStorage.setItem(
        'gl_menusets',
        JSON.stringify([{ id: 'x', name: '旧セット', menuIds: [id] }]),
      )
    }, a)
    await openApp(page, '/menu-sets')
    await expect(page.locator('.prog-card-name')).toHaveText(['すでにあるセット'])
    expect(await db.count('menu_sets')).toBe(1)
  })
})
