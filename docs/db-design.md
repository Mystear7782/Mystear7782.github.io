# Workout tracker DB設計書（Supabase）

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-10-11 | 新規作成。フェーズ0（本番スキーマのマイグレーション化）とフェーズ1（制約・RPC・権限・menu_set_items.position）を反映 |

スキーマの正は `supabase/migrations/` のSQL。本書はその要約であり、食い違う場合はSQLが優先。

## 1. 運用

- マイグレーションは `supabase/migrations/` で管理する。本番へは `supabase db push`（実行前にSQLの提示とユーザー承認が必要）。
- ローカルは Docker 上の Supabase（`npx supabase start` / `db reset`）。DBのテストは `npx supabase test db`（pgTAP、`supabase/tests/database/`）。
- 本番スキーマとの突き合わせは `supabase db query --linked "<SELECT>"`（読み取りのみ）。
- Service Role Key（secret key）は使わない。クライアントは publishable key + ユーザーのJWT（RLSで保護）。

## 2. テーブル

| テーブル | 主キー | 備考 |
|---|---|---|
| `exercises` | `id` text | クライアントが `menu_<epoch ms>` 形式で採番。`id ~ '^[A-Za-z0-9_-]+$'` のCHECK。`user_id` default `auth.uid()`、`sort_order` でカテゴリ内の並び順 |
| `workout_sessions` | `id` uuid | `exercise_id` → exercises（CASCADE）。`session_date` / `session_time`(text, 'HH:MM', 既定 '00:00') / `created_at` |
| `sets` | `id` uuid | `session_id` → workout_sessions（CASCADE）。`unique(session_id, set_no)`、`weight_kg >= 0`、`reps > 0` |
| `cardio_logs` | `session_id` | workout_sessions と1対1（CASCADE） |
| `body_weight_logs` | `id` uuid | 同日複数回の記録を許容（一意制約なし） |
| `meal_logs` | `id` uuid | `meal_type` は 朝/昼/夜/間食 のCHECK。`calories_kcal` は生成列（P×4 + F×9 + C×4）で書き込まない |
| `menu_sets` | `id` uuid | メニューセット |
| `menu_set_items` | `(menu_set_id, exercise_id)` | `position`（0始まりのセット内並び順、既定0）。両FKとも CASCADE |

- `user_id`（`exercises` / `body_weight_logs` / `meal_logs` / `menu_sets`）は `NOT NULL default auth.uid()`。クライアントは送らない。
- `workout_sessions` / `sets` / `cardio_logs` / `menu_set_items` は `user_id` を持たず、RLSが親（`exercises` / `menu_sets`）の `user_id` を辿って判定する。
- メニューセットはPWA上は現状 localStorage（`gl_menusets`）。DBへの移行はフェーズ3。

## 3. アクセス制御

- 全テーブルでRLS有効。ポリシーは「本人のみ」（`TO authenticated`）。
- テーブル権限は `authenticated` に SELECT/INSERT/UPDATE/DELETE のみ。`anon` には何も付与しない（TRUNCATE等も付与しない）。
- RPCの実行権限は `authenticated` のみ（`anon` / PUBLIC から剥奪）。
- 新規テーブルは `ensure_rls` イベントトリガー（`rls_auto_enable`）でRLSが自動有効化される。

## 4. RPC

すべて security invoker（呼び出しユーザーの権限で実行 = RLSが効く）、`search_path` は空。

| 関数 | 用途 |
|---|---|
| `get_my_exercises()` / `get_my_body_weight_logs()` / `get_my_meal_logs()` / `get_my_sessions_full()` | PWAの読み取り（既存）。`get_my_sessions_full` は1セッション1行（PostgREST Max rows=1000に注意） |
| `record_set(p_exercise_id, p_date, p_time, p_weight_kg, p_reps, p_new_session default false, p_session_id default null)` | セット追加。set_no採番(max+1)とinsertを1トランザクションで行う。下記参照 |
| `get_meal_daily_totals(p_from, p_to)` | 日別のP/F/C/カロリー合計と件数。期間必須・730日まで |
| `get_body_weight_range(p_from, p_to)` | 期間内の体重ログ。期間必須・730日まで |
| `get_exercise_history(p_exercise_id, p_from default null, p_limit default 20)` | 種目の履歴。新しいセッションから `p_limit` 件（1〜100に丸める）。筋トレはセットごと、有酸素はセッションごとに1行 |

### record_set の挙動

- `p_session_id` なし: 同じ種目・同じ日のセッションのうち最新（`created_at` 降順）に追加。無ければ作成（`p_time` 未指定は '00:00'）。`p_new_session = true` なら常に新規作成。
- `p_session_id` あり: そのセッションの末尾に追加（`p_exercise_id` を併せて渡した場合は種目の一致を検証）。現PWAは「いま開いているセッション」へ確実に追加するため、2セット目以降でこちらを使う。
- 同一セッションへの同時追加は `FOR UPDATE`、同一種目・同日の同時作成は advisory lock で直列化。
- 戻り値: `id`（set）, `session_id`, `set_no`, `weight_kg`, `reps`, `session_created`。

> 指示書の `record_set` 仕様に対する差分: 末尾に任意引数 `p_session_id` を追加している（既存PWAの「開いているセッションに追加」を保つため）。指示書どおりの呼び出し（6引数）はそのまま動く。

## 5. 変更履歴（マイグレーション）

| ファイル | 内容 |
|---|---|
| `20261010152539_remote_schema` | 本番スキーマの取り込み（`db pull`） |
| `20261010153625_add_constraints` | `unique(session_id,set_no)`、`exercises.id` 形式、`weight_kg >= 0`、`reps > 0` |
| `20261010153629_add_rpc_functions` | `record_set` と集計RPC3本の追加、デバッグ関数の削除（IF EXISTS） |
| `20261010153632_tighten_privileges` | テーブル/RPC権限の最小化、ポリシーを `TO authenticated` に限定 |
| `20261010153636_add_menu_set_items_position` | `menu_set_items.position` の追加 |
