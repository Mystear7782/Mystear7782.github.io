# Workout tracker MCPサーバー設計書

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-10-11 | 新規作成（フェーズ2: MCPサーバー構築） |
| 1.1 | 2026-10-11 | フェーズ3: PWAのReact移行に伴う注記を追記（§7）。MCPのコード・ツールは変更なし |

Claude（スマホ/Web/Claude Code）から、Supabase上の記録（食事・体重・ワークアウト）を直接読み書きするためのMCPサーバー。
中心のユースケースは「食事内容をチャットで伝える → ClaudeがPFCを推定 → `log_meal` で meal_logs へ記録」。

## 1. 構成

| 要素 | 内容 |
|---|---|
| 実装 | Supabase Edge Function `mcp`（`supabase/functions/mcp/`）。URL: `https://swncmbsamxoyjeojwbyc.supabase.co/functions/v1/mcp` |
| トランスポート | Streamable HTTP。ステートレス（リクエストごとに `McpServer` を生成。サンプリング・サーバー通知は使わない） |
| ライブラリ | `@modelcontextprotocol/server`（MCP公式TypeScript SDK v2）、`@supabase/server`（認証ゲート）、`@supabase/middleware`（`pipeline`）、`zod`（入力検証） |
| 認証 | Supabase Auth を OAuth 2.1 サーバーとして使う（§2） |
| DB操作 | ユーザー本人のトークンで作られたクライアントで行う。RLSと `auth.uid()` がPWAと同じように効く。**Service Role Key（secret key）は使わない**（`auth.uid()` が NULL になり、読み取りは0件、書き込みは NOT NULL 違反になるため） |
| 同意画面 | PWAと同じオリジンの静的ページ `oauth-consent.html`（§3） |

```
supabase/functions/mcp/
├─ index.ts            エントリ。pipeline([withOAuthProtectedResource, withSupabase(user)]) → createMcpHandler
├─ deno.json           依存の版（import map）
├─ database.types.ts   `supabase gen types typescript --local` の出力（フェーズ3でReact側と共有）
├─ lib/
│   ├─ result.ts       ToolResult / エラー整形（Supabaseのエラー内容をそのまま返す）
│   ├─ dates.ts        日付(YYYY-MM-DD)・時刻(HH:MM)の検証
│   ├─ exercises.ts    種目名→種目の解決（完全一致優先→部分一致。候補付きエラー）
│   └─ dedupe.ts       二重登録防止の時間窓（2分）
├─ tools/
│   ├─ write.ts        log_meal / log_body_weight / log_workout_set / log_cardio
│   ├─ read.ts         list_exercises / get_meal_summary / get_weight_trend / get_exercise_history
│   ├─ crud.ts         list_records / insert_record / update_record / delete_record
│   └─ register.ts     名前・説明・注釈を付けてMCPサーバーへ登録
└─ tests/              Denoのテスト（§6）
```

ツール本体は「`ToolResult` を返す普通の関数」で、MCPの登録とは分離している。MCPサーバーを介さずDBへ直接テストできる。

## 2. 認証（OAuth 2.1）

1. Claudeがトークン無しでアクセス → `401` + `WWW-Authenticate: Bearer resource_metadata=".../functions/v1/mcp/oauth-protected-resource"`
2. ClaudeがDCR（動的クライアント登録）で自分を登録
3. Claudeが認可エンドポイントを開く → Supabase Auth が `{Site URL}/oauth-consent.html?authorization_id=…` へリダイレクト
4. ユーザーがログインして「許可する」→ Claudeがユーザー本人のアクセストークンを受け取る
5. 以降、トークンを付けて `/functions/v1/mcp` を呼ぶ

- トークンの検証は関数側（`@supabase/server` の `withSupabase({ auth: 'user' })`）で行う。そのため `config.toml` の `[functions.mcp] verify_jwt = false`（ゲートウェイで検証すると、認可メタデータの取得が401で止まる）。
- `@supabase/server` は**非対称鍵（ES256/RS256）で署名されたJWTのみ**受け付ける。本番のJWT署名鍵をレガシー(HS256)から非対称鍵へ移行しておく必要がある。
- 許可された権限の範囲: ユーザー本人のデータの読み取り・追加・変更・削除（スコープでの絞り込みはしていない）。同意画面にもその旨を表示する。
- 同意の取り消し: Supabase ダッシュボード > Authentication > OAuth Apps でクライアントを削除する、またはユーザーのgrantを取り消す。

## 3. 同意画面（`oauth-consent.html` / `.js` / `.css`）

- 単独で動く静的ページ。`app.js` / `style.css` / `supabase-client.js` には依存しない（フェーズ3のReact化後もそのまま使える）。
- supabase-js（SRI付きCDN）と publishable key を使い、PWAと同じオリジンのlocalStorageに保存されたログイン状態をそのまま使う。
- 流れ: `authorization_id` を受け取る → 未ログインならログインフォーム → `auth.oauth.getAuthorizationDetails` でクライアント名・戻り先・権限を表示 → `approveAuthorization` / `denyAuthorization` → 返ってきた `redirect_url`（http(s)のみ）へ遷移。すでに同意済みなら画面を出さずに戻り先へ。
- CSP: inline script なし（`script-src 'self' https://cdn.jsdelivr.net`）。
- `sw.js` はこのページ（html/js/css）を**キャッシュせず素通し**にしている。プリキャッシュ対象にも入れていない。

## 4. ツール一覧（12本）

### 書き込み系

| ツール | 入力 | 動作 |
|---|---|---|
| `log_meal` | `date`, `meal_type`(朝/昼/夜/間食), `protein_g`, `fat_g`, `carb_g` | meal_logs に追加。`calories_kcal`（生成列 P×4+F×9+C×4）を含む行を返す |
| `log_body_weight` | `date`, `weight_kg` | body_weight_logs に追加（同日複数回OK。常にinsert） |
| `log_workout_set` | `exercise`(名前/id), `date`, `time?`, `weight_kg`, `reps`, `new_session?` | `record_set` RPC で追加（同じ種目・同じ日の最新セッションへ。`new_session` で新規）。自重運動は重量0 |
| `log_cardio` | `exercise`, `date`, `time?`, `time_min?`, `dist_km?`, `cal_kcal?`, `hr_bpm?`, `max_spd_kmh?`, `avg_spd_kmh?` | 同じ種目・同じ日のセッション（なければ作成）の cardio_logs を upsert。指定した項目だけ上書きし他は残す |

### 読み取り・集計系

| ツール | 動作 |
|---|---|
| `list_exercises` | 種目マスタ（`include_archived` 既定 false） |
| `get_meal_summary` | `get_meal_daily_totals` RPC（日別合計。期間必須・730日まで） |
| `get_weight_trend` | `get_body_weight_range` RPC（期間必須・730日まで） |
| `get_exercise_history` | `get_exercise_history` RPC（新しいセッションから最大100件。アーカイブ済みの種目も指定可） |

### 汎用CRUD

| ツール | 動作 |
|---|---|
| `list_records` | `table`, `limit`(必須・最大200), `date_from?`, `date_to?`。読み取りは既存の `get_my_*` RPC |
| `insert_record` | 1行追加。`exercises` のidはサーバーが採番（`menu_<epoch ms>`）。`sets` は対象外（`log_workout_set` を使う） |
| `update_record` | 1行更新（`table`, `id`, `patch`。cardio_logsのidはsession_id） |
| `delete_record` | 1行削除。`exercises` を消すとセッション・セット・有酸素も連鎖削除される |

## 5. 書き込みのルール・安全策

- **日付**: `YYYY-MM-DD`（日本時間）で必須。実在する日付かだけを検証。「今日」「昨日」の解釈はClaudeが行う（Edge FunctionはUTCなので、サーバーは「今日」を決めない。ツールの説明文にも明記）。
- **種目名の解決**: 名前は完全一致を優先し、なければ部分一致（全角/半角・大小文字を吸収）。候補が0件または複数件のときはエラーにし、候補名をメッセージに含める。アーカイブ済みの種目は書き込みの対象外。
- **二重登録の防止**: `log_meal` / `log_body_weight` / `log_workout_set` は、直近2分以内に同じ内容の行があれば新規作成せず既存行を返す（`deduplicated: true`）。判定には `created_at` を使う（セットは `sets.created_at`。マイグレーション `add_sets_created_at` で追加）。
- **返り値**: 作成・更新した行をそのまま返す（`user_id` は返さない）。
- **`table` 引数**: 6テーブルのenumに限定。一括更新・一括削除は提供しない。
- **入力検証**: テーブルごとのstrictなスキーマ。`user_id` / `id` / `calories_kcal` など指定してはいけない列は拒否。
- **ツール注釈**: 読み取り系は `readOnlyHint: true`、`update_record` / `delete_record` は `destructiveHint: true`（説明文にも「実行前にユーザーへ確認すること」）。
- **取得上限**: 読み取りは期間か件数の指定を必須にする。`list_records` は `get_my_*` RPC を使うため、PostgRESTのMax rows(1000)に達した場合は `warning` を付ける。
- **エラー**: Supabaseのエラー内容（コード・メッセージ・details・hint）をそのままMCPのエラー(`isError`)として返す。

## 6. テスト

| 種類 | 場所 | 実行 |
|---|---|---|
| ツールの結合テスト（AC-2〜9のDBで確認できる部分） | `supabase/functions/mcp/tests/tools.test.ts` | `powershell -File supabase/functions/mcp/tests/run.ps1`（Docker上のDeno、ローカルSupabaseに接続） |
| HTTPレベル（401・WWW-Authenticate・メタデータ・tools/list・注釈・table enum） | `tests/mcp_http.test.ts` | 同上（先に `npx supabase functions serve mcp` を起動） |
| OAuth全体（DCR→同意画面→トークン→MCP） | `tests/mcp/oauth_flow_local.py` | ローカルSupabase + `functions serve` + `python -m http.server 8000`（同意画面の配信）を起動して実行 |
| 実機（Claude） | `docs/mcp-acceptance.md` | 手動 |

## 7. デプロイ

1. （一度だけ）本番のAuth設定: OAuth Server有効化・DCR有効・認可パス `/oauth-consent.html`・JWT署名鍵を非対称鍵へ移行・Site URL（`docs/mcp-acceptance.md` §0）
2. DBマイグレーション（`sets.created_at`）を `supabase db push`
3. `supabase functions deploy mcp`（`config.toml` の `verify_jwt = false` が反映される）
4. `oauth-consent.*` を含むブランチを main にマージして GitHub Pages へ公開
5. Claude の コネクタ に `https://swncmbsamxoyjeojwbyc.supabase.co/functions/v1/mcp` を登録

> `supabase config push` は使わない。リポジトリの `config.toml` はローカル開発用の既定値を含むため、本番のAuth設定を意図せず上書きしてしまう。本番のAuth設定はダッシュボードで管理する。

## 7. フェーズ3（React移行）との関係

- MCPサーバーのコード・ツールはフェーズ3で変更していない。`database.types.ts` は `npm run gen:types` でPWA側（`src/types/database.ts`）と同時に生成する。
- フェーズ3で `menu_sets` / `menu_set_items` がDB管理になったが、MCPのツールの対象には含めていない（`list_records` 等の汎用ツールの対象テーブルにも入っていない）。Claudeからメニューセットを扱いたい場合は、本番DBのマイグレーション適用後に追加を検討する（バックログ B-16）。
- 新しい一意インデックス（有効な種目名は部位内で一意）により、`insert_record` で同じ部位に同名の有効な種目を作るとエラー（23505）になる。他の経路（PWA）と同じ挙動。
- MCPで書いた記録は、PWAを開き直す/画面に戻ったときに表示される（TanStack Queryの再取得。基本設計書 5.4）。
