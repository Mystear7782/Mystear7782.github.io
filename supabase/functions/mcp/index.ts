// Workout tracker MCP サーバー（Supabase Edge Function）
//
// 構成: Streamable HTTP / ステートレス（リクエストごとに McpServer を作る）。
// 認証: Supabase Auth を OAuth 2.1 サーバーとして使う。
//   1. トークン無しのアクセス → 401 + WWW-Authenticate(resource_metadata=…/oauth-protected-resource)
//   2. クライアント(Claude等)がDCRで登録 → 同意画面(oauth-consent.html)でユーザーが許可
//   3. ユーザー本人のアクセストークンで呼ばれる → ctx.supabase はそのユーザーのRLSが効く
// Service Role Key（secret key）は使わない。使うと auth.uid() が NULL になり、読み取りは0件、
// 書き込みは user_id の NOT NULL 違反になる。
import '@supabase/functions-js/edge-runtime.d.ts'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { pipeline } from '@supabase/middleware'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { Database } from './database.types.ts'
import { registerTools } from './tools/register.ts'

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase<Database>({ auth: 'user' })],
    (req, { supabase }) => {
      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: 'workout-tracker', version: '0.1.0' })
          registerTools(server, supabase)
          return server
        },
        { onerror: (error) => console.error('MCP request failed', error) },
      )
      return handler.fetch(req)
    },
  ),
)
