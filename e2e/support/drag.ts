// 並び替え用のつまみ(ドラッグハンドル)を、マウスで縦にドラッグする。
import type { Locator, Page } from '@playwright/test'

/**
 * つまみをつかんで、縦方向に dy px 動かして離す。
 * 4px以上動かすとドラッグが始まり、他の行の中心を越えると並びが入れ替わる。
 */
export async function dragHandle(page: Page, handle: Locator, dy: number): Promise<void> {
  const box = await handle.boundingBox()
  if (!box) throw new Error('つまみの位置を取得できません')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy / 2, { steps: 5 })
  await page.mouse.move(x, y + dy, { steps: 10 })
  await page.mouse.up()
}
