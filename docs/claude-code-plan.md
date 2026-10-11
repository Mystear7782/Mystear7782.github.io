# Workout tracker 実装指示書(Claude Code向け)

作成日: 2026-10-11 / 対象リポジトリ: `training_recorder`(GitHub Pages: https://mystear7782.github.io/)

## 0. この指示書の使い方

- フェーズ0から順に進める。**各フェーズの終わりで必ず作業を止め**、「やったこと・テスト結果・未解決の課題・ユーザーにお願いしたい作業」を報告してレビューを待つ。
- フェーズの途中で、この指示書と実際のコードやDBの内容が食い違っていたら、推測で進めずにその時点で報告する。
- ユーザーの手作業が必要な箇所は【ユーザー作業】と書いてある。そこに来たら手順を具体的に案内して待つ。
- 設計の詳細版(要件定義・基本設計書)は Claude Docs にある: https://claude.ai/code/artifact/bbacee6a-297f-4976-bee3-0fbe7590f129 。MCPサーバー部分の要点は本書の §7 にすべて転記してある。

## 1. 目的

1. **MCPサーバーの構築**: Claude(スマホ/Web/Claude Code)から、Supabase上の記録(食事・体重・ワークアウト)を直接読み書きできるようにする。中心のユースケースは「食事内容をチャットで伝える → ClaudeがPFCを推定 → meal_logsへ自動で書き込み」。
2. **フロントエンドのReact移行**: 素のJSで書かれた約2,400行の `app.js` を、Vite + React + TypeScript に作り直す。目的は保守性の向上、データ鮮度・オフライン対応の改善、PWAとMCPでの型共有。
3. **土台の整備**: DBスキーマのバージョン管理、DB制約の追加、テスト基盤の作り直し。

## 2. 現状の構成(確認済みの事実)

### フロントエンド
- 構成: `index.html` / `app.js`(約2,400行・114関数、全画面のロジックが1ファイル) / `style.css` / `supabase-client.js`(Supabase呼び出しのラッパー) / `sw.js`(キャッシュ名 `gymlog-v6`) / `manifest.json`
- supabase-js 2.116.0 をCDNから読み込んでいる。publishable key はクライアントに埋め込み済み(公開してよいキー。アクセス制御はRLSで行う)。
- 画面遷移は `go('page-id')` による自前の切り替え。inline の `onclick` が82か所ある(JSテンプレート内に36、index.htmlに46)。
- CSPに `'unsafe-inline'` がある(index.html 7行目付近)。

### データ
- Supabase(PostgreSQL + PostgREST)。テーブル: `exercises` / `workout_sessions` / `sets` / `cardio_logs` / `body_weight_logs` / `meal_logs`。DDL上は `menu_sets` / `menu_set_items` も定義済み。
- **メニューセットだけはまだ localStorage(`gl_menusets`)に保存している**(Supabase未移行)。`exercises` は Supabase が正で、`gl_menus` はそのキャッシュ。
- `user_id` は `NOT NULL default auth.uid()`。PWAはinsert時に `user_id` を送らない。`workout_sessions` / `sets` / `cardio_logs` は `user_id` を持たず、RLSで `exercises.user_id` を辿って判定する。
- 読み取りは security invoker のRPC(`get_my_exercises` / `get_my_body_weight_logs` / `get_my_meal_logs` / `get_my_sessions_full`)経由。中身は `where user_id = auth.uid()`。直接 `.from().select()` が0件になる事象への回避策として導入したもの。原因は旧sw.jsがSupabaseのGET応答をキャッシュしていたことの可能性が高い(現在のsw.jsは修正済み)。
- `meal_logs.calories_kcal` は `GENERATED ALWAYS AS (protein_g*4 + fat_g*9 + carb_g*4) STORED`。書き込み時に送らない。
- `body_weight_logs` は同日複数回の記録を許容(一意制約なし)。
- `exercises.id` は text型で、クライアントが `menu_<epoch ms>`(CSVインポート時は `menu_imp_<epoch ms>_<n>`)の形式で採番している。
- `sets.set_no` は「最大値を読んでから+1でinsert」しているだけで、`unique(session_id, set_no)` 制約はない。
- **DDL・RLS・RPCの定義はリポジトリに入っていない**(SupabaseのSQL Editorで作成)。デバッグ用に作った `debug_whoami()` / `debug_exercises_count()` が残っている可能性がある。

### テスト・ドキュメント
- `tests/e2e/`(Playwright + pytest)は**現状動かない**。ログイン処理がない、既定の接続先が本番URL、`gl_sessions` を検証している、などの理由による。
- `docs/basic-design.md` / `docs/detail-design.md` は localStorage 時代の内容のまま。
- `docs/test-cases-e2e.md` の89件のテストケースは、機能仕様として引き続き有効。React移行の受け入れ基準に使う。

### 開発環境
- Windows PC。ローカルリポジトリ: `C:\Users\msrr2\OneDrive\Desktop\testapp\training_recorder`
- 主な利用端末は iPhone の Safari(ホーム画面に追加したPWA)。

## 3. 作業ルール

- **ブランチ**: フェーズごとにブランチを切る(例: `phase1-db`、`phase2-mcp`、`phase3-react`)。コミットは小さく分ける。mainへのマージはユーザーの承認後に行う。
- **秘密情報**:
  - Service Role Key(secret key)はどこにも使わない。コードにも設定ファイルにも書かない。
  - DBパスワードやアクセストークンはコミットしない。`.env` 系は `.gitignore` に入れる。
- **本番DBへの変更**:
  - `supabase db push` など本番DBを変える操作は、実行前に変更内容(SQL)を提示して、ユーザーの承認を得る。
  - 制約を追加するときは、先に既存データが制約を満たすかをSELECTで確認し、結果を報告する。
- **言語**: コードのコメントとドキュメントは日本語。既存のトーンに合わせる。
- **ドキュメント**: 各フェーズの最後に、`docs/` の該当する設計書を実装に合わせて更新する。
- **テストデータ**: 本番DBにテストデータを書かない。テストはローカルのSupabase(`supabase start`、Docker Desktopが必要)で行う。

## 4. 全体の進め方

| フェーズ | 内容 | 完了条件 |
| --- | --- | --- |
| 0 | 準備: Supabase CLIの導入、スキーマのリポジトリ化、現状確認 | 本番DBのスキーマが `supabase/migrations/` に入り、ローカルで再現できる |
| 1 | DB改修: 制約追加・RPC追加・デバッグ関数削除、現PWAの最小修正 | 新しいマイグレーションが本番に適用され、現PWAが問題なく動く |
| 2 | MCPサーバー構築(OAuth認証・同意画面を含む) | §7.8 の受け入れ基準AC-1〜9をすべて満たす |
| 3 | React移行(新アプリとして作り直して切り替え) | §8.7 の切り替え条件を満たし、本番がReact版になる |

MCPサーバーはフロントエンドの実装方式に依存しないので、React移行より先に行う。

### 進捗(2026-10-11 時点)

| フェーズ | 状態 | 備考 |
| --- | --- | --- |
| 0 | 完了 | 本番スキーマを `supabase/migrations/` に取り込み済み |
| 1 | 完了 | 制約・RPC・権限を本番に適用済み。`docs/db-design.md` |
| 2 | 完了 | MCPサーバー（OAuth）を本番にデプロイ済み。`docs/mcp-design.md`、`docs/mcp-acceptance.md` |
| 3 | 完了 | React版を本番に公開済み（GitHub Actionsでデプロイ）。iPhoneでの切り替え後の確認も完了。旧アプリはGitタグ `legacy-vanilla-js` に残し、`legacy/` は削除。旧版との差分は `docs/migration-diff.md` |

フェーズ3の後に追加した作業: メニューセット用のMCPツール3本（`list_menu_sets` / `save_menu_set` / `delete_menu_set`。本番で使うには `supabase functions deploy mcp` が必要）、旧Python E2E（`tests/e2e/`）の削除、バックログ（B-02a/06/14/15）の廃止。

## 5. フェーズ0: 準備

1. Supabase CLI を導入する(Windows: `npm i -D supabase` で `npx supabase` を使う、または scoop を使う)。
2. `supabase init` → `supabase link --project-ref swncmbsamxoyjeojwbyc`
   - 【ユーザー作業】DBパスワードの入力。
3. `supabase db pull` で本番スキーマをマイグレーションとして取り込む。
   - 取り込み結果を、`exercises` / `workout_sessions` / `sets` / `cardio_logs` / `body_weight_logs` / `meal_logs` / `menu_sets` / `menu_set_items` のテーブル定義、RLSポリシー、RPC 4本と照合して報告する。
   - 想定は §2 の記述。食い違いがあれば、本番DBの内容を正とする。
4. `supabase start` でローカルにDBを立ち上げ、マイグレーションが再現できることを確認する。
   - 【ユーザー作業】Docker Desktop が未導入なら導入する。
5. 次の項目を確認して報告する。
   - **PostgRESTのMax rows設定値**: 【ユーザー作業】ダッシュボード > Settings > API で確認する。既定は1000。`get_my_sessions_full` は1セッション1行なので、上限を超えると結果が黙って切れる。
   - **本番の行数**: 各テーブルの件数。
   - **デバッグ用関数**: `debug_whoami` / `debug_exercises_count` が残っているか。
   - **重複したset_no**: `sets` に重複した `(session_id, set_no)` があるか。
   - **exercises.idの形式**: `^[A-Za-z0-9_-]+$` に合わないidがあるか。
   - **重量・回数の値**: `weight_kg < 0` や `reps <= 0` の行があるか。
6. `.gitignore` に `supabase/.temp/` や `.env*` などを追加する。

**ここで停止して報告する。**

## 6. フェーズ1: DB改修

マイグレーションファイルとして作成し、ローカルで検証してから、承認を得て本番に適用する。

1. **`record_set` RPC**: `record_set(p_exercise_id text, p_date date, p_time text, p_weight_kg numeric, p_reps int, p_new_session boolean default false)`
   - security invoker。RLSが効く状態で実行する。
   - 同じ種目・同じ日のセッションがあれば最新(`created_at` 降順)のものに追加し、なければ作成する。`p_new_session = true` のときは常に新しいセッションを作る。
   - set_no は `max(set_no)+1` で採番し、insertまでを1トランザクションで行う。
   - 作成したsetの行と `session_id` を返す。
2. **制約の追加**(フェーズ0の確認結果で違反がゼロのときだけ。違反があれば報告して判断を仰ぐ):
   - `unique(session_id, set_no)` on `sets`
   - `check (id ~ '^[A-Za-z0-9_-]+$')` on `exercises`
   - `check (weight_kg >= 0)`、`check (reps > 0)` on `sets`
3. **集計用RPC**(MCPが使う。いずれも security invoker で、期間の指定を必須にする):
   - `get_meal_daily_totals(p_from date, p_to date)` → 日付ごとの `protein_g` / `fat_g` / `carb_g` / `calories_kcal` 合計と記録件数
   - `get_body_weight_range(p_from date, p_to date)` → 期間内の体重ログ
   - `get_exercise_history(p_exercise_id text, p_from date default null, p_limit int default 20)` → 日付・セット番号・重量・回数(有酸素は cardio の各値)
4. **デバッグ関数の削除**: 残っていれば `debug_whoami()` / `debug_exercises_count()` を削除する。
5. **現PWAの最小修正**(React移行までの間、MCPと同時に書いても壊れないようにするため):
   - `supabase-client.js` の `addSet` を `record_set` RPC呼び出しに置き換える。
   - あわせて、セッションを先に作る呼び出し側(app.jsの `ensureRealSession` 周辺)が二重にセッションを作らないよう整合させる。
   - それ以外の画面のリファクタはしない(フェーズ3で作り直すため)。
6. ローカルで、既存の主要操作(セット記録・有酸素記録・食事・体重)を手動またはスクリプトで確認する。
7. 【ユーザー作業】本番への適用(`supabase db push`)を承認してもらい、実行後にiPhoneでセット記録ができることを確認してもらう。

**ここで停止して報告する。**

## 7. フェーズ2: MCPサーバー

### 7.1 構成

- Supabase Edge Function `mcp` として実装する。URLは `https://swncmbsamxoyjeojwbyc.supabase.co/functions/v1/mcp`
- トランスポートは Streamable HTTP。MCP公式TypeScript SDKを使う。Edge Functionはステートレスなので、リクエストごとに `McpServer` を作る。サーバーからの通知・サンプリングは使わない。
- 実装は Supabase公式ガイド「Deploy MCP servers」(https://supabase.com/docs/guides/ai-tools/byo-mcp )に従う。使うヘルパーのパッケージ名・import元は、実装時点のガイドで確認すること。
- 想定するファイル構成: `supabase/functions/mcp/index.ts`(エントリ・認証パイプライン)、`supabase/functions/mcp/tools/*.ts`(ツールの種類ごと)、`supabase/functions/mcp/lib/*.ts`(日付検証・種目名解決・重複チェックなど)
- DBの型は `supabase gen types typescript --local` で生成し、ツール実装で使う。生成した型ファイルはフェーズ3でReact側でも共有する。

### 7.2 認証(Supabase Auth を OAuth 2.1 サーバーとして使う)

- 流れ:
  1. Claudeがトークンなしでアクセスすると、401と `WWW-Authenticate: Bearer resource_metadata=".../functions/v1/mcp/oauth-protected-resource"` を返す。
  2. ClaudeがDCR(動的クライアント登録)で自分を登録する。
  3. Claudeが同意画面を開き、ユーザーがログインして許可する。
  4. Claudeがユーザー本人のアクセストークンを受け取り、以降のリクエストに付ける。
- Edge Function: ガイドの `withOAuthProtectedResource()` と `withSupabase({ auth: 'user' })` を `pipeline` で組み合わせる。DB操作は、ユーザーのトークンで作られたクライアントで行う(RLSと `auth.uid()` がPWAと同じように効く)。
  - **Service Role Key は使わない**。使うと `auth.uid()` がNULLになり、読み取りは0件、書き込みはNOT NULL違反になる。
- `supabase/config.toml`:
  - `[functions.mcp] verify_jwt = false`(関数側で検証するため。これがないと認可メタデータの取得がゲートウェイで止まる)
  - `[auth.oauth_server] enabled = true` / `allow_dynamic_registration = true` / `authorization_url_path = "/oauth-consent.html"`
- 【ユーザー作業】
  - ダッシュボード > Authentication > OAuth Server を有効化する(2026年10月時点でベータ)。
  - JWT署名鍵を非対称鍵(ES256またはRS256)へ移行する。
  - Authentication > URL Configuration の Site URL が `https://mystear7782.github.io` になっているか確認する。
  - 署名鍵の移行後、PWAに今まで通りログインできることを確認する。

### 7.3 同意画面 `oauth-consent.html`

- PWAと同じオリジン(GitHub Pages)に、**単独で動く静的HTML**として置く。PWAのログイン状態(supabase-jsがlocalStorageに保存するセッション)をそのまま使う。
- フェーズ3以降も作り直さずに使えるよう、app.jsには依存させない。supabase-jsをCDNから読み込み、publishable key を使う。
- 処理:
  1. `authorization_id` を受け取る。
  2. 未ログインなら、その場でログインフォームを出す。
  3. `supabase.auth.oauth.getAuthorizationDetails(authorization_id)` でクライアント名・リダイレクト先・スコープを表示する。
  4. 許可なら `approveAuthorization`、拒否なら `denyAuthorization` を呼び、返ってきた `redirect_url` へ遷移する。
- 見た目は既存アプリのダークテーマに合わせる。CSPは inline script を使わない形で書く。
- `sw.js` のプリキャッシュ対象には入れない(常にネットワークから取る)。

### 7.4 ツール一覧

**書き込み系(最優先)**

| ツール | 入力 | 動作 |
| --- | --- | --- |
| `log_meal` | `date`, `meal_type`(朝/昼/夜/間食), `protein_g`, `fat_g`, `carb_g` | meal_logsに追加。`calories_kcal` を含む作成行を返す |
| `log_body_weight` | `date`, `weight_kg` | body_weight_logsに追加(常にinsert) |
| `log_workout_set` | `exercise`(名前またはid), `date`, `time?`, `weight_kg`, `reps`, `new_session?` | `record_set` RPCで追加 |
| `log_cardio` | `exercise`, `date`, `time?`, `time_min?`, `dist_km?`, `cal_kcal?`, `hr_bpm?`, `max_spd_kmh?`, `avg_spd_kmh?` | 同じ種目・同じ日のセッション(なければ作成)の cardio_logs を upsert |

**読み取り・集計系**

| ツール | 入力 | 動作 |
| --- | --- | --- |
| `list_exercises` | `include_archived?`(既定 false) | 種目マスタの一覧 |
| `get_meal_summary` | `date_from`, `date_to` | `get_meal_daily_totals` RPCの結果(日別合計)を返す |
| `get_weight_trend` | `date_from`, `date_to` | `get_body_weight_range` RPCの結果 |
| `get_exercise_history` | `exercise`, `date_from?`, `limit?` | `get_exercise_history` RPCの結果 |

**汎用CRUD**

| ツール | 入力 | 動作 |
| --- | --- | --- |
| `list_records` | `table`, `date_from?`, `date_to?`, `limit`(最大200) | 読み取りは既存のRPCを使う |
| `insert_record` | `table`, `data` | 1行追加。`exercises` のidはサーバーが採番する。`sets` は対象外(`log_workout_set` を使う) |
| `update_record` | `table`, `id`, `patch` | 1行更新 |
| `delete_record` | `table`, `id` | 1行削除 |

### 7.5 書き込みのルール

- **日付**: `YYYY-MM-DD`(日本時間)で必須。「今日」「昨日」の解釈はClaudeが行い、サーバーは形式の検証だけをする。Edge FunctionはUTCで動くので、サーバー側で「今日」を決めない。ツールの説明文にもこのことを書く。
- **種目名の解決**: `exercise` には名前かidを受け付ける。名前は完全一致を優先し、なければ部分一致を探す。候補が0件または複数件のときはエラーにし、候補名をエラーメッセージに含める。アーカイブ済みの種目は対象外。
- **二重登録の防止**: `log_meal` / `log_body_weight` / `log_workout_set` は、直近2分以内に同じ内容の行があれば、新しく作らずにその既存行を返す(Claudeの再試行対策。スキーマ変更はしない)。
- **種目の追加**: idはサーバーが `menu_<epoch ms>` 形式で採番する。入力で受け付けたidは使わない。
- **返り値**: 書き込み系は、作成・更新した行をそのまま返す。
- **カロリー**: `calories_kcal` は書き込まない(DBが自動計算する)。

### 7.6 安全策

- 汎用ツールの `table` 引数は、6テーブル(`exercises` / `workout_sessions` / `sets` / `cardio_logs` / `body_weight_logs` / `meal_logs`)のenumに限定する。
- 一括更新・一括削除は提供しない。
- ツール注釈を付ける。読み取り系は `readOnlyHint: true`、`update_record` / `delete_record` は `destructiveHint: true`。説明文にも「実行前にユーザーへ確認すること」と書く。
- 読み取り系は、期間か件数の指定を必須にする(Max rowsで結果が黙って切れるのを防ぐ)。
- エラーは、Supabaseのエラー内容をそのままMCPのエラーとして返す。

### 7.7 デプロイ

1. ローカルで `supabase functions serve mcp` を起動し、MCP Inspectorで全ツールを確認する。
2. `config.toml` を `supabase config push` で反映し、`supabase functions deploy mcp` を実行する(承認を得てから)。
3. `oauth-consent.html` をmainにマージしてGitHub Pagesへ公開する(承認を得てから)。
4. 【ユーザー作業】Claude(Web/スマホ)の 設定 > コネクタ > カスタムコネクタを追加 で上記URLを登録し、同意画面で許可する。
5. Claude Codeから接続できるかも試す。Claude Codeはポートが毎回変わる `http://localhost:<port>/callback` を使う一方、Supabaseのリダイレクト先は完全一致のみなので、接続できない可能性がある。結果を報告する。

### 7.8 受け入れ基準

| ID | 対象 | 基準 |
| --- | --- | --- |
| AC-1 | 認証 | トークンなしのリクエストに、401と `WWW-Authenticate`(resource_metadata付き)が返る。スマホのClaudeでコネクタを追加し、同意画面で許可すると接続できる |
| AC-2 | CRUD | 6テーブルそれぞれで insert → list → update → delete が成功し、PWAを再読み込みすると結果が反映されている |
| AC-3 | 食事の記録 | 「朝: 鯖缶150g、豆腐160g、納豆1パック」と伝えると、meal_logsに朝の行が1つ追加され、`calories_kcal` が P×4+F×9+C×4 と一致する |
| AC-4 | セットの記録 | 同じ種目・同じ日に2回セットを記録すると、同じセッションに set_no の連番で追加される |
| AC-5 | 集計 | `get_meal_summary` の日別合計が、同じ期間をSQLで直接集計した値と一致する |
| AC-6 | 種目一覧 | `include_archived = false` のとき、アーカイブ済みの種目が返らない |
| AC-7 | エラー | 存在しない種目名を指定すると、エラーに候補の種目名が含まれる |
| AC-8 | 安全策 | 更新・削除の前にClaudeが確認を求める。`table` に6テーブル以外を指定するとエラーになる |
| AC-9 | 二重登録 | 同じ内容の `log_meal` を2分以内に再送しても、行は1つしか増えない |

- AC-2〜9のうちDBで確認できるものは、ローカルSupabaseに対するDenoのテスト(`deno test`)で自動化する。AC-1・AC-3・AC-8は、実機での手動確認の手順書を `docs/` に用意する。

**ここで停止して報告する。**

## 8. フェーズ3: React移行

### 8.1 技術スタック

- **ビルド**: Vite + React + TypeScript(strict)
- **サーバー状態の管理**: TanStack Query
  - 画面復帰時(`refetchOnWindowFocus`)に再取得し、MCPで書いた記録が反映されるようにする。
  - 閲覧データはキャッシュを永続化して、オフラインでも見られるようにする(`persistQueryClient` + IndexedDB。例: idb-keyval)。
- **PWA**: vite-plugin-pwa(Workbox)。出力ファイル名は既存と同じ `sw.js` にして、旧Service Workerを置き換える。
  - 旧キャッシュ `gymlog-*` は新SWの activate で削除する。
  - Supabaseへの通信はキャッシュしない。
  - HTML/JS/CSSはネットワーク優先とし、`networkTimeoutSeconds: 3` で応答が遅いときはキャッシュに切り替える(電波の弱いジムで起動が止まらないようにする)。正常な応答(`res.ok`)だけをキャッシュする。
  - `oauth-consent.html` はプリキャッシュしない。
- **ルーティング**: GitHub PagesはSPA用のフォールバックがないため、HashRouterを使う。
- **グラフ**: Chart.js(react-chartjs-2)
- **DBの型**: フェーズ2で生成した型を共有する。
- **テスト**: Vitest + Testing Library(部品単位)、Playwright(主要な流れのE2E、ローカルSupabaseを相手にする)
- **スタイル**: 最初は既存の `style.css` をグローバルCSSとして流用し、見た目を変えない。
- **CSP**: `'unsafe-inline'` を外した状態で動くようにする。inline script を使わず、外部スクリプトはnpmでバンドルする。

### 8.2 ディレクトリ構成(目安)

```
training_recorder/
├─ index.html                 Viteのエントリ
├─ public/
│  ├─ oauth-consent.html      フェーズ2の単独ページをそのまま置く
│  ├─ manifest.json, アイコン類
├─ src/
│  ├─ main.tsx, App.tsx       ルーティング・QueryClient・認証ガード
│  ├─ lib/                    supabaseクライアント、定数、日付・1RMなどのユーティリティ
│  ├─ api/                    テーブル別の取得・更新関数とQuery/Mutationフック
│  ├─ features/               画面別(dashboard, menus, menu-sets, session, cardio, calendar, analysis, rm-calculator, body-weight, meals, csv, settings, auth)
│  ├─ components/             共通部品(サイドバー、トースト、モーダル、ローディング)
│  └─ types/database.ts       supabase gen types の出力
├─ supabase/                  フェーズ0〜2の成果物
├─ tests/                     unit / e2e
├─ docs/
└─ .github/workflows/deploy.yml
```

### 8.3 データ層の方針

- 読み取りはRPC経由を維持する。ただし直接selectの0件事象が本当に再現するかを先に検証し、結果を報告する。再現しなければ、どちらを使うかをユーザーと相談する。
- 書き込みは、サーバー応答を待ってからキャッシュを更新する(楽観的更新をする場合は、失敗時に必ず元に戻す)。今は画面ごとに失敗時の扱いがばらばらなので、これを統一する。
- セットの追加は `record_set` RPCを使う。
- `get_my_sessions_full` は件数が増えると取得上限に当たるので、期間指定やページングで取得する形に変える(必要ならRPCを追加する)。
- 移行期の名残(「サーバーが0件ならローカルを保持する」分岐、`gl_menus` キャッシュ、デバッグ用ボタン)は引き継がない。
- フェーズ3の最初に、次のマイグレーションを追加する(フェーズ1と同じく、既存データの確認 → ローカル検証 → 承認後に本番適用)。
  - `exercises` に、アーカイブされていない種目について `(user_id, category, name)` の一意制約(部分一意インデックス)を追加する。今はアプリ側でしか重複を防いでおらず、MCPから同名の種目を作れてしまうため。既存データに重複があれば報告して判断を仰ぐ。
  - RLSポリシーの `auth.uid()` を、Supabase推奨の `(select auth.uid())` の形に書き換える(行ごとの再評価を避けるため)。
- エラー表示は共通の関数にまとめる。ユーザーに生のエラー詳細は出さず、詳細はconsoleに出す。

### 8.4 メニューセットのDB移行

- `menu_sets` / `menu_set_items` を使うように実装する。
- 新アプリの初回起動時、localStorage に `gl_menusets` があり、DB側の `menu_sets` が空なら、一度だけDBへ移行する。移行に成功したら `gl_menusets` を `gl_menusets_migrated` という名前に変えて残す(すぐには消さない)。
  - 同じオリジンなので、旧アプリのlocalStorageをそのまま読める。
  - 存在しない `exercises` を参照しているセット項目は飛ばし、件数を報告する。
- MCPの対象テーブルに `menu_sets` / `menu_set_items` を加えるかどうかは、移行後にユーザーと相談する。

### 8.5 進め方

1. 雛形を作る。Vite + React + TS + ESLint/Prettier + Vitest。
2. GitHub Actionsで、ビルドとテストをpushごとに実行する(この時点ではまだデプロイしない)。
3. 認証(ログイン・ログアウト)と、データ層(api/)を作る。
4. 画面を移植する。順番は、使用頻度の高いもの → 低いもの。
   1. ダッシュボード、メニュー一覧、セッション記録(筋トレ・有酸素)
   2. 食事、体重
   3. カレンダー、分析、1RM計算
   4. メニューセット、CSV、設定
5. 各画面の移植が終わるごとに、`docs/test-cases-e2e.md` の該当ケースをPlaywrightのE2Eとして書き直す。テストはローカルSupabaseとログイン済みのstorageStateを使う。
6. PWA化とオフライン対応を行う。
7. 旧アプリとの機能差分を一覧にして報告する。

### 8.6 デプロイ

- `.github/workflows/deploy.yml`: mainへのpushでビルドし、`actions/deploy-pages` で公開する。
- Viteの `base` は `/`(ユーザーサイトのルートに公開しているため)。
- 【ユーザー作業】切り替えのとき、GitHub > Settings > Pages の Source を「GitHub Actions」に変更する。

### 8.7 切り替え条件

- `docs/test-cases-e2e.md` の全ケースがPASS、または「対象外」とする理由をユーザーが承認していること
- 【ユーザー作業】iPhone(ホーム画面のPWA)で次を確認してもらう。
  - ログインできる
  - セット・有酸素・食事・体重を記録できる
  - オフライン時に過去の記録を閲覧できる
  - アプリを更新したときに新しい版へ切り替わる
  - メニューセットが移行されている
- MCPのAC-2(PWAへの反映)がReact版でも成り立つこと
- 切り替え後、旧ファイル(app.js など)は `legacy/` に移すか、タグを付けて削除する。どちらにするかはユーザーと相談する。
- `docs/` の設計書をReact版の構成に合わせて書き直す。

**ここで停止して報告する。**

## 9. ユーザー作業一覧

| フェーズ | 作業 |
| --- | --- |
| 0 | DBパスワードの入力(`supabase link`)、Docker Desktopの導入、Max rows設定値の確認 |
| 1 | 本番DBへのマイグレーション適用の承認、iPhoneでの動作確認 |
| 2 | OAuth Serverの有効化、JWT署名鍵の非対称鍵への移行、Site URLの確認、デプロイの承認、Claudeへのカスタムコネクタ登録と同意、実機での受け入れ確認 |
| 3 | GitHub Pagesの公開元の切り替え、iPhoneでの切り替え前確認 |

## 10. 参考資料

- 要件定義・基本設計書(MCPサーバー): https://claude.ai/code/artifact/bbacee6a-297f-4976-bee3-0fbe7590f129
- Supabase「Deploy MCP servers」: https://supabase.com/docs/guides/ai-tools/byo-mcp
- Supabase「Getting Started with OAuth 2.1 Server」: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Claude コネクタの認証仕様: https://claude.com/docs/connectors/building/authentication
- 既存の機能仕様: `docs/test-cases-e2e.md`、`docs/usecase.md`、`docs/screen-transition.md`
