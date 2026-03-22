# GymLog E2Eテスト環境構築ナレッジ

## 改訂履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-03-22 | 初版作成 |

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| テストフレームワーク | Playwright（Python） |
| テストランナー | pytest |
| 対象ブラウザ | Chromium |
| 対象URL | `https://mystear7782.github.io/` |
| IDE | Visual Studio Code |

---

## 2. 前提条件

以下がインストール済みであること。

| ツール | バージョン確認コマンド |
|---|---|
| Python 3.10以上 | `python --version` |
| pip | `pip --version` |
| Node.js（任意） | `node --version` |

---

## 3. インストール手順

### 3.1 Playwrightのインストール

```bash
# Playwright本体とpytestプラグインをインストール
pip install playwright pytest-playwright

# テスト用ブラウザ（Chromium）をインストール
playwright install chromium
```

### 3.2 VSCode拡張機能のインストール

VSCodeの拡張機能タブ（`Ctrl+Shift+X`）で以下を検索してインストールする。

```
Playwright Test for VSCode
公開者: Microsoft
```

---

## 4. ディレクトリ構成

```
gym-log/                              ← VSCodeで開くルートフォルダ
│
├── index.html                        ← アプリ本体
├── manifest.json
├── sw.js
│
├── pytest.ini                        ← pytest設定（テスト探索パスを指定）
│
├── docs/                             ← 設計ドキュメント
│   ├── basic-design.md
│   ├── detail-design.md
│   ├── screen-transition.md
│   ├── usecase.md
│   └── test-cases-e2e.md
│
└── tests/
    └── e2e/
        ├── conftest.py               ← 共通フィクスチャ（全テストで自動読み込み）
        ├── test_01_menu_add.py       ← TC-01系: メニュー追加・ナビゲーション
        ├── test_02_03_menu_list_archive.py  ← TC-02〜03系: 一覧・アーカイブ・削除
        ├── test_04_set_record.py     ← TC-04・06系: セット記録・メニュー詳細
        ├── test_05_cardio_record.py  ← TC-05系: 有酸素運動記録
        ├── test_07_analysis.py       ← TC-07系: メニュー分析
        └── test_08_csv.py            ← TC-08系: CSV出力・入力
```

### ファイルの役割

| ファイル | 役割 |
|---|---|
| `pytest.ini` | テスト探索パス・命名規則を定義。VSCode拡張がこのファイルを読んでテストを検出する |
| `conftest.py` | ブラウザ起動・localStorage初期化・テストデータ投入などの共通フィクスチャ。pytestが自動で読み込む |
| `test_*.py` | テストケースの実装ファイル。機能カテゴリごとに分割 |

---

## 5. 設定ファイル

### pytest.ini

```ini
[pytest]
testpaths = tests/e2e
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

| 設定項目 | 説明 |
|---|---|
| `testpaths` | テストファイルを探索するディレクトリ |
| `python_files` | テストファイルと認識するファイル名パターン |
| `python_classes` | テストクラスと認識するクラス名パターン |
| `python_functions` | テスト関数と認識する関数名パターン |

---

## 6. VSCodeでのテスト実行手順

### 6.1 初回セットアップ

1. VSCodeで `gym-log` フォルダをルートとして開く
   ```
   ファイル → フォルダを開く → gym-log を選択
   ```

2. フラスコアイコンが左サイドバーに表示されない場合は、コマンドパレットから設定する
   ```
   Ctrl+Shift+P → "Python: Configure Tests" → pytest を選択 → tests/e2e を指定
   ```

### 6.2 テストの実行方法

| 方法 | 操作 |
|---|---|
| 全テスト実行 | 左サイドバーのフラスコアイコン → 「すべてのテストを実行」 |
| ファイル単位で実行 | テストファイル上部の ▶ ボタン |
| 関数単位で実行 | テスト関数左の ▶ ボタン |
| ターミナルから全実行 | `python -m pytest tests/e2e -v` |
| 特定ファイルのみ | `python -m pytest tests/e2e/test_01_menu_add.py -v` |
| 特定テストのみ | `python -m pytest tests/e2e/test_01_menu_add.py::TestMenuAdd::test_01_01_add_strength_menu -v` |

### 6.3 ヘッドレス / 有頭モードの切替

```bash
# デフォルト（ヘッドレス: ブラウザ画面非表示）
python -m pytest tests/e2e -v

# 有頭モード（ブラウザ画面を表示して確認したい場合）
python -m pytest tests/e2e -v --headed

# スローモード（動作を遅くして目視確認しやすくする）
python -m pytest tests/e2e -v --headed --slowmo=500
```

---

## 7. conftest.py の主要フィクスチャ

### フィクスチャ一覧

| フィクスチャ名 | 内容 | 主な用途 |
|---|---|---|
| `page` | localStorageクリア済みの新規ページ | 全テストの基本 |
| `page_with_menu` | 「胸/フリーウェイト/ベンチプレス」登録済み | セット記録・詳細テスト |
| `page_with_cardio` | 「有酸素運動/ランニング」登録済み | 有酸素記録テスト |
| `page_with_sets` | ベンチプレスに2セット記録済み | 統計・分析テスト |

### 主要ヘルパー関数

| 関数名 | 説明 |
|---|---|
| `clear_storage(page)` | localStorageをクリアしてリロード |
| `seed_menu(page, category, type, name)` | テスト用メニューを1件登録 |
| `open_sidebar(page)` | ハンバーガーをクリックしてサイドバーを開く |
| `close_sidebar_if_open(page)` | サイドバーが開いていれば閉じる |

---

## 8. テストケースとファイルの対応

| ファイル | TC-ID | テスト数 |
|---|---|---|
| `test_01_menu_add.py` | TC-NAV-01〜04, TC-01-01〜12 | 16 |
| `test_02_03_menu_list_archive.py` | TC-02-01〜02, TC-03-01〜05 | 7 |
| `test_04_set_record.py` | TC-04-01〜14, TC-06-01〜04 | 14 |
| `test_05_cardio_record.py` | TC-05-01〜09 | 9 |
| `test_07_analysis.py` | TC-07-01〜10 | 10 |
| `test_08_csv.py` | TC-08-01〜08 | 8 |
| **合計** | | **64** |

---

## 9. 新規テストを追加する際のルール

### ファイル命名規則

```
test_{連番}_{機能名}.py
例: test_09_menu_edit.py
```

### テストクラス・関数の命名規則

```python
class Test{機能名}:
    def test_{TC-ID}_{内容}(self, page):
        """TC-XX-XX: テストケース名"""
```

### テストケースIDの採番

| 桁 | 意味 | 例 |
|---|---|---|
| TC-XX | カテゴリ番号（ファイル番号と一致） | TC-09 |
| TC-XX-YY | カテゴリ内の連番 | TC-09-01 |

### フィクスチャ選択の基準

```
記録データが不要 → page
メニューだけ必要 → page_with_menu / page_with_cardio
セット記録まで必要 → page_with_sets
それ以外 → conftest.py に新しいフィクスチャを追加
```

---

## 10. よくあるエラーと対処法

| エラー | 原因 | 対処 |
|---|---|---|
| `playwright._impl._errors.TimeoutError` | 要素が見つからない・ページ遷移が遅い | `wait_for_timeout()` を増やす or `wait_for_selector()` で明示的に待つ |
| `ModuleNotFoundError: conftest` | conftest.pyのimportパスが通っていない | `pytest.ini` の `testpaths` を確認する |
| `AssertionError` on localStorage | ページリロード前にlocalStorageを読んでいる | `wait_for_timeout(500)` を操作後に追加する |
| テストがVSCodeで表示されない | pytest.iniが正しい場所にない | `gym-log/` 直下に `pytest.ini` があるか確認 |
| ブラウザが起動しない | Chromiumが未インストール | `playwright install chromium` を実行 |
