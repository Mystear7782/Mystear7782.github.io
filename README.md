# Workout tracker

筋トレ・体重・食事を記録するPWA（iPhoneのホーム画面で使う）。データはSupabase、Claudeからの読み書きはMCPサーバー（Supabase Edge Function）。

- 公開URL: https://mystear7782.github.io/
- 技術: Vite + React 19 + TypeScript / TanStack Query / Supabase / Chart.js / vite-plugin-pwa
- 設計書: [`docs/`](docs/)（基本設計 `basic-design.md`、DB `db-design.md`、MCP `mcp-design.md`、旧版との差分 `migration-diff.md` ほか）

## 必要なもの

- Node.js 22.12 以上
- Docker Desktop（ローカルのSupabaseとE2Eテスト用）
- Supabase CLI（`npx supabase` でも可）

## セットアップ

```bash
npm ci
```

アプリは既定で本番のSupabaseに接続する（`src/lib/supabase.ts`。publishable key は公開前提のキー）。ローカルのSupabaseに向けたいときは `.env.local`（コミットしない）に次を書く。

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<npx supabase status -o env の ANON_KEY>
```

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://localhost:5173） |
| `npm run build` | 型チェック + 本番ビルド（`dist/`。CSP・`sw.js` を含む） |
| `npm run preview` | ビルド結果の確認 |
| `npm run typecheck` / `lint` / `format:check` | 型チェック / ESLint / Prettier |
| `npm test` | ユニット・コンポーネントテスト（Vitest） |
| `npm run test:e2e` | E2E（Playwright。ローカルSupabaseが必要） |
| `npm run gen:types` | ローカルDBからDB型を生成（`src/types/database.ts` と MCP側） |
| `npx supabase test db` | DBテスト（pgTAP） |

## ローカルのSupabase

```bash
# 初回のみ: ローカル用のJWT署名鍵を作る（config.toml が参照。リポジトリには入れない）
npx supabase gen signing-key --algorithm ES256
#   出力を [ ... ] で囲んだJSON配列として supabase/signing_keys.json に保存する

npx supabase start        # マイグレーションが適用された状態で起動
npx supabase db reset     # ローカルDBを作り直す
```

E2Eは起動中のローカルSupabase（`npx supabase status -o env` から接続情報を読む）に、テストごとに新しいユーザーを作って実行する。**本番には接続しない。**

## 本番DBの変更

マイグレーション（`supabase/migrations/`）を本番へ反映するのは `npx supabase db push`。実行前にSQLを確認する。Service Role Key（secret key）・DBパスワード・署名鍵はコミットしない。

## デプロイ

`main` へ push すると GitHub Actions（`.github/workflows/deploy.yml`）がビルドして GitHub Pages に公開する。前提: リポジトリの Settings > Pages > Source を「GitHub Actions」にしておく。手順は `docs/basic-design.md` の「デプロイ・運用」を参照。

## ディレクトリ

```
src/        アプリ本体（features/ 画面別、api/ データ層、lib/ 共通処理、sw/ Service Worker）
public/     アイコン、OAuth同意画面（oauth-consent.html）
e2e/        Playwright E2E
supabase/   マイグレーション、pgTAP、MCPサーバー（functions/mcp）
legacy/     旧アプリ（素のJS版）。参照用
docs/       設計書
```
