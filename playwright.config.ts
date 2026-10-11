// E2Eテスト（Playwright）の設定。ローカルのSupabase（`npx supabase start`）に対して実行する。
// 本番のDB・本番のURLには一切接続しない。
//
// 接続先のURL/キーは、環境変数 E2E_SUPABASE_URL / E2E_SUPABASE_PUBLISHABLE_KEY / E2E_SUPABASE_SECRET_KEY が
// あればそれを使い、無ければ `npx supabase status -o env` から読み取る（キーはファイルに書かない）。
// secret keyは、テスト用ユーザーの作成にだけ使う（アプリ本体には渡さない）。
import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

function localSupabase(): { url: string; publishable: string; secret: string } {
  const fromEnv = {
    url: process.env.E2E_SUPABASE_URL,
    publishable: process.env.E2E_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.E2E_SUPABASE_SECRET_KEY,
  }
  if (fromEnv.url && fromEnv.publishable && fromEnv.secret) {
    return fromEnv as { url: string; publishable: string; secret: string }
  }
  const out = execSync('npx supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const get = (name: string) => {
    const m = out.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?`, 'm'))
    if (!m) throw new Error(`${name} を取得できません。npx supabase start 済みか確認してください。`)
    return m[1]
  }
  return { url: get('API_URL'), publishable: get('PUBLISHABLE_KEY'), secret: get('SECRET_KEY') }
}

const sb = localSupabase()
// ワーカープロセス（テスト本体）からも参照できるよう、環境変数に入れておく
process.env.E2E_SUPABASE_URL = sb.url
process.env.E2E_SUPABASE_PUBLISHABLE_KEY = sb.publishable
process.env.E2E_SUPABASE_SECRET_KEY = sb.secret

const DEV_PORT = 5173
const PREVIEW_PORT = 4173
const appEnv = { VITE_SUPABASE_URL: sb.url, VITE_SUPABASE_PUBLISHABLE_KEY: sb.publishable }

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // 通常の画面操作のテスト（開発サーバー）
      name: 'app',
      testIgnore: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${DEV_PORT}` },
    },
    {
      // Service Worker・オフライン・CSPのテスト（本番ビルドのプレビュー）
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${DEV_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: appEnv,
      timeout: 60_000,
    },
    {
      command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PREVIEW_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: appEnv,
      timeout: 120_000,
    },
  ],
})
