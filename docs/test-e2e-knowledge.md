# Workout tracker テスト環境ナレッジ

## 改訂履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0〜1.x | 2026-03〜08 | 旧版（Python + pytest + Playwright、localStorage前提）のE2E環境構築手順 |
| 2.0 | 2026-10-11 | **全面改訂**。TypeScript + Playwright（ローカルSupabase）、Vitest、pgTAP、CI。旧Python手順は廃止 |

---

## 1. テストの種類と実行方法

| 種類 | コマンド | 前提 | 対象 |
|---|---|---|---|
| 型チェック | `npm run typecheck` | — | `tsc -b` |
| lint / フォーマット | `npm run lint` / `npm run format:check` | — | ESLint / Prettier |
| ユニット・コンポーネント | `npm test`（監視は `npm run test:watch`） | — | Vitest + Testing Library（jsdom）。`src/**/*.test.{ts,tsx}` |
| DB | `npx supabase test db` | ローカルSupabase起動 | pgTAP（`supabase/tests/database/*.sql`） |
| E2E | `npm run test:e2e` | ローカルSupabase起動 | Playwright（`e2e/*.spec.ts`） |
| MCP | `supabase/functions/mcp/` 内で `deno task test` | Deno + ローカルSupabase | `docs/mcp-acceptance.md` |

CI（`.github/workflows/ci.yml`）は、push / プルリクエストのたびに check（型・lint・フォーマット・ユニット・ビルド）、database（pgTAP）、e2e（Playwright）の3ジョブを実行する。デプロイは `deploy.yml`（main への push）。

## 2. 前提条件

- Node.js 22.12 以上、`npm ci` 済み
- Docker Desktop が起動していること
- Supabase CLI（`npx supabase`）
- ローカル用JWT署名鍵 `supabase/signing_keys.json`（`config.toml` が参照。秘密鍵のためコミットしない。README参照）

```bash
npx supabase start               # 初回は数分。マイグレーション適用済みで起動
npx playwright install chromium  # 初回のみ
npm run test:e2e
```

E2Eは **ローカルのSupabaseにだけ接続する**。接続情報は環境変数 `E2E_SUPABASE_URL` / `E2E_SUPABASE_PUBLISHABLE_KEY` / `E2E_SUPABASE_SECRET_KEY` があればそれを、無ければ `npx supabase status -o env` から読む（キーをファイルに書かない）。本番のURLやキーを渡さないこと。

## 3. Playwrightの構成（`playwright.config.ts`）

| 項目 | 内容 |
|---|---|
| プロジェクト `app` | 開発サーバー（`http://127.0.0.1:5173`）。`pwa.spec.ts` 以外 |
| プロジェクト `pwa` | 本番ビルドを `dist-e2e/` に出力し `vite preview`（`http://127.0.0.1:4173`）で配信。`pwa.spec.ts` のみ（Service Worker・CSPは本番ビルドでしか検証できない） |
| 並列 | `fullyParallel`。ローカル4 / CI 2 ワーカー |
| リトライ | CIのみ1回 |
| 失敗時の成果物 | トレース（`retain-on-failure`）、スクリーンショット。CIでは `playwright-report/` と `test-results/` をアーティファクトに保存 |
| アプリの接続先 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` をローカルに向けて起動 |

## 4. ディレクトリ構成

```
e2e/
├── fixtures.ts              test / expect の拡張（user, db, ログイン済みの page）と openApp / sidebarGo / footerGo / todayStr
├── support/supabase.ts      createTestUser（管理APIでユーザー作成+サインイン）, Seeder（本人の権限でデータ投入）
├── support/drag.ts          dragHandle（つまみのポインタ操作）
└── *.spec.ts                機能別のテスト（docs/test-cases-e2e.md）
```

### フィクスチャ

| 名前 | 内容 |
|---|---|
| `user` | テストごとに新しく作ったユーザー（メール・パスワード・ログイン済みセッション）。テスト同士のデータは分離される |
| `db` | `Seeder`。ユーザー本人のアクセストークンで、画面を介さずメニュー・セッション・体重・食事を投入する |
| `page` | `user` のセッションを `localStorage`（`sb-<ref>-auth-token`）に仕込んだページ。アプリより先に `addInitScript` で入れ、ログアウト後の再読み込みで復活しないよう一度だけ入れる |

secret key はこのテストコード（ユーザー作成）でだけ使う。アプリ・リポジトリ・CIには入れない（CIではローカルSupabaseが払い出す一時のキー）。

## 5. テストの書き方・ルール

1. ファイルは機能別の `e2e/<機能>.spec.ts`。テスト名は `TC-<系統>-<連番>: 内容`（`docs/test-cases-e2e.md`）。
2. 要素は、旧版から引き継いだID・クラス（`#page-*`, `.page.active`, `#toast`, `.show`）と、ロール/テキストで取得する。固定待ち（sleep）は使わず、ロケーターの自動待機と `expect` を使う。
3. `page` の `class` は完全一致で比較しない（`toHaveClass(/active/)` など）。
4. データは `db`（Seeder）で投入する。**画面を開いた後にDBへ直接投入する場合は、再読み込みや画面復帰を挟む**。TanStack Queryのキャッシュが古いままで、投入したデータが画面に出ないため。可能なら画面を開く前に投入する。
5. ドラッグ（並び替え）は `dragHandle` を使う。3行以上を動かすときは移動量を220px以上にする（短いと隣の行の途中で止まる）。
6. 画面復帰の再取得は、`window` に `visibilitychange`（`document` ではなく `window`）を dispatch して起こす（TC-SYNC）。
7. 書き込みの失敗を検証するときは、`page.route` で Supabase へのリクエストを失敗させる。
8. 本番ビルドでしか検証できないこと（Service Worker・オフライン・CSP）は `pwa.spec.ts` に書く。

## 6. PWA（Service Worker）のテストの注意

- Service Worker は `dist-e2e` のビルドを配信するプロジェクト `pwa` でのみ有効。`app`（開発サーバー）では登録されない。
- オフラインの再現は `context.setOffline(true)`。キャッシュ照合に `Vary: Origin` が影響する問題（`ignoreVary`）は、オフライン再読み込みのテスト（TC-PWA-04）で守られている。
- ネットワーク遅延（3秒超）の再現は、`page.route` で応答を遅らせる（TC-PWA-08）。
- Supabaseの応答が Service Worker のキャッシュに入っていないことは、Cache Storage の中身を検査して確認する（TC-PWA-03）。

## 7. Vitest

- 環境は jsdom、`globals: true`、セットアップは `src/test/setup.ts`。
- 純粋関数（`lib/`）は単体テスト、画面部品は Testing Library（`LoginPage`, `RmPage`, `MenuFields`, `useSortable`）。
- Service Worker は判定ロジック（`sw/routing.ts`）とキャッシュ削除（`legacyCaches.ts`）をテストする。`sw.ts` 自体の動きは E2E（`pwa.spec.ts`）で確認する。

## 8. pgTAP

- 配置: `supabase/tests/database/*.sql`（`phase1_db`、`phase3_menu_sets`、`phase3_constraints_rls`）。
- 内容: RLS（他人の行が見えない/書けない）、権限（`anon` が何もできない）、制約、RPC（`record_set` の採番・並行性、`save_menu_set`）、一意インデックス、生成列。
- `plan(N)` の件数が合わないと失敗する。ケースを足したら `plan` を更新する。
- 同一トランザクション内では `now()` が同じなので、`created_at` の順序に依存するテストは値を明示的にずらす。

## 9. よくあるエラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| `supabase start` が失敗する | Docker Desktop が起動していない | 起動を待つ。初回はイメージの取得に時間がかかる |
| 認証関連で `supabase start` が失敗する | `supabase/signing_keys.json` が無い | README の手順で署名鍵を生成する |
| E2Eが `E2E_SUPABASE_URL` を求める | ローカルSupabaseが起動していない | `npx supabase start` |
| 画面に投入したはずのデータが出ない | 画面を開いた後にDBへ投入した（キャッシュが古い） | 投入を画面を開く前にするか、再読み込みを挟む |
| ドラッグしても並びが変わらない | 移動量が不足 / ポインタ操作の順序 | `dragHandle` を使い、移動量を増やす |
| 一意制約（`exercises_user_category_name_active_key`）で追加に失敗する | 同じ部位・同名の有効なメニューが既にある（並列テストで同じ名前を使った等） | テストごとに名前を変える（ユーザーが違えば衝突しない） |
| `unique_violation` 等で `db reset` 後も落ちる | ローカルDBに古いテストデータが残っている | `npx supabase db reset` |
| PWAテストでSWが見つからない | `dist-e2e` が古い / 開発サーバーで実行している | `pwa` プロジェクトで実行する（`npx playwright test --project=pwa`） |
