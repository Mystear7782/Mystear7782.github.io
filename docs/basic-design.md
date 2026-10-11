# Workout tracker 基本設計書

## 改訂履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0〜1.6 | 2026-03-21〜08-15 | 素のJS版（localStorage保存）の設計。1.6はメニューセット詳細・長押し並び替え・部位「その他」まで |
| 2.0 | 2026-10-11 | **React移行（フェーズ3）に合わせて全面改訂**。Vite + React + TypeScript、データはSupabase(PostgreSQL)、認証・ダッシュボード・体重・食事、メニューセットのDB化、ドラッグハンドル方式の並び替え、自作Service Worker、CSP強化、MCP連携を反映。旧版の記述（localStorage・CDN読み込み・`unsafe-inline`）は削除 |

旧版（素のJS版）の機能との差分は `docs/migration-diff.md` を参照。

---

## 1. プロジェクト概要

### 1.1 目的

個人の筋トレ・体重・食事を記録・管理するWebアプリケーション。iPhoneのホーム画面からネイティブアプリと同等の操作感で利用できる。あわせて、Claude（スマホ/Web/Claude Code）から同じデータを読み書きできる（MCPサーバー。`docs/mcp-design.md`）。

### 1.2 開発方針

- PWA方式で実装し、App Store申請・Macなしで開発・公開できる構成とする
- データはSupabase（PostgreSQL + Row Level Security）に保存する。PWAとMCPサーバーが同じDBを読み書きする
- 閲覧データは端末のIndexedDBにも保存し、オフラインでも過去の記録を見られる（書き込みはオンライン時のみ）
- GitHub Pagesで静的ホスティングする（GitHub Actionsでビルドして公開）

### 1.3 対象ユーザー

個人利用（開発者自身）

---

## 2. システム構成

### 2.1 技術スタック

| 項目 | 採用技術 | 理由 |
|---|---|---|
| ビルド | Vite | 高速な開発サーバーとビルド |
| UI | React 19 + TypeScript(strict) | 画面ごとの部品化・型によるDBとの整合 |
| ルーティング | React Router（HashRouter） | GitHub Pagesは単一ページ以外のフォールバックが無いため、パスに `#` を使う |
| サーバー状態 | TanStack Query | 取得・再取得・キャッシュ・失敗時の扱いを統一。画面復帰時に再取得し、IndexedDB（idb-keyval）へ永続化 |
| DB・認証 | Supabase（supabase-js） | PostgreSQL + RLS。ログインはメールアドレス/パスワード |
| グラフ | Chart.js（react-chartjs-2、npmでバンドル） | 体重・ボリューム・1RMの推移。画面を開いたときに遅延読み込み |
| PWA | vite-plugin-pwa（injectManifest）+ 自作Service Worker | キャッシュ方針を細かく制御するため |
| スタイル | 旧アプリの `style.css` をグローバルCSSとして流用 | 見た目を変えない |
| テスト | Vitest + Testing Library / Playwright / pgTAP / Deno | `docs/test-e2e-knowledge.md` |
| CI/CD | GitHub Actions | 型チェック・lint・テスト・ビルド・デプロイ |
| ホスティング | GitHub Pages | 無料。Source を「GitHub Actions」にして公開 |

### 2.2 システム構成図

```
開発環境（Windows PC）
　└── VS Code / Docker Desktop（ローカルSupabaseでテスト）
　└── Git でバージョン管理

GitHub（リポジトリ）
　└── main に push → Actions: ビルド → GitHub Pages へ公開

iPhone（Safari / ホーム画面のPWA）
　├── GitHub Pages から アプリ(HTML/JS/CSS) を取得
　├── Supabase に直接アクセス（ログイン済みユーザー本人のトークン。RLSで自分のデータのみ）
　└── IndexedDB に閲覧データをキャッシュ（オフライン閲覧用）

Claude（スマホ / Web / Claude Code）
　└── MCPサーバー（Supabase Edge Function）→ 同じDB（OAuth 2.1でユーザー本人の権限）
```

### 2.3 リポジトリ構成

```
training_recorder/
├── index.html                  Viteのエントリ（CSPは本番ビルド時に埋め込む）
├── src/
│   ├── main.tsx, App.tsx       エントリ・プロバイダー（認証・Query・永続化）
│   ├── app/                    routes.tsx（画面のルーティング）, queryClient.ts（Query設定・永続化）
│   ├── api/                    テーブル別のデータ取得・更新（TanStack Queryのフック）
│   ├── features/               画面別（dashboard, menus, session, menu-sets, analysis, body, rm, csv, settings, auth）
│   ├── components/             共通部品（レイアウト・サイドバー・フッター・トースト・グラフ・モーダル）
│   ├── lib/                    supabaseクライアント・定数・日付・1RM・集計・CSV・並び替えフック
│   ├── sw/                     Service Worker（sw.ts, routing.ts, legacyCaches.ts）
│   ├── styles/global.css       旧アプリのCSS（デザイントークン含む）
│   └── types/                  database.ts（DB型の自動生成）, domain.ts
├── public/                     manifest用アイコン, oauth-consent.html/js/css（単独の静的ページ）
├── e2e/                        Playwright E2Eテスト
├── supabase/                   migrations/, tests/database/(pgTAP), functions/mcp/(MCPサーバー), config.toml
├── scripts/gen-types.mjs       DB型の生成
├── legacy/                     旧アプリ（素のJS版）。参照用
├── docs/                       設計書
└── .github/workflows/          ci.yml, deploy.yml
```

---

## 3. 機能一覧

### 3.1 実装済み機能

| 機能 | 概要 |
|---|---|
| ログイン / ログアウト | メール+パスワード（Supabase Auth）。ログイン状態は端末に保存。設定画面でアカウント表示とログアウト |
| ダッシュボード | 直近7日のセッション数・総ボリューム・体重変化、クイック記録、最近の記録（セッション+体重） |
| メニューの追加 | 部位（胸・背中・肩・足・腕・その他・有酸素運動）・種別・名前。同じ部位に同名の有効なメニューは作れない（画面とDBの両方で防ぐ） |
| メニュー一覧 | 部位グループ別。行左端の「つまみ」のドラッグで部位内を並び替え（DBに保存）。アーカイブの表示切替 |
| メニューの編集 / アーカイブ / 完全削除 | 名前・部位・種別の変更。アーカイブは一覧から非表示（記録は保持）。完全削除は記録も連鎖削除 |
| メニュー詳細 | 最大1RM・最大ボリューム・セッション数、セッション履歴（自重は総回数、有酸素は距離・カロリー等）、個別CSV出力 |
| セット記録（筋トレ） | 重量・回数・1RMプレビュー。セットの追加・編集・削除。日付・時刻の変更。自重運動は重量欄なし。新規セッションは最初のセット保存時に作成（空のセッションが残らない） |
| 有酸素運動記録 | 時間・距離・消費Cal・平均心拍（必須）、最大/平均速度（任意） |
| セッション削除 | メニュー詳細の履歴から削除 |
| メニューセット | 名前を付けたメニューの組み合わせ。一覧 → セット詳細（含まれるメニュー）→ メニュー詳細。セット内の並び替え。DBに保存（旧localStorageからは初回に自動移行） |
| メニュー分析 | カレンダー（記録日の強調・日付タップでセッション一覧）とメニュー別（ボリューム/最大1RMの推移グラフ） |
| 体重ログ | 記録・編集・削除（同日複数回可）、推移グラフ（2件以上） |
| 食事記録 | P/F/Cから推定カロリー表示、日別の合計。保存値はDBの生成列（P×4+F×9+C×4） |
| RM換算表 | ベンチプレス・スクワット/DLの推定1RMと1〜10rep換算 |
| CSV出力・入力 | 筋トレ/有酸素の出力（全体・個別）、取り込み（未登録メニューは自動登録、重複はスキップ） |
| オフライン閲覧 | 保存済みキャッシュと自作Service Workerにより、通信が無くても過去の記録を閲覧できる |
| アプリ更新通知 | 新しい版が見つかるとバナーを表示し、「更新」で切り替える |
| MCP連携 | Claudeから食事・体重・セットなどを記録・集計（`docs/mcp-design.md`） |

### 3.2 バックログ

| ID | 機能 | ステータス |
|---|---|---|
| B-02a | グラフ切替（折れ線→棒） | 保留 |
| B-06 | メニュー一覧: 最終記録からの経過日数 | 未対応 |
| B-14 | メニューセットからの一括記録（セット内メニューを連続して記録） | 未対応 |
| B-15 | 取得上限への対応（期間指定・ページング取得のRPC化）。現状はページ分割で全件取得 | 検討 |
| B-16 | MCPの対象テーブルへの `menu_sets` / `menu_set_items` の追加 | 要相談 |

---

## 4. 画面一覧

| 画面名 | ルート | 概要 |
|---|---|---|
| ログイン | （未ログイン時） | メール+パスワード |
| ダッシュボード | `/` | 初期画面 |
| メニュー一覧 | `/menus` | 部位ごと。並び替え |
| メニューの追加 | `/menus/new` | |
| メニュー詳細 | `/menus/:menuId` | 統計・履歴・操作 |
| セット記録 / 有酸素記録 | `/menus/:menuId/sessions/:sessionId`（`new` は新規） | |
| メニューセット | `/menu-sets` | |
| セット詳細 | `/menu-sets/:setId` | |
| メニュー分析 | `/analysis`（`?tab=menu&y=&m=&d=`） | カレンダー / メニュー別 |
| 分析詳細 | `/analysis/:menuId` | グラフ+表 |
| 体重ログ | `/weight` | |
| 食事記録 | `/meal` | |
| RM換算表 | `/rm` | |
| CSV出力 / 入力 | `/csv` | |
| 設定 | `/config` | アカウント・ログアウト |
| OAuth同意画面 | `/oauth-consent.html`（単独ページ） | MCP連携の許可 |

画面遷移の詳細は `docs/screen-transition.md`。

---

## 5. 非機能要件

### 5.1 動作環境

| 項目 | 要件 |
|---|---|
| 対象端末 | iPhone（Safari / PWAモード） |
| オフライン | 過去の記録の閲覧は可能。書き込みはオンライン時のみ（オフライン中の書き込みはエラーを知らせる） |
| ダークモード | 端末設定に自動連動（`prefers-color-scheme`） |
| フォント | Noto Sans JP |

### 5.2 セキュリティ

| 項目 | 方針 |
|---|---|
| データ保護 | 全テーブルにRLS。`authenticated` ロールのみ、本人の行だけ読み書き可（`docs/db-design.md`） |
| 鍵 | クライアントに埋め込むのは publishable key のみ（公開してよいキー）。Service Role Key（secret key）はどこにも使わない |
| CSP | 本番ビルドの `<meta>` に `script-src 'self'`（`unsafe-inline`・`unsafe-eval` なし）、`connect-src` は自分とSupabaseのみ。外部スクリプト(Chart.js等)はnpmでバンドル |
| XSS | Reactの描画により、利用者由来のテキスト（メニュー名・セット名・CSVの内容）は常にエスケープされる（テストで確認） |
| ログイン | ログイン状態は supabase-js が localStorage に保存。ログアウト/ユーザー切替時に端末のキャッシュ（IndexedDB）を消す |
| エラー表示 | ユーザーには簡潔な日本語のメッセージのみ。詳細は console に出す |
| 公開リポジトリ | コード・マイグレーションは公開される。秘密情報（DBパスワード・署名鍵・secret key）は含めない |

### 5.3 データ保存

| 項目 | 内容 |
|---|---|
| 正の保存先 | Supabase（PostgreSQL） |
| 端末のキャッシュ | IndexedDB（TanStack Queryの永続化。最大7日）。ログアウトで削除 |
| 旧localStorage | 旧アプリのデータ（`gl_menusets`）は初回起動時にDBへ移行し、`gl_menusets_migrated` として残す。`gl_menus` / `gl_sessions` はSupabase移行済みで使わない |
| バックアップ | CSVエクスポート。Supabase側のバックアップはSupabaseの機能に依存 |

### 5.4 データの鮮度

TanStack Queryの再取得: アプリ起動時（保存済みキャッシュを表示しつつ最新を取得）、画面に戻ったとき（取得から15秒以上経っていれば）、書き込み成功時（サーバーの応答でキャッシュを更新）。MCP（Claude）で書いた記録は、アプリを開き直すか画面に戻ったときに反映される。

---

## 6. デプロイ・運用

### 6.1 デプロイ手順

```
1. main に push（または Actions の「Deploy to GitHub Pages」を手動実行）
2. Actions がテスト(型・ユニット)→ビルド → GitHub Pages へ公開
3. iPhoneは次回起動時に新しい版を取得。画面上部に「新しいバージョンがあります」と出たら「更新」を押す
```

前提: リポジトリの Settings > Pages > Source が「GitHub Actions」。

### 6.2 初回の切り替え手順（旧アプリ → React版）

1. Settings > Pages > Source を「GitHub Actions」に変更する
2. React版のブランチを main にマージして push（deploy.yml が実行され公開される）
3. iPhoneのPWAを完全終了して再起動し、ログイン・記録・オフライン閲覧・メニューセット移行を確認する

> 順序を逆にすると（先にマージ）、Source が「ブランチから」のままリポジトリ直下のソースが公開され、アプリが動かなくなる。

### 6.3 Service Workerの方針

| 対象 | 戦略 |
|---|---|
| 画面(HTML)・JS・CSS | ネットワーク優先。3秒以内に応答があればそれを使い、遅い/つながらないときはキャッシュ。正常な応答(200)だけをキャッシュ |
| Supabaseへの通信 | **一切キャッシュしない**（Service Workerは関与しない）。旧アプリでは、GETの応答が古いままキャッシュされ「直接selectが0件」になる不具合があった |
| OAuth同意画面 | 常にネットワーク（キャッシュしない） |
| Googleフォント | stale-while-revalidate |
| インストール時 | 今の版の画面・JS・CSS・アイコンをあらかじめキャッシュ（初回訪問の直後にオフラインになっても起動できる） |
| 有効化時 | 旧アプリのキャッシュ（`gymlog-*`）と、古い版のハッシュ付きファイルを削除 |
| 更新 | 新しい版は待機状態になり、画面の「更新」で切り替える |

### 6.4 PWAが更新されない場合

1. アプリスイッチャーから完全終了 → 再起動
2. 画面上部の「新しいバージョンがあります」→「更新」
3. それでも古い場合: SafariでURLを直接開いて再読み込み（ホーム画面のアイコンを削除するとログイン状態・端末のキャッシュが消えるが、データはSupabaseにあるので失われない）
