# Workout tracker 詳細設計書

## 改訂履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0〜1.6 | 2026-03-21〜08-15 | 素のJS版（localStorage保存）の詳細設計。有酸素・CSV・分析・RM換算表・メニューセット・並び替え・部位「その他」まで |
| 2.0 | 2026-10-11 | **React移行（フェーズ3）に合わせて改訂**。§1 データ設計をSupabase + TanStack Queryに、§2.5 並び替え、§5 Service Worker、§6 状態管理、§10 ファイル構成、§11 セキュリティ方針（CSP強化）を書き換え。§3・§4・§7〜§9 の画面・ロジックの仕様は、旧版から変更のない部分は維持している |

> 旧版（Gitタグ `legacy-vanilla-js` の `app.js`）への参照（グローバル状態 `S`・`persist()`・`gl_*` キーなど）はv2.0では使わない。データの正はSupabaseのDB（`docs/db-design.md`）。§3以降の記述に残る旧版の用語（`gl_sessions` など）は、§1の対応するデータ（`['sessions']` のキャッシュ等）に読み替える。

---

## 1. データ設計

### 1.1 保存先

| 種類 | 保存先 | 内容 |
|---|---|---|
| 記録データ | Supabase（PostgreSQL）。スキーマは `docs/db-design.md` | メニュー(`exercises`)、セッション(`workout_sessions`)、セット(`sets`)、有酸素(`cardio_logs`)、体重、食事、メニューセット |
| 閲覧キャッシュ | IndexedDB（DB `keyval-store`、キー `workout-tracker-query-cache`） | TanStack Queryのキャッシュ。最大7日。`buster: 'v1'`（データ構造を変えたら上げる）。ログアウト/ユーザー切替で削除 |
| ログイン状態 | localStorage（supabase-js: `sb-<project-ref>-auth-token`） | セッショントークン |
| 旧メニューセット | localStorage `gl_menusets` → 移行後 `gl_menusets_migrated` | §1.5 |

旧版の `gl_menus` / `gl_sessions` は使わない（残っていても無視される）。

### 1.2 型（`src/types/`）

- `database.ts`: `npm run gen:types` で生成するDBの型（直接編集しない）。MCPサーバー側の `supabase/functions/mcp/database.types.ts` も同じスクリプトで生成する。
- `domain.ts`: 画面・計算で使う型。DBの行から変換して使う。

| 型 | 内容 |
|---|---|
| `Exercise` | `id`, `name`, `category`(部位), `type`(種別), `archived`, `sort_order`。`id` はクライアントが `menu_<epoch ms>…` 形式で採番 |
| `SessionData` | `id`, `exerciseId`, `date`(YYYY-MM-DD), `time`(HH:MM), `createdAt`, `sets: SetEntry[]`(set_no順), `cardio: Cardio` または null |
| `SetEntry` | `id`, `setNo`, `weight`, `reps` |
| `Cardio` | `time`(分), `dist`(km), `cal`(kcal), `hr`(bpm), `maxSpd`, `avgSpd`（速度2つは任意。ほかは保存時に必須） |
| `BodyWeightLog` / `MealLog` | DBの行から必要な列だけ。`MealLog.calories_kcal` は生成列 |
| `MenuSet` | `id`, `name`, `exerciseIds`(position順) |

### 1.3 TanStack Query のキャッシュ（`src/api/`）

| キー（`api/keys.ts`） | 取得（`fetch*`） | 内容 |
|---|---|---|
| `['exercises']` | `fetchExercises` | メニュー一覧（`sort_order` 順） |
| `['sessions']` | `fetchSessions` | **全セッション**（セット・有酸素を埋め込んで取得）。PostgRESTのMax rows=1000に対応するため `.range()` でページ分割（`api/paging.ts` の `fetchAll`） |
| `['body-weights']` | `fetchBodyWeights` | 体重ログ |
| `['meals']` | `fetchMeals` | 食事ログ |
| `['menu-sets']` | `fetchMenuSets` | メニューセット（`menu_set_items` を `position` 順に並べる） |

- 読み取りはテーブルへの**直接select**（RPCではない）。Service Workerは関与しない（基本設計書 6.3）。
- 設定（`app/queryClient.ts`）: `staleTime` 15秒、`gcTime` 7日、`retry` 1、`refetchOnWindowFocus` true。永続化の復元が成功したら `invalidateQueries()` で最新を再取得する（保存済みキャッシュを表示しつつ更新）。
- 取得失敗: 表示できるキャッシュが無いときだけトースト「データの取得に失敗しました（通信を確認してください）」。背景の再取得の失敗（オフライン等）は通知せず console に警告を出す。

### 1.4 書き込みの方針（共通）

すべての書き込みは次の流れ（`useMutation`）で統一する。

```
1. サーバーに書き込む（応答を待つ。オフラインの書き込みキューは持たない）
2. 成功したら、キャッシュを書き換える（setQueryData。並び順を保って挿入/置換/削除）
3. 失敗したら reportError(e, '簡潔な日本語') を呼ぶ
     - ユーザーには日本語のトースト（生のエラー文は出さない）
     - console.error に詳細を出す
     - 一意制約違反(23505, isUniqueViolation)だけは専用の文言
```

| 操作 | 実装 |
|---|---|
| メニューの追加 | `insertExercise`: `sort_order` = 同部位の最大値+1。23505 は「同じ部位に同名のメニューがあります」 |
| メニューの更新/アーカイブ/復元 | `useUpdateExercise`（名前・部位・種別・archived）。復元・改名で同名の有効なメニューと衝突した場合も23505 |
| メニューの並び替え | `useReorderExercises`: 部位内の全行の `sort_order` を 0,1,2… で保存。失敗したらキャッシュは更新せず（画面は元の並びに戻る）トーストで通知 |
| メニューの完全削除 | `useDeleteExercise`（記録・セット内の所属はFKのCASCADE）。成功後、セッションとメニューセットのキャッシュを再取得 |
| セットの追加 | `useRecordSet`: `record_set` RPC（開いているセッションへは `p_session_id`、新規は `p_new_session`）。`set_no` はサーバーが採番 |
| セットの更新/削除 | `useUpdateSet` / `useDeleteSet` |
| 日付・時刻の変更 | `useUpdateSessionDateTime`（保存済みのセッションだけDB更新。新規は最初のセット保存時に反映） |
| セッション削除 | `useDeleteSession` |
| 有酸素の保存 | `useSaveCardio`: セッションをinsert → `cardio_logs` をupsert。upsertに失敗したらセッションを削除（補償） |
| 体重/食事 | `useSaveBodyWeight` / `useSaveMeal`（編集は同じフックに id を渡す）、`useDelete*` |
| メニューセット | `useSaveMenuSet`: `save_menu_set` RPC（作成/更新を1トランザクションで）、`useDeleteMenuSet`、`useReorderMenuSet`（`position` の更新） |

### 1.5 メニューセットの旧データ移行（`features/menu-sets/migrateLegacy.ts`）

旧版は localStorage `gl_menusets`（`[{id:'mset_…', name, menuIds:[…]}]`）に保存していた。

```
ログイン後、exercises と menu-sets の取得が終わったら（LegacyMenuSetMigration）:
  1. localStorage の gl_menusets を読む（無ければ何もしない）
  2. DBにすでにメニューセットがある場合は移行しない（二重移行防止）
  3. 各セットについて、menuIds のうちDBの exercises に存在するものだけで save_menu_set を呼ぶ
       - 存在しないメニューへの参照は除外し、件数を数える
       - 有効なメニューが1つも残らないセットは作らない
  4. 保存に失敗したセットが無ければ、gl_menusets を gl_menusets_migrated に改名する（再実行されない）。
     失敗があった場合は改名せず、次回の起動で再試行する
  5. 作成数と除外件数をトーストで知らせる
```

---

## 2. ロジック設計

### 2.1 1RM計算式

O'Conner式を採用する。

```
1RM = 重量 × (1 + 回数 ÷ 40)
```

実装：

```javascript
const orm = (w, r) => +(w * (1 + r / 40)).toFixed(1);
```

小数点第1位で四捨五入して返す。

### 2.2 メニュー統計計算（menuStats）

メニュー詳細画面の統計値を算出する。カテゴリによって算出内容が異なる。

**筋トレの場合**

```
入力: menuId（lib/stats.ts の menuStats）
処理:
  1. キャッシュ ['sessions'] のうち、そのメニューの全セッションをループ
  2. 各セッションの全セットで1RMを計算し、セッション内最大値を取得
  3. 全セッション横断で最大1RM・最大ボリューム・最終日付を更新
出力: { maxOrm, maxVol, lastDate, isCardio:false }
```

**有酸素運動の場合**

```
入力: menuId（lib/stats.ts の menuStats）
処理:
  1. キャッシュ ['sessions'] のうち、そのメニューの全セッションをループ
  2. cardio.dist・cardio.cal の最大値と最終日付を更新
出力: { maxDist, maxCal, lastDate, isCardio:true }
```

### 2.3 メニュー名バリデーション

```
- 全角・半角を問わず文字数を [...value].length でカウント
- 30文字を超えた時点で入力を即時カット（超過分を破棄）
- サロゲートペア（絵文字等）も1文字としてカウント
```

### 2.4 日付フォーマット

```javascript
// 入力: "2026-03-21"
// 出力: "2026年3月21日"
const fmtDate = d => {
  const [y, m, day] = d.split('-');
  return `${y}年${parseInt(m)}月${parseInt(day)}日`;
};
```

### 2.5 メニュー一覧の並び替え（つまみのドラッグ）

`lib/useSortable.ts` の `useSortable(items, onCommit)` を、メニュー一覧（部位内）とメニューセット詳細（セット内）で使う。Pointer Eventsを用いた自前実装（HTML5 Drag and Drop APIはタッチデバイスで動作しないため採用しない）。

```
行の左端の「つまみ」で pointerdown
  ├── つまみに setPointerCapture（ドラッグ中に他の行へホバーが移らない）
  ├── 4px 未満の動き → ドラッグ開始とみなさない（タップ。遷移も保存もしない）
  └── 4px 以上動いたらドラッグ開始
        ├── 行は translateY で指に追従
        ├── 他の行は CSS の order で並べ替えて見せる（DOM順は変えない。ポインタキャプチャを保つため）
        └── pointerup → 確定した並びで onCommit(ids) を呼ぶ
              ├── 保存が終わるまで画面上の並びは確定後のまま
              └── 失敗したらキャッシュは元の並びのまま（画面も戻る）、トーストで通知
```

- 並び替えは**同一部位（category）内に限定**する。他部位への移動はサポートしない
- 行本体のタップは従来どおりメニュー詳細へ遷移する。ドラッグ直後に誤って遷移しないよう、直後のクリックを1回抑止する
- 保存は部位内の全行の `sort_order` を連番で更新する。アーカイブ済みを非表示にしていても、非表示の行を含めて採番するため番号が衝突しない
- メニューセット内は `menu_set_items.position`

---

## 3. 画面詳細設計

> v2.0: 各画面は `src/features/<機能>/` のReactコンポーネント。データの読み書きは §1.3・§1.4 のフック経由。ここに書く入力項目・活性条件・表示ルールは旧版から引き継いでおり、変更した点だけ「v2.0」と注記する。

### 3.1 メニューの追加（add-menu）

#### 入力項目

| 項目 | 部品 | バリデーション |
|---|---|---|
| 部位 | セレクトボックス | 必須 |
| 種別 | チップ選択（複数候補から1つ） | 必須（有酸素運動選択時は非表示・自動セット） |
| メニュー名 | テキスト入力 | 必須・全角30文字以内 |

#### 追加ボタンの活性条件

部位・種別・メニュー名がすべて入力されている場合のみ活性化。部位は 胸 / 背中 / 肩 / 足 / 腕 / その他 / 有酸素運動。

#### 重複チェック

同一部位に同名のメニュー（アーカイブ済みを除く）が存在する場合はトーストでエラー表示し、追加しない。

v2.0: 画面の一覧での事前チェックに加え、DBの部分一意インデックス（`exercises_user_category_name_active_key`、`WHERE NOT archived`）が最終的に防ぐ。画面が古いまま操作して衝突した場合も、23505 を「同じ部位に同名のメニューがあります」に変換して表示する。メニューの編集・アーカイブ解除で同名の有効なメニューと衝突する場合も同様。

#### 有酸素運動の特殊処理

部位に「有酸素運動」を選択した場合、種別選択UIを非表示にし、`type` に「有酸素運動」を自動セットする。

---

### 3.2 メニュー一覧（menu-list）

#### 表示ロジック

```
1. キャッシュ ['exercises'] をフィルタリング
   - 通常表示: archived === false のみ
   - アーカイブ表示ON時: すべて表示
2. CATS 配列（['胸','背中','肩','足','腕','その他','有酸素運動']）の順でグループ化（メニューがある部位のみ）
3. 各グループ内は sort_order 順（つまみのドラッグで変更。§2.5）
4. 各メニュー行に最大1RMと最終記録日を表示
```

#### 行右側の表示（MYST-25対応）

| メニュー種別 | セッションあり | セッションなし |
|---|---|---|
| 筋トレ（マシン・フリーウェイト） | 最大1RM（kg）を表示 | 「未記録」テキストを表示 |
| 自重運動 | 何も表示しない（v2.0。旧版は「未記録」が出ていた） | 何も表示しない |
| 有酸素運動 | 何も表示しない | 何も表示しない |

有酸素運動・自重運動は1RMの概念がないため、右側には何も表示しない。

#### アーカイブトグル

- 右上の「アーカイブを表示」ボタンで切替
- アーカイブ済みメニューは破線ボーダー・opacity 0.6 で区別
- アーカイブ済みバッジ（amber色）を表示

---

### 3.3 メニュー詳細（menu-detail）

#### 表示内容

- メニュー名・タグ（種別・部位・アーカイブ状態）
- タグ重複の制御（MYST-26対応）：`type === category` の場合は部位タグを非表示にする。有酸素運動は `type="有酸素運動"` かつ `category="有酸素運動"` で同値になるため種別タグのみ表示する。
- 統計グリッド：最大1RM / 最大ボリューム / セッション数
- アクションボタン群
- セッション履歴テーブル（日付降順・同日は新しいセッションIDが上）

#### アクションボタン

| ボタン | 表示条件 | 動作 |
|---|---|---|
| 新規セッション | archived === false のみ | セット記録画面（`/menus/:id/sessions/new`）へ。この時点ではDBに何も作らない |
| アーカイブ | archived === false のみ | 確認ダイアログ → archived を true に変更 |
| アーカイブ解除 | archived === true のみ | archived を false に変更 |
| 完全削除 | 常に表示 | 確認ダイアログ → `exercises` から削除（セッション・セット・有酸素・セット内の所属はCASCADEで連鎖削除） |

#### セッション履歴テーブル列

| 列 | 内容 |
|---|---|
| 日付 | セッションの記録日 |
| セット数 | そのセッションのセット数 |
| 最大重量 | そのセッション内の最大使用重量 |
| ボリューム | 重量 × 回数 の合計（kg） |
| 1RM | そのセッション内の最大推定1RM |

---

### 3.4 セット記録（set-edit）

#### 新規セッション作成フロー

```
メニュー詳細の「新規セッション」押下
  └── /menus/:menuId/sessions/new へ遷移（sessionId = "new"）。DBにはまだ何も作らない
  └── 日付・時刻は画面内の下書き（初期値は今日・現在時刻）
  └── 最初のセット保存（record_set に p_new_session=true）でセッションとセットを1トランザクションで作成
        → 戻り値の session_id のURLに置き換え、以降は保存済みセッションとして扱う
  └── 何も保存せずに戻ると、DBに空のセッションは残らない
```

#### 既存セッション編集フロー

```
メニュー詳細の履歴行を押下
  └── /menus/:menuId/sessions/:sessionId へ遷移（既存データを表示）
  └── 戻り先は location.state.from（メニュー詳細・分析・ダッシュボードなど）
```

#### 日付・時刻変更

- 画面上部のdate・timeインプットから自由に変更可能
- 保存済みのセッション: 変更のたびに `useUpdateSessionDateTime` でDBを更新（サーバー応答までは入力値を表示）
- 新規セッション（未保存）: 下書きを変えるだけ。最初のセット保存時にその日付・時刻でセッションが作られる

#### セット追加

| 入力 | 部品 | inputmode |
|---|---|---|
| 重量（kg） | number input | decimal（小数点対応） |
| 回数 | number input | numeric（整数のみ） |

- 両方入力された時点で推定1RMをリアルタイムプレビュー表示
- 「セットを追加」ボタン押下で `record_set` RPC を呼び、サーバーが `set_no` を採番して追加する（保存済みセッションへは `p_session_id` を指定）。応答後に画面に反映

#### セット編集

- セット行をタップするとフォームに値を展開し編集モードへ
- 編集中の行は accent カラーでハイライト
- 「変更を保存」押下で該当セットを更新（`useUpdateSet`）
- キャンセルは入力フィールドをクリアしてフォームをリセット

#### セット削除

- 各セット行の ✕ ボタンで確認ダイアログ（`confirm()`）後に削除（`useDeleteSet`）
- 編集中のセットを削除した場合はキャンセル処理を同時実行

---

### 3.5 有酸素運動セット記録（set-edit / cardio）

カテゴリが「有酸素運動」のメニューでセット記録画面を開いた場合、重量・回数フォームの代わりに有酸素専用フォームを表示する。

#### 表示切替ロジック

```
isCardioMenu(menu) === true
  → 有酸素専用フォームを表示
isCardioMenu(menu) === false
  → 既存の筋トレフォームを表示（変更なし）
```

#### 入力項目

| 項目 | フィールドID | 単位 | inputmode | 必須 |
|---|---|---|---|---|
| 合計時間 | c-time | 分 | numeric | ✅ |
| 合計距離 | c-dist | km | decimal | ✅ |
| 消費カロリー | c-cal | kcal | numeric | ✅ |
| 平均心拍数 | c-hr | bpm | numeric | ✅ |
| 最大速度 | c-maxspd | km/h | decimal | 任意 |
| 平均速度 | c-avgspd | km/h | decimal | 任意 |

#### 保存フロー

```
入力中はコンポーネント内の状態だけを更新する（DBには送らない）
  └── 画面下部の「入力中のプレビュー」カードをリアルタイム更新

「記録を保存」押下
  └── 必須4項目（time / dist / cal / hr）の未入力チェック（0は未入力扱い）
  └── 未入力があればトースト「未入力項目: 合計時間・…」→ 保存しない
  └── 全必須項目が入力済みなら useSaveCardio:
        - 新規: セッションをinsert → cardio_logs をupsert（upsertに失敗したらセッションを削除）
        - 保存済み: cardio_logs をupsert（日付・時刻は §日付・時刻変更 の操作で別途更新）
  └── 成功したらトースト「記録を保存しました」→ 呼び出し元（メニュー詳細など）へ戻る
```

v2.0: 旧版は入力のたびに保存していたが、1回の「記録を保存」で送信する方式に変えた（書き込みの失敗を1か所で扱うため）。保存済みの有酸素セッションを開き直すと、保存済みの値が入力欄に入る。

#### プレビュー表示

入力済みの項目のみカード形式でリアルタイム表示する。null の項目は非表示。

#### 詳細画面との対応

有酸素運動メニューの詳細画面では以下に切り替わる。

| 要素 | 筋トレ | 有酸素運動 |
|---|---|---|
| 統計グリッド | 最大1RM / 最大ボリューム / セッション数 | 最大距離 / 最大消費Cal / セッション数 |
| 履歴テーブル列 | 日付 / セット数 / 最大重量 / ボリューム / 1RM | 日付 / 時間 / 距離 / 消費Cal / 平均心拍 |

---

### 3.6 メニューセット（menuset-list）

#### 表示ロジック

```
キャッシュ ['menu-sets'] を順に表示
各セットカードに:
  - セット名
  - 含まれるメニュー件数
  - 編集／削除ボタン（クリックはカード本体のクリックと分離）
カード本体をクリック → /menu-sets/:setId（セット詳細）へ遷移
```

#### 作成・編集モーダル（menuset-modal）

| 項目 | 部品 | バリデーション |
|---|---|---|
| セット名 | テキスト入力 | 必須・全角30文字以内 |
| 含めるメニュー | チェックボックスリスト（`['exercises']` の未アーカイブ分を列挙） | 1件以上必須 |

保存は `save_menu_set` RPC（新規は `p_id = null`、編集は既存id）。既存のセットは現在の並びを保ち、新しく加えたメニューは末尾に付く。

#### 削除

確認ダイアログ（`confirm()`）後に `menu_sets` から削除する（`menu_set_items` はCASCADE）。セットに含まれるメニュー自体・そのセッション記録は削除しない。

---

### 3.7 メニューセット詳細（menuset-detail）

セットに含まれるメニューを、メニュー一覧（menu-list）と同じ `.menu-row` 形式で一覧表示する画面（`/menu-sets/:setId`）。

```
セット詳細
  ├── set.exerciseIds を ['exercises'] から解決（存在しないメニューは除外）
  ├── 行左端のつまみのドラッグでセット内の並びを変更（menu_set_items.position。§2.5）
  └── 各行のタップでメニュー詳細へ（location.state.from に セット詳細 を渡す）
```

#### メニュー詳細への遷移と戻り先の制御

遷移時に渡す `location.state.from` で、戻るボタン（`#menu-detail-back`）の遷移先とラベル（`#menu-detail-back-label`）を切り替える。

| 遷移元 | 戻るボタンの動作 | ラベル |
|---|---|---|
| メニュー一覧（`from` なし） | `/menus` | 一覧に戻る |
| メニューセット詳細 | `/menu-sets/:setId` | セットに戻る |

#### メンバーメニューが削除されていた場合

メニューの完全削除ではFKのCASCADEで `menu_set_items` の行も消えるため、セット詳細には出なくなる（セット自体は残る）。全メンバーが削除済みの場合は空状態メッセージを表示する。

---

## 4. UI設計

### 4.1 デザインコンセプト

**Slate Clean**：ダークネイビーのヘッダー × ホワイトカード構成。スカイブルーをアクセントカラーとして数値・強調部分に使用。

### 4.2 カラートークン

#### ライトモード

| トークン | 値 | 用途 |
|---|---|---|
| `--text` | `#111827` | 主要テキスト |
| `--text2` | `#374151` | サブテキスト |
| `--text3` | `#6b7280` | ヒント・ラベル |
| `--accent` | `#0ea5e9` | アクセント（数値・ボタン） |
| `--nav-bg` | `#1e2130` | ヘッダー・サイドバー背景 |

#### ダークモード（`prefers-color-scheme: dark` で自動切替）

| トークン | 値 | 用途 |
|---|---|---|
| `--text` | `#f9fafb` | 主要テキスト |
| `--text2` | `#9ca3af` | サブテキスト |
| `--text3` | `#6b7280` | ヒント・ラベル |
| `--accent` | `#38bdf8` | アクセント |
| `--nav-bg` | `#0d0f14` | ヘッダー・サイドバー背景 |

### 4.3 タグ色定義

| 種別 | 背景 | 文字 |
|---|---|---|
| マシン | `--purple-bg` | `--purple-t` |
| フリーウェイト | `--accent-bg` | `--accent-t` |
| 自重運動 | `--green-bg` | `--green-t` |
| 有酸素運動 | `--amber-bg` | `--amber-t` |
| アーカイブ済 | `--amber-bg` | `--amber-t` |

### 4.4 部位ドットカラー

| 部位 | カラー |
|---|---|
| 胸 | `#f87171` |
| 背中 | `#fb923c` |
| 肩 | `#facc15` |
| 足 | `#4ade80` |
| 腕 | `#60a5fa` |
| 有酸素運動 | `#c084fc` |

---

## 5. Service Worker設計

`src/sw/sw.ts`（vite-plugin-pwa の injectManifest でビルドし、`sw.js` として出力）。判定ロジックは `src/sw/routing.ts` に純粋関数として切り出し、Vitestで検証する。

### 5.1 キャッシュ戦略

| リソース | 判定（`classifyRequest`） | 戦略 | キャッシュ名 |
|---|---|---|---|
| 画面（navigate） | `request.mode === 'navigate'`（自オリジン） | NetworkFirst（3秒でタイムアウト → キャッシュ）。200のみ保存 | `app-shell` |
| JS・CSS・worker・manifest | `destination` が script/style/worker/manifest | NetworkFirst（3秒）。200のみ保存 | `app-assets` |
| アイコン等の画像 | `destination === 'image'` | StaleWhileRevalidate | `app-assets` |
| Googleフォント | `fonts.googleapis.com` / `fonts.gstatic.com` | StaleWhileRevalidate | `google-fonts` |
| OAuth同意画面 | パスに `/oauth-consent.` を含む | **SWは何もしない**（常にネットワーク） | — |
| Supabase など外部オリジン | 自オリジン以外 | **SWは何もしない**（ルートを登録しない） | — |

- キャッシュ照合は `ignoreVary: true`。配信元が `Vary: Origin` を返すと、`crossorigin` 属性付きの `<script>` のリクエスト（Originヘッダーあり）が、インストール時に入れたキャッシュ（Originなし）に一致せず、オフラインで読み込めなくなるため。

### 5.2 インストール・アクティベート

```
install:
  - 今の版の画面（./ と ./index.html）と、ビルド時に差し込まれたファイル一覧（__WB_MANIFEST。
    oauth-consent.* は除外）を取得してキャッシュに入れる（1つ失敗しても全体は失敗させない）
  - skipWaiting() は呼ばない（待機状態にする）

activate:
  - 旧アプリのキャッシュ（gymlog-*）を削除（sw/legacyCaches.ts）
  - 今の版では使わない古い /assets/ 配下のハッシュ付きファイルをキャッシュから削除
  - clientsClaim()

message:
  - { type: 'SKIP_WAITING' } を受けたら skipWaiting()（画面の「更新」ボタン）
```

### 5.3 更新の流れ

`components/UpdateBanner`（`useRegisterSW`、`registerType: 'prompt'`）が新しい版の待機を検出すると「新しいバージョンがあります」と「更新」ボタンを表示する。「更新」を押すと `SKIP_WAITING` を送って新しい版に切り替え、ページを再読み込みする（入力中に突然リロードしないため）。

### 5.4 検証

`e2e/pwa.spec.ts`（本番ビルドに対するE2E）と `src/sw/sw.test.ts`（判定ロジック）。

---

## 6. 状態管理設計

| 種類 | 置き場所 |
|---|---|
| サーバーの状態（メニュー・セッション・体重・食事・メニューセット） | TanStack Query のキャッシュ（§1.3）。画面は `useExercises()` などのフックで読む |
| 認証 | `features/auth/AuthProvider`（`useAuth()`）。未ログインなら `LoginPage` だけを表示。ログアウト/ユーザー切替で Query のキャッシュとIndexedDBを消す |
| 画面の一時状態（入力中の値、編集中のセット、モーダルの開閉、アーカイブ表示トグル） | 各コンポーネントの `useState` |
| 画面の位置 | URL（HashRouter）。分析画面のタブ・年月・選択日は `?tab=&y=&m=&d=` |
| 戻り先 | 遷移時に `location.state.from` を渡す（メニュー詳細・セット記録の「戻る」） |
| トースト | `lib/toast.ts` のイベントバス → `ToastHost` が `#toast` を表示 |
| 読み込み表示 | `TopProgress`（上部の進捗バー）、`BootOverlay`（初回の読み込み） |

旧版のグローバル状態 `S` と `persist()` は廃止した。

---

## 7. CSV機能設計

### 7.1 エクスポート

#### 筋トレCSVフォーマット

```
menu_name,category,type,date,session_id,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg
```

| 列名 | 内容 | 備考 |
|---|---|---|
| menu_name | メニュー名 | 引用符付きで出力 |
| category | 部位 | 胸 / 背中 / 肩 / 足 / 腕 |
| type | 種別 | マシン / フリーウェイト / 自重運動 |
| date | 記録日 | YYYY-MM-DD形式 |
| session_id | セッションID | アプリ内部ID（再インポート時の重複検知に使用） |
| set_no | セット番号 | 1始まりの連番 |
| weight_kg | 使用重量（kg） | |
| reps | 挙上回数（回） | |
| estimated_1rm_kg | 推定1RM（kg） | O'Conner式で自動計算 |
| volume_kg | セット内ボリューム（kg） | 重量 × 回数 |

#### 有酸素運動CSVフォーマット

```
menu_name,category,date,session_id,time_min,dist_km,cal_kcal,hr_bpm,max_spd_kmh,avg_spd_kmh
```

| 列名 | 内容 | 備考 |
|---|---|---|
| menu_name | メニュー名 | 引用符付きで出力 |
| category | 部位 | 有酸素運動 固定 |
| date | 記録日 | YYYY-MM-DD形式 |
| session_id | セッションID | |
| time_min | 合計時間（分） | |
| dist_km | 合計距離（km） | |
| cal_kcal | 消費カロリー（kcal） | |
| hr_bpm | 平均心拍数（bpm） | |
| max_spd_kmh | 最大速度（km/h） | 未入力時は空欄 |
| avg_spd_kmh | 平均速度（km/h） | 未入力時は空欄 |

#### エクスポートの操作場所

| 操作場所 | 出力範囲 |
|---|---|
| サイドバー「CSV出力 / 入力」→ 筋トレ記録をエクスポート | 全筋トレメニュー一括 |
| サイドバー「CSV出力 / 入力」→ 有酸素運動記録をエクスポート | 全有酸素メニュー一括 |
| メニュー詳細画面「CSV出力」ボタン | そのメニュー単体（筋トレ・有酸素を自動判定） |

ファイル名形式：`gymlog_{メニュー名 or strength/cardio}_{YYYY-MM-DD}.csv`
エンコード：UTF-8 BOM付き（Excel文字化け対策）

---

### 7.2 インポート

#### 処理方針

| ケース | 動作 |
|---|---|
| 重複セッション | スキップ（既存データ優先。上書きなし）。判定は下記 |
| アプリ未登録のメニュー名 | 自動で新規メニューを登録してから取り込む |
| session_idが空欄 | 同日・同時刻・同メニューの行を同一セッションに自動まとめ |
| 取り込み中の失敗 | 作成済みのセッションを取り消す（途中までのデータを残さない） |

v2.0: 重複の判定は次のいずれかに一致するとき（`features/csv/importCsv.ts`）。
(a) CSVの `session_id` が既存セッションのidと一致する（エクスポートしたファイルの再インポート）
(b) 同じメニュー・日付・時刻で、セット内容（筋トレ）／有酸素の値が完全に同じセッションが既にある
(b) により、session_id が違っても同じ内容のCSVを2回取り込んでも二重登録にならない。
筋トレは1セッションにつき `sets` を1回のINSERTでまとめて登録する。

#### session_id の扱い

```
【Workout trackerからエクスポートしたCSVを再インポートする場合】
  session_idあり → 既存IDと照合 → 重複ならスキップ（内容が同じ場合もスキップ）

【他アプリ・手入力CSVをインポートする場合】
  session_id空欄 → 同日同メニュー（同時刻）をキーに1セッションへまとめる
  例: 同じ日付・同じメニュー名の行は全て1セッションにまとめられる
```

手入力CSVのサンプル（session_id空欄）：

```csv
menu_name,category,type,date,session_id,set_no,weight_kg,reps
ベンチプレス,胸,フリーウェイト,2026-03-10,,1,80,10
ベンチプレス,胸,フリーウェイト,2026-03-10,,2,85,8
ベンチプレス,胸,フリーウェイト,2026-03-10,,3,82,6
```

#### 結果表示

インポート完了後、画面上に以下の件数を表示する（`ImportSummary`）。

- インポートした件数（`imported`）
- 重複スキップ件数（`skipped`）
- 未登録メニューの新規登録件数（`menuCreated`）
- エラー件数（`errors`）

データ行が無い（ヘッダーのみ・空）CSVはエラー表示（`CsvFormatError`）。CSV由来の文字列（メニュー名など）は常にテキストとして描画する（§11.1）。

---

## 8. メニュー分析設計

### 8.1 分析画面（analysis）

カレンダービューとメニュービューをタブで切り替えるページ（`/analysis`）。

v2.0: 状態は画面内の変数ではなくURLのクエリに持つ。戻る・再読み込みで復元される。

| クエリ | 内容 |
|---|---|
| `tab` | `cal`（カレンダー、既定）/ `menu`（メニュー別） |
| `y`, `m` | カレンダーの表示年・月（月は1〜12。省略時は今月） |
| `d` | 選択中の日付（YYYY-MM-DD） |

分析詳細は別ルート `/analysis/:menuId`。

---

### 8.2 カレンダービュー

#### 表示仕様

- 月単位で表示。前月・翌月ボタンで切替
- 記録のある日付：アクセントカラー背景＋ドット表示
- 今日の日付：数字を丸囲み表示
- 記録のない日付：タップ不可

#### 記録日の判定

```
キャッシュ ['sessions'] の全セッションを走査
→ session_date が表示月（YYYY-MM）で始まる → 記録日に追加
→ カレンダーセルに has-record クラスを付与
```

#### 日付タップ時の動作（F-02・F-03対応）

```
日付タップ → クエリ d=YYYY-MM-DD を更新
  └── その日のセッションを全メニューから収集し、カレンダー下部に展開表示

一覧のセッション行タップ → /menus/:menuId/sessions/:sessionId へ遷移   ← F-02
  └── location.state.from に 分析画面（現在の tab/y/m/d を含む） を渡す
  └── セット記録画面の戻るボタンで、同じ月・同じ選択日の分析画面へ戻る     ← F-03
```

#### セッション一覧の表示内容（F-01対応）

| 種別 | 表示項目 |
|---|---|
| 筋トレ | メニュー名 / セット数 / 最大1RM / ボリューム（3行） |
| 有酸素運動 | メニュー名 / 記録サマリー（時間・距離・消費Cal）（2行） |

「詳細 →」テキストは表示しない。

---

### 8.3 メニュービュー

- 筋トレメニュー（有酸素除く）を部位グループで一覧表示
- 表示対象カテゴリ：胸 / 背中 / 肩 / 足 / 腕 / その他（`ANALYSIS_CATEGORIES`。有酸素運動は対象外）
- 各行にセッション数・最大1RMを表示
- 行タップ → 分析詳細（analysis-detail）へ遷移

---

### 8.4 分析詳細（analysis-detail）

#### データ集計

```
対象: キャッシュ ['sessions'] のうち、そのメニューの全セッション
条件: sess.sets が存在かつ1件以上
ソート: date 昇順（古い順）

各セッションから計算:
  ボリューム = Σ(weight × reps)
  最大1RM   = max(weight × (1 + reps / 40))
```

#### グラフ仕様

| 項目 | 内容 |
|---|---|
| ライブラリ | Chart.js 4（npmでバンドル。react-chartjs-2） |
| グラフ種別 | 折れ線グラフ固定 |
| X軸 | セッション日付（月/日 表示） |
| Y軸 | kg（beginAtZero: false） |
| 読み込みタイミング | グラフを表示する画面を初めて開いたときのみ（別チャンクを遅延読み込み） |

#### Chart.js 遅延読み込み

`components/LazyLineChart` が `React.lazy` で `LineChart`（Chart.jsを含む別チャンク）を読み込み、読み込み中は `Suspense` のフォールバックを表示する。ChartのインスタンスはReactのライフサイクルに従って生成・破棄される。体重ログの推移グラフも同じ部品を使う。

#### テーブル表示

| 列 | 内容 |
|---|---|
| 日付 | セッションの記録日 |
| ボリューム | そのセッションの合計ボリューム（kg） |
| 最大1RM | そのセッションの最大推定1RM（kg） |


---

## 9. RM換算表設計（rm）

### 9.1 計算式

| 種目 | 推定1RM | Nrepの重量（逆算） |
|---|---|---|
| ベンチプレス | `w × r ÷ 40 + w` | `1RM ÷ (r ÷ 40 + 1)` |
| スクワット・デッドリフト | `w × r ÷ 33.3 + w` | `1RM ÷ (r ÷ 33.3 + 1)` |

### 9.2 丸め仕様

参考表（https://fwj.jp/magazine/rm/）と同一ロジックで整数表示する。

```javascript
function rmRound(n) {
  const dec = n - Math.floor(n);
  return dec >= 0.5 ? Math.ceil(n) : Math.floor(n);
}
```

| 小数部の範囲 | 処理 | 例 |
|---|---|---|
| 0.000 | 整数そのまま | 100.000 → 100 |
| 0.001〜0.499 | 切り捨て | 47.250 → 47 |
| 0.500〜0.999 | 切り上げ | 52.500 → 53 |

### 9.3 機能仕様

#### ブロック①：推定1RM計算

```
入力: 重量（kg）・回数（rep）
処理: リアルタイム計算（oninput）
出力: ベンチプレス推定1RM / スクワット・デッドリフト推定1RM（整数）
表示条件: 重量 > 0 かつ 回数 >= 1 のときのみ結果カードを表示
```

#### ブロック②：1〜10rep換算一覧

```
入力: 最大RM（kg）
  ├── ①の計算結果（ベンチプレス推定1RM）から自動連動
  └── または直接手入力
処理: 1rep〜10rep それぞれで扱える重量を逆算
  ├── 1rep: 最大RMそのまま
  └── 2〜10rep: rmWeightFromMax(max, r, divisor) で計算
表示条件: 最大RM > 0 のときのみテーブルを表示
ハイライト: 入力した回数（rm-inp-r）に対応する行を rm-highlight クラスで強調
```

#### ページリセット

```
go('rm') 呼び出し時に initRMPage() を実行
  └── rm-inp-w, rm-inp-r, rm-inp-max をクリア
  └── 推定1RM結果を非表示
  └── 換算テーブルをエンプティ状態に戻す
```

---

## 10. ファイル構成

基本設計書 2.3 を参照。主な責務は次のとおり。

| 場所 | 責務 |
|---|---|
| `src/app/` | ルーティング（`routes.tsx`）、Queryの設定・永続化（`queryClient.ts`） |
| `src/api/` | DBアクセスとTanStack Queryのフック（§1.3, §1.4）。画面からテーブルを直接触らず、ここを経由する |
| `src/features/<機能>/` | 画面とその専用部品。`session/`（セット・有酸素記録）、`menus/`、`menu-sets/`、`analysis/`、`body/`（体重・食事）、`rm/`、`csv/`、`settings/`、`dashboard/`、`auth/` |
| `src/components/` | 共通部品（`AppLayout`, `Sidebar`, `FooterNav`, `ui`, `LineChart`, `ToastHost` など） |
| `src/lib/` | 純粋な処理（`one-rm`, `stats`, `format`, `csv`）とユーティリティ（`errors`, `toast`, `supabase`, `useSortable`） |
| `src/sw/` | Service Worker |
| `src/styles/global.css` | 旧アプリのCSSをそのまま流用（ID・クラスも維持） |

見た目に関わるID・クラス名は旧版のものを維持する（E2Eのロケーターと互換のため）。

---

## 11. セキュリティ方針（恒久ルール）

本アプリはGitHub Pagesで配信されるクライアントのPWAで、データはSupabase（RLSで本人のみ）。ソースは公開されているため、秘密情報はリポジトリに入れない。

### 11.1 描画のエスケープ

- Reactの描画は文字列を自動でエスケープする。利用者由来の値（メニュー名・セット名・CSVの内容）は常にテキストとして描画する。
- `dangerouslySetInnerHTML` を使わない（現在の使用はゼロ）。新しい画面でも、利用者由来の値をHTML文字列として組み立てない。
- E2Eで確認: TC-01-13（メニュー名）、TC-11-06（セット名）、TC-08-09（CSV）。

### 11.2 外部スクリプト

Chart.jsなどはnpmでバンドルする（CDNから読み込まない）。したがってSRIは不要。依存は `package-lock.json` で固定し、`npm ci` でインストールする。

### 11.3 CSP（Content Security Policy）

`vite.config.ts` のプラグイン（`cspPlugin`）が、**本番ビルドの `index.html` にだけ** `<meta http-equiv="Content-Security-Policy">` を埋め込む（GitHub Pagesはレスポンスヘッダを設定できないため。開発サーバーはReact Fast Refreshがインラインスクリプトを差し込むためCSPなし）。

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' <SupabaseのOrigin>;
worker-src 'self';
manifest-src 'self';
form-action 'self';
base-uri 'self'
```

- `script-src` にも `style-src` にも `'unsafe-inline'` / `'unsafe-eval'` を含めない（旧版は `onclick` 属性などのため外せなかったが、Reactのイベントハンドラ化で撤去した）。ReactやChart.jsの `style` の指定はCSSOM経由で行われるため、これで動作する。
- E2E（TC-PWA-05）で、本番ビルドがCSP違反なしで動くことを確認する。
- `oauth-consent.html` は単独の静的ページで、自身のCSP（`script-src 'self'`）を持つ。

### 11.4 鍵とリポジトリの衛生

- クライアントに埋め込むのは publishable key（公開前提）のみ。**secret key（Service Role）はコード・設定・CIのどこにも使わない**（E2Eのテストコードだけがローカルのsecret keyを環境変数から読み、本番には接続しない）。
- DBパスワード・署名鍵（`supabase/signing_keys.json`）・`.env*` はコミットしない（`.gitignore`）。CIではローカル用の署名鍵をその場で生成する。
- 本番DBの変更は `supabase db push` で行い、実行前にSQLを確認する。
