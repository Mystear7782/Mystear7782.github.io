// TC-08系: CSV出力・入力
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, openApp, test, todayStr } from './fixtures'

const BOM = '﻿'

const strengthCsv = (rows: string[]) =>
  BOM +
  'menu_name,category,type,date,session_id,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg\n' +
  rows.join('\n') +
  '\n'

async function importCsv(page: Page, content: string, name = 'import.csv') {
  await page.locator("input[type='file']").setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content, 'utf-8'),
  })
}

test.describe('TC-08: CSVエクスポート', () => {
  test('TC-08-01: 筋トレCSVエクスポートでダウンロードが発生する', async ({ page, db }) => {
    const menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, todayStr(), [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, '/csv')
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.csv-btn', { hasText: '筋トレ記録をエクスポート' }).click(),
    ])
    expect(dl.suggestedFilename()).toMatch(/^gymlog_strength_\d{4}-\d{2}-\d{2}\.csv$/)
    await expect(page.locator('#toast')).toContainText('筋トレCSVをエクスポートしました')
  })

  test('TC-08-02: 有酸素CSVエクスポートでダウンロードが発生する', async ({ page, db }) => {
    const menuId = await db.menu({ category: '有酸素運動', name: 'ランニング' })
    await db.cardio(menuId, todayStr(), { time: 30, dist: 5, cal: 300, hr: 140 })
    await openApp(page, '/csv')
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.csv-btn', { hasText: '有酸素運動記録をエクスポート' }).click(),
    ])
    expect(dl.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('TC-08-03: 筋トレメニューが0件でエクスポートするとエラートースト', async ({ page }) => {
    await openApp(page, '/csv')
    await page.locator('.csv-btn', { hasText: '筋トレ記録をエクスポート' }).click()
    await expect(page.locator('#toast')).toContainText('筋トレメニューがありません')
  })

  test('TC-08-04: 有酸素メニューが0件でエクスポートするとエラートースト', async ({ page }) => {
    await openApp(page, '/csv')
    await page.locator('.csv-btn', { hasText: '有酸素運動記録をエクスポート' }).click()
    await expect(page.locator('#toast')).toContainText('有酸素運動メニューがありません')
  })

  test('TC-08-10: 出力したCSVはBOM付きで、ヘッダー・セッション時刻・推定1RM・ボリュームを含む', async ({
    page,
    db,
  }) => {
    const menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチ"プレス' })
    const sid = await db.session(menuId, '2026-10-01', [[80, 10]], '07:30')
    await openApp(page, '/csv')
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.csv-btn', { hasText: '筋トレ記録をエクスポート' }).click(),
    ])
    const text = await readFile((await dl.path())!, 'utf-8')
    expect(text.startsWith(BOM)).toBe(true)
    const [header, row] = text.slice(1).split('\r\n')
    expect(header).toBe(
      'menu_name,category,type,date,session_id,session_time,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg',
    )
    // メニュー名の " は "" にエスケープされる（RFC4180）
    expect(row).toBe(`"ベンチ""プレス",胸,フリーウェイト,2026-10-01,${sid},07:30,1,80,10,100,800`)
  })

  test('TC-08-11: メニュー詳細の「CSV出力」でそのメニューだけを出力できる', async ({
    page,
    db,
  }) => {
    const a = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    const b = await db.menu({ category: '足', type: 'フリーウェイト', name: 'スクワット' })
    await db.session(a, todayStr(), [[80, 10]])
    await db.session(b, todayStr(), [[100, 5]])
    await openApp(page, `/menus/${a}`)
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV出力' }).click(),
    ])
    expect(dl.suggestedFilename()).toMatch(/^gymlog_ベンチプレス_/)
    const text = await readFile((await dl.path())!, 'utf-8')
    expect(text).toContain('ベンチプレス')
    expect(text).not.toContain('スクワット')
  })
})

test.describe('TC-08: CSVインポート', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/csv')
  })

  test('TC-08-05: 正常なCSVをインポートすると件数が表示される', async ({ page, db }) => {
    await importCsv(
      page,
      strengthCsv([
        '"スクワット",足,フリーウェイト,2026-03-01,sess_test_001,1,100,10,125.0,1000',
        '"スクワット",足,フリーウェイト,2026-03-01,sess_test_001,2,105,8,126.0,840',
      ]),
    )
    await expect(page.locator('#import-result')).toContainText('2件をインポートしました')
    await expect(page.locator('#import-result')).toContainText('未登録メニュー 1件を新規登録')
    expect(await db.count('workout_sessions')).toBe(1) // 同じsession_idは1セッションにまとまる
    expect(await db.count('sets')).toBe(2)
  })

  test('TC-08-06: インポート後にメニュー一覧に反映される', async ({ page }) => {
    await importCsv(
      page,
      strengthCsv(['"デッドリフト",背中,フリーウェイト,2026-03-10,sess_dl_001,1,120,5,129.0,600']),
    )
    await expect(page.locator('#import-result')).toContainText('インポートしました')
    await page.locator('#footer-nav .fn-item', { hasText: '記録' }).click()
    await expect(page.locator('.menu-row-name', { hasText: 'デッドリフト' })).toBeVisible()
  })

  test('TC-08-07: 同じ有酸素CSVを2回インポートすると、2回目はスキップ件数が表示される', async ({
    page,
    db,
  }) => {
    const csv =
      BOM +
      'menu_name,category,date,session_id,time_min,dist_km,cal_kcal,hr_bpm,max_spd_kmh,avg_spd_kmh\n' +
      '"ランニング",有酸素運動,2026-03-15,sess_dup_cardio_001,30,5.0,300,140,,\n'
    await importCsv(page, csv)
    await expect(page.locator('#import-result')).toContainText('インポートしました')
    await importCsv(page, csv, 'again.csv')
    await expect(page.locator('#import-result')).toContainText('スキップ')
    expect(await db.count('cardio_logs')).toBe(1)
  })

  test('TC-08-08: session_id空欄のCSVは、同日同メニューが同一セッションにまとめられる', async ({
    page,
    db,
  }) => {
    await importCsv(
      page,
      strengthCsv([
        '"レッグプレス",足,マシン,2026-03-20,,1,80,12,104.0,960',
        '"レッグプレス",足,マシン,2026-03-20,,2,85,10,106.25,850',
        '"レッグプレス",足,マシン,2026-03-20,,3,85,8,102.0,680',
      ]),
    )
    await expect(page.locator('#import-result')).toContainText('3件をインポートしました')
    expect(await db.count('workout_sessions')).toBe(1)
    expect(await db.count('sets')).toBe(3)
  })

  test('TC-08-09: menu_nameにHTMLタグを含むCSVでも、スクリプトは実行されず文字列として表示される', async ({
    page,
  }) => {
    let dialogOpened = false
    page.on('dialog', (d) => {
      dialogOpened = true
      void d.dismiss()
    })
    await importCsv(
      page,
      strengthCsv([
        '"<img src=x onerror=alert(1)>",胸,フリーウェイト,2026-03-25,sess_xss_001,1,60,10,75.0,600',
      ]),
    )
    await expect(page.locator('#import-result')).toContainText('インポートしました')
    await page.locator('#footer-nav .fn-item', { hasText: '記録' }).click()
    await expect(page.locator('.menu-row-name')).toContainText('<img src=x onerror=alert(1)>')
    expect(await page.locator('.menu-row-name img').count()).toBe(0)
    expect(dialogOpened).toBe(false)
  })

  test('TC-08-13: データが空のCSVはエラー表示', async ({ page }) => {
    await importCsv(page, BOM + 'menu_name,category,date\n')
    await expect(page.locator('#import-result')).toContainText('データが空です')
  })

  test('TC-08-14: 自重運動のメニューをCSVで取り込むと種別が反映される', async ({ page, db }) => {
    await importCsv(page, strengthCsv(['"懸垂",背中,自重運動,2026-03-01,,1,0,10,0,0']))
    await expect(page.locator('#import-result')).toContainText('インポートしました')
    const { data } = await db.client.from('exercises').select('name, category, type')
    expect(data).toEqual([{ name: '懸垂', category: '背中', type: '自重運動' }])
  })
})

test.describe('TC-08: 再インポート', () => {
  test('TC-08-12: エクスポートしたCSVをそのまま再インポートしても二重登録にならない', async ({
    page,
    db,
  }) => {
    const menuId = await db.menu({ category: '胸', type: 'フリーウェイト', name: 'ベンチプレス' })
    await db.session(menuId, '2026-10-01', [
      [80, 10],
      [85, 8],
    ])
    await openApp(page, '/csv')
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.csv-btn', { hasText: '筋トレ記録をエクスポート' }).click(),
    ])
    const content = await readFile((await dl.path())!, 'utf-8')
    await page.locator("input[type='file']").setInputFiles({
      name: 'export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(content, 'utf-8'),
    })
    await expect(page.locator('#import-result')).toContainText('重複 2件をスキップ')
    expect(await db.count('workout_sessions')).toBe(1)
    expect(await db.count('sets')).toBe(2)
  })
})
