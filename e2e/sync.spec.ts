// TC-SYNC系: 他の経路（MCP/Claude・別の端末）で書いたデータの取り込み、書き込みの整合性
import { expect, openApp, test, todayStr } from './fixtures'

test('TC-SYNC-01: アプリを開いたまま外部で追加された記録が、画面に戻ったとき(フォーカス)に反映される', async ({
  page,
  db,
}) => {
  // 時間を進めて「古いデータ」の状態を作る（再取得は、取得から一定時間が経ったときに行われる）
  await page.clock.install()
  const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
  await openApp(page, '/')
  await expect(page.locator('#dash-recent .empty-title')).toBeVisible()

  // MCP(Claude)が record_set で書き込んだ想定
  await db.session(menuId, todayStr(), [[80, 10]])
  await page.clock.fastForward(20_000)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))

  await expect(page.locator('#dash-recent .dash-recent-row')).toHaveCount(1)
  await expect(page.locator('#dash-recent')).toContainText('1セット')
})

test('TC-SYNC-02: 起動(再読み込み)のたびに、保存済みのキャッシュを表示しつつ最新のデータを取り直す', async ({
  page,
  db,
}) => {
  const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
  await openApp(page, '/menus')
  await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス'])
  await expect.poll(async () => (await db.count('exercises')) === 1).toBe(true)

  // 別の経路でメニューが増えた状態で、すぐに再読み込みしても反映される（時間が経っていなくても）
  await db.menu({ category: '背中', name: 'ラットプルダウン' })
  await db.session(menuId, todayStr(), [[60, 10]])
  await page.reload()
  await expect(page.locator('.menu-row-name')).toHaveCount(2)
})

test('TC-SYNC-03: record_set RPC(MCPと同じ経路)で追加したセットが、PWAのセット記録でも連番になる', async ({
  page,
  db,
}) => {
  const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
  // MCPが同じ種目・同じ日に1セット記録した状態
  const { data } = await db.client.rpc('record_set', {
    p_exercise_id: menuId,
    p_date: todayStr(),
    p_time: '07:00',
    p_weight_kg: 60,
    p_reps: 10,
  })
  const sessionId = data![0].session_id
  await openApp(page, `/menus/${menuId}/sessions/${sessionId}`)
  await expect(page.locator('.set-row')).toHaveCount(1)

  await page.locator('#inp-w').fill('65')
  await page.locator('#inp-r').fill('8')
  await page.locator('#btn-add-set').click()
  await expect(page.locator('.set-row')).toHaveCount(2)
  const { data: sets } = await db.client
    .from('sets')
    .select('set_no')
    .eq('session_id', sessionId)
    .order('set_no')
  expect(sets!.map((s) => s.set_no)).toEqual([1, 2])
})

test('TC-SYNC-04: 取得に失敗した書き込みは、画面を変えずエラーを知らせる（通信エラー）', async ({
  page,
  db,
}) => {
  const menuId = await db.menu({ category: '胸', name: 'ベンチプレス' })
  await openApp(page, `/menus/${menuId}/sessions/new`)
  // Supabaseへの書き込み(record_set)だけを失敗させる
  await page.route('**/rest/v1/rpc/record_set', (route) => route.abort('failed'))
  await page.locator('#inp-w').fill('80')
  await page.locator('#inp-r').fill('10')
  await page.locator('#btn-add-set').click()
  await expect(page.locator('#toast')).toContainText('保存に失敗しました')
  await expect(page.locator('.set-row')).toHaveCount(0) // 画面には反映されない
  expect(await db.count('sets')).toBe(0)
  // 生のエラー詳細(Failed to fetch 等)は画面に出さない
  await expect(page.locator('#toast')).not.toContainText('fetch')
  // 入力はそのまま残り、再試行できる
  await expect(page.locator('#inp-w')).toHaveValue('80')
  await page.unroute('**/rest/v1/rpc/record_set')
  await page.locator('#btn-add-set').click()
  await expect(page.locator('.set-row')).toHaveCount(1)
})

test('TC-SYNC-05: 並び替えの保存に失敗したら、元の並びに戻してエラーを知らせる', async ({
  page,
  db,
}) => {
  await db.menu({ category: '胸', name: 'ベンチプレス', sortOrder: 0 })
  await db.menu({ category: '胸', name: 'ペックフライ', sortOrder: 1 })
  await openApp(page, '/menus')
  await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス', 'ペックフライ'])
  await page.route('**/rest/v1/exercises?*', (route) =>
    route.request().method() === 'PATCH' ? route.abort('failed') : route.continue(),
  )
  const handle = page.locator('.menu-row-handle').first()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 10, box.y + 120, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('#toast')).toContainText('並び順の保存に失敗しました')
  await expect(page.locator('.menu-row-name')).toHaveText(['ベンチプレス', 'ペックフライ'])
})
