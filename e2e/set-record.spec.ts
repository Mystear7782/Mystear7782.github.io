// TC-04系（セット記録・筋トレ）・TC-06系（メニュー詳細・統計）
import { expect, openApp, test, todayStr } from './fixtures'

test.describe('TC-04: セット記録', () => {
  let menuId: string

  test.beforeEach(async ({ page, db }) => {
    menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await openApp(page, `/menus/${menuId}`)
    await page.locator('button.btn-action.new-sess').click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-04-01: 重量と回数を入力してセットを追加できる', async ({ page, db }) => {
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('10')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-main', { hasText: '80 kg × 10 回' })).toBeVisible()
    expect(await db.count('sets')).toBe(1)
    expect(await db.count('workout_sessions')).toBe(1)
  })

  test('TC-04-02: 推定1RMプレビューが正しい値（80kg×10回=100kg）を表示する', async ({ page }) => {
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('10')
    await expect(page.locator('#orm-prev')).toContainText('100 kg')
  })

  test('TC-04-03: 重量未入力時にセット追加ボタンが非活性', async ({ page }) => {
    await page.locator('#inp-r').fill('10')
    await expect(page.locator('#btn-add-set')).toBeDisabled()
  })

  test('TC-04-04: 回数未入力時にセット追加ボタンが非活性', async ({ page }) => {
    await page.locator('#inp-w').fill('80')
    await expect(page.locator('#btn-add-set')).toBeDisabled()
  })

  test('TC-04-05: 重量・回数入力後にセット追加ボタンが活性', async ({ page }) => {
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('10')
    await expect(page.locator('#btn-add-set')).toBeEnabled()
  })

  test('TC-04-06: 重量0でボタンが非活性', async ({ page }) => {
    await page.locator('#inp-w').fill('0')
    await page.locator('#inp-r').fill('10')
    await expect(page.locator('#btn-add-set')).toBeDisabled()
  })

  test('TC-04-07: 回数0でボタンが非活性', async ({ page }) => {
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('0')
    await expect(page.locator('#btn-add-set')).toBeDisabled()
  })

  test('TC-04-08: 重量0.5kg（最小刻み）でボタンが活性', async ({ page }) => {
    await page.locator('#inp-w').fill('0.5')
    await page.locator('#inp-r').fill('5')
    await expect(page.locator('#btn-add-set')).toBeEnabled()
  })

  test('TC-04-12: セッション日付を変更し、最初のセット保存でその日付のセッションが作られる', async ({
    page,
    db,
  }) => {
    await page.locator('#sess-date').fill('2026-01-01')
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('10')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-main')).toHaveCount(1)
    const { data } = await db.client.from('workout_sessions').select('session_date')
    expect(data).toEqual([{ session_date: '2026-01-01' }])
  })

  test('TC-04-13: セッション時刻を変更し、最初のセット保存でその時刻のセッションが作られる', async ({
    page,
    db,
  }) => {
    await page.locator('#sess-time').fill('14:30')
    await page.locator('#inp-w').fill('80')
    await page.locator('#inp-r').fill('10')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-main')).toHaveCount(1)
    const { data } = await db.client.from('workout_sessions').select('session_time')
    expect(data).toEqual([{ session_time: '14:30' }])
  })

  test('TC-04-15: 何も記録せずに戻ると、サーバーに空のセッションが残らない', async ({
    page,
    db,
  }) => {
    await page.locator('#set-back').click()
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
    expect(await db.count('workout_sessions')).toBe(0)
  })

  test('TC-04-16: 日付・時刻だけ変えても、セット保存までセッションは作られない', async ({
    page,
    db,
  }) => {
    await page.locator('#sess-date').fill('2026-02-02')
    await page.locator('#sess-time').fill('09:15')
    expect(await db.count('workout_sessions')).toBe(0)
  })
})

test.describe('TC-04: 記録済みセッションの編集', () => {
  let menuId: string
  let sessionId: string

  test.beforeEach(async ({ page, db }) => {
    menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    sessionId = await db.session(menuId, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, `/menus/${menuId}/sessions/${sessionId}`)
    await expect(page.locator('.set-row')).toHaveCount(2)
  })

  test('TC-04-09: セット行タップで編集モードに切り替わる', async ({ page }) => {
    await page.locator('.set-row').first().click()
    await expect(page.locator('.set-row.editing')).toBeVisible()
    await expect(page.locator('#form-label')).toContainText('編集中')
  })

  test('TC-04-10: 編集内容を保存するとセット一覧に反映される', async ({ page, db }) => {
    await page.locator('.set-row').first().click()
    await page.locator('#inp-w').fill('90')
    await page.locator('#inp-r').fill('5')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-main', { hasText: '90 kg × 5 回' })).toBeVisible()
    const { data } = await db.client.from('sets').select('weight_kg, reps').eq('set_no', 1)
    expect(data).toEqual([{ weight_kg: 90, reps: 5 }])
  })

  test('TC-04-11: セットを削除するとセット一覧から消える', async ({ page, db }) => {
    page.on('dialog', (d) => void d.accept())
    await page.locator('.btn-del').first().click()
    await expect(page.locator('.set-row')).toHaveCount(1)
    expect(await db.count('sets')).toBe(1)
  })

  test('TC-04-14: 同じ日に新規セッションを2つ作成できる（履歴は2行）', async ({ page, db }) => {
    await page.locator('#set-back').click()
    await page.locator('button.btn-action.new-sess').click()
    await page.locator('#inp-w').fill('70')
    await page.locator('#inp-r').fill('12')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-main')).toHaveCount(1)
    await page.locator('#set-back').click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(2)
    expect(await db.count('workout_sessions')).toBe(2)
  })

  test('TC-04-17: 開いている(古い)セッションに追加すると、そのセッションに入る', async ({
    page,
    db,
  }) => {
    // 同じ日により新しいセッションがあっても、開いているセッションの末尾(set_no=3)に追加される
    await db.session(menuId, todayStr(), [[50, 5]])
    await page.locator('#inp-w').fill('60')
    await page.locator('#inp-r').fill('6')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-row')).toHaveCount(3)
    const { data } = await db.client
      .from('sets')
      .select('set_no')
      .eq('session_id', sessionId)
      .order('set_no')
    expect(data!.map((r) => r.set_no)).toEqual([1, 2, 3])
  })

  test('TC-04-18: 保存済みセッションの日付を変更するとDBにも反映される', async ({ page, db }) => {
    await page.locator('#sess-date').fill('2026-03-03')
    await expect
      .poll(async () => {
        const { data } = await db.client
          .from('workout_sessions')
          .select('session_date')
          .eq('id', sessionId)
          .single()
        return data?.session_date
      })
      .toBe('2026-03-03')
  })

  test('TC-04-19: セットを削除して追加しても set_no が重複しない', async ({ page, db }) => {
    page.on('dialog', (d) => void d.accept())
    await page.locator('.btn-del').first().click()
    await expect(page.locator('.set-row')).toHaveCount(1)
    await page.locator('#inp-w').fill('60')
    await page.locator('#inp-r').fill('6')
    await page.locator('#btn-add-set').click()
    await expect(page.locator('.set-row')).toHaveCount(2)
    const { data } = await db.client
      .from('sets')
      .select('set_no')
      .eq('session_id', sessionId)
      .order('set_no')
    expect(data!.map((r) => r.set_no)).toEqual([2, 3])
  })
})

test.describe('TC-06: メニュー詳細・統計', () => {
  let menuId: string

  test.beforeEach(async ({ page, db }) => {
    menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, `/menus/${menuId}`)
    await expect(page.locator('#page-menu-detail.active')).toBeVisible()
  })

  test('TC-06-01: セット記録後にメニュー詳細で最大1RMが整数表示される', async ({ page }) => {
    // 85×(1+8/40)=102.0 → 102
    await expect(page.locator('.stat-val').first()).toContainText('102')
  })

  test('TC-06-02: セット記録後にメニュー詳細で最大ボリュームが表示される', async ({ page }) => {
    // 80×10 + 85×8 = 1480
    const vals = await page.locator('.stat-val').allTextContents()
    expect(vals.some((v) => v.includes('1480'))).toBe(true)
  })

  test('TC-06-03: セッション履歴テーブルに記録日・セット数・1RMが表示される', async ({ page }) => {
    const row = page.locator('.hist-table tbody tr').first()
    await expect(row.locator('.td-date')).toBeVisible()
    await expect(row.locator('.td-1rm')).toBeVisible()
    await expect(row).toContainText('2セット')
  })

  test('TC-06-04: 履歴テーブルの行をタップするとセット記録画面に遷移する', async ({ page }) => {
    await page.locator('.hist-table tbody tr.clickable').first().click()
    await expect(page.locator('#page-set-edit.active')).toBeVisible()
  })

  test('TC-06-05: 履歴の✕でセッションを削除できる（確認ダイアログあり）', async ({ page, db }) => {
    page.once('dialog', (d) => void d.accept())
    await page.locator('.hist-table .btn-del').first().click()
    await expect(page.locator('#toast')).toContainText('セッションを削除しました')
    await expect(page.locator('.hist-table')).toHaveCount(0)
    expect(await db.count('workout_sessions')).toBe(0)
  })

  test('TC-06-06: 削除確認ダイアログをキャンセルするとセッションは残る', async ({ page, db }) => {
    page.once('dialog', (d) => void d.dismiss())
    await page.locator('.hist-table .btn-del').first().click()
    await expect(page.locator('.hist-table tbody tr')).toHaveCount(1)
    expect(await db.count('workout_sessions')).toBe(1)
  })
})
