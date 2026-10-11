// ローカルSupabase（`npx supabase start` 済み）のスキーマから、DBの型を生成して2か所に書き出す。
//   - src/types/database.ts                      … Reactアプリ用
//   - supabase/functions/mcp/database.types.ts   … MCPサーバー(Edge Function)用
// Edge Functionはディレクトリ外のファイルを取り込めないため、同じ内容をコピーして持つ。
// マイグレーションを変更したら `npm run gen:types` で両方を更新すること。
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const out = execSync('npx supabase gen types typescript --local', {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
  .replace(/^﻿/, '')
  .replace(/\r\n/g, '\n')

for (const path of ['src/types/database.ts', 'supabase/functions/mcp/database.types.ts']) {
  writeFileSync(path, out, 'utf8')
  console.log(`wrote ${path} (${out.length} bytes)`)
}
