// deno-lint-ignore-file no-explicit-any -- JSON-RPCの応答を緩い型で扱うテストコードのため
// MCPサーバーをHTTP経由で呼ぶテスト（`npx supabase functions serve mcp` が起動している前提）。
// 対応する受け入れ基準: AC-1(認証のうち401とWWW-Authenticate) / AC-8(ツール注釈・table enum)
// 実際のClaude（OAuthのDCR・同意画面）を介した確認は docs/mcp-acceptance.md の手順書で行う。
import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { newUser, URL_ } from './helpers.ts'

const MCP_URL = Deno.env.get('MCP_URL') ?? `${URL_()}/functions/v1/mcp`

type JsonRpc = { jsonrpc: '2.0'; id?: number; method: string; params?: unknown }

async function rpc(token: string | null, body: JsonRpc): Promise<{ status: number; headers: Headers; json: any }> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  if (text) {
    // 応答は JSON または SSE(`data: {...}`)のどちらでも返りうる
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'))
    try {
      json = JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
    } catch { /* JSONでない応答はjson=nullのまま */ }
  }
  return { status: res.status, headers: res.headers, json }
}

Deno.test('AC-1: トークン無しは401で、WWW-Authenticate に resource_metadata が付く', async () => {
  const r = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assertEquals(r.status, 401)
  const h = r.headers.get('www-authenticate') ?? ''
  assertStringIncludes(h, 'Bearer')
  assertStringIncludes(h, 'resource_metadata="')
  assertStringIncludes(h, '/oauth-protected-resource')
})

Deno.test('AC-1: 不正なトークンも401', async () => {
  const r = await rpc('not.a.jwt', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assertEquals(r.status, 401)
})

Deno.test('AC-1: oauth-protected-resource が認可サーバー(Supabase Auth)を指す', async () => {
  const res = await fetch(`${MCP_URL}/oauth-protected-resource`)
  assertEquals(res.status, 200)
  const doc = await res.json()
  assertStringIncludes(doc.resource, '/functions/v1/mcp')
  assert(doc.authorization_servers.some((s: string) => s.endsWith('/auth/v1')))
})

Deno.test('AC-8: tools/list に全ツールがあり、注釈とtable enumが仕様どおり', async () => {
  const { accessToken } = await newUser()
  const r = await rpc(accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assertEquals(r.status, 200)
  const tools: Record<string, any> = Object.fromEntries(r.json.result.tools.map((t: any) => [t.name, t]))

  assertEquals(Object.keys(tools).sort(), [
    'delete_menu_set', 'delete_record', 'get_exercise_history', 'get_meal_summary', 'get_weight_trend', 'insert_record',
    'list_exercises', 'list_menu_sets', 'list_records', 'log_body_weight', 'log_cardio', 'log_meal', 'log_workout_set',
    'save_menu_set', 'update_record',
  ])

  for (const n of ['list_exercises', 'list_menu_sets', 'get_meal_summary', 'get_weight_trend', 'get_exercise_history', 'list_records']) {
    assertEquals(tools[n].annotations.readOnlyHint, true, `${n} は readOnlyHint`)
  }
  for (const n of ['update_record', 'delete_record', 'delete_menu_set']) {
    assertEquals(tools[n].annotations.destructiveHint, true, `${n} は destructiveHint`)
    assertStringIncludes(tools[n].description, '確認')
  }
  for (const n of ['log_meal', 'log_body_weight', 'log_workout_set', 'log_cardio', 'insert_record', 'save_menu_set']) {
    assertEquals(tools[n].annotations.readOnlyHint, false)
    assertEquals(tools[n].annotations.destructiveHint, false)
  }
  for (const n of ['list_records', 'insert_record', 'update_record', 'delete_record']) {
    assertEquals(
      [...tools[n].inputSchema.properties.table.enum].sort(),
      ['body_weight_logs', 'cardio_logs', 'exercises', 'meal_logs', 'sets', 'workout_sessions'],
      `${n} の table enum`,
    )
  }
})

Deno.test('tools/call: log_meal をHTTP経由で呼べ、再送は二重登録にならない / 6テーブル外はエラー', async () => {
  const { accessToken, sb } = await newUser()
  const call = (name: string, args: unknown, id = 1) =>
    rpc(accessToken, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })

  const args = { date: '2026-10-01', meal_type: '朝', protein_g: 52, fat_g: 28, carb_g: 14 }
  const a = await call('log_meal', args)
  assertEquals(a.status, 200)
  const first = JSON.parse(a.json.result.content[0].text)
  assertEquals(first.row.calories_kcal, 52 * 4 + 28 * 9 + 14 * 4)
  const b = await call('log_meal', args, 2)
  assertEquals(JSON.parse(b.json.result.content[0].text).deduplicated, true)
  assertEquals((await sb.from('meal_logs').select('id')).data!.length, 1)

  // 6テーブル以外 → ツール呼び出しがエラー（入力検証）。JSON-RPCエラーまたは isError のどちらか
  const bad = await call('list_records', { table: 'auth.users', limit: 5 }, 3)
  assert(bad.json.error || bad.json.result?.isError, JSON.stringify(bad.json))
})
