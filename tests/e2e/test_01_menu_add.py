"""
test_01_menu_add.py
TC-01系: メニュー追加に関するテスト
TC-NAV系: サイドバー・ナビゲーションテスト
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar, close_sidebar_if_open


BASE_URL = "https://mystear7782.github.io/"


# ─────────────────────────────────────────
# TC-NAV: ナビゲーション共通
# ─────────────────────────────────────────

class TestNavigation:

    def test_nav_01_sidebar_opens_on_hamburger_click(self, page: Page):
        """TC-NAV-01: ハンバーガーボタンクリックでサイドバーが開く"""
        page.locator("#hamburger").click()
        expect(page.locator("#sidebar")).to_have_class("show")

    def test_nav_02_sidebar_closes_on_overlay_click(self, page: Page):
        """TC-NAV-02: オーバーレイクリックでサイドバーが閉じる"""
        page.locator("#hamburger").click()
        page.wait_for_selector("#sidebar.show")
        page.locator("#overlay").click()
        expect(page.locator("#sidebar")).not_to_have_class("show")

    def test_nav_03_navigate_to_menu_list(self, page: Page):
        """TC-NAV-03: サイドバーからメニュー一覧に遷移できる"""
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        expect(page.locator("#page-title")).to_have_text("メニュー一覧")

    def test_nav_04_sidebar_closes_after_navigation(self, page: Page):
        """TC-NAV-04: 遷移後にサイドバーが閉じる"""
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        expect(page.locator("#sidebar")).not_to_have_class("show")


# ─────────────────────────────────────────
# TC-01: メニュー追加
# ─────────────────────────────────────────

class TestMenuAdd:

    def _go_to_add_menu(self, page: Page):
        open_sidebar(page)
        page.get_by_text("＋メニューの追加").click()
        page.wait_for_selector("#page-add-menu.active")

    # ── 正常系 ──

    def test_01_01_add_strength_menu(self, page: Page):
        """TC-01-01: 筋トレメニューを正常に追加できる"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("胸")
        page.locator(".type-chip[data-type='フリーウェイト']").click()
        page.locator("#inp-name").fill("ベンチプレス")
        page.locator("#btn-add").click()

        # トーストにメニュー名が含まれる
        expect(page.locator("#toast")).to_contain_text("ベンチプレス")
        # フォームがリセットされる
        expect(page.locator("#inp-name")).to_have_value("")
        # ボタンが再度非活性になる
        expect(page.locator("#btn-add")).to_be_disabled()

    def test_01_02_add_cardio_menu(self, page: Page):
        """TC-01-02: 有酸素運動メニューを正常に追加できる"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("有酸素運動")
        # 種別選択が非表示
        expect(page.locator("#type-section")).to_be_hidden()
        page.locator("#inp-name").fill("ランニング")
        page.locator("#btn-add").click()

        expect(page.locator("#toast")).to_contain_text("ランニング")

    # ── 活性制御 ──

    def test_01_03_button_disabled_all_empty(self, page: Page):
        """TC-01-03: 全項目未入力時に追加ボタンが非活性"""
        self._go_to_add_menu(page)
        expect(page.locator("#btn-add")).to_be_disabled()

    def test_01_04_button_disabled_only_category(self, page: Page):
        """TC-01-04: 部位のみ選択時に追加ボタンが非活性"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("胸")
        expect(page.locator("#btn-add")).to_be_disabled()

    def test_01_05_button_disabled_no_name(self, page: Page):
        """TC-01-05: 部位・種別選択済みで名前未入力時に追加ボタンが非活性"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("胸")
        page.locator(".type-chip[data-type='マシン']").click()
        expect(page.locator("#btn-add")).to_be_disabled()

    def test_01_06_button_enabled_all_filled(self, page: Page):
        """TC-01-06: 全項目入力済みで追加ボタンが活性"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("肩")
        page.locator(".type-chip[data-type='自重運動']").click()
        page.locator("#inp-name").fill("サイドレイズ")
        expect(page.locator("#btn-add")).to_be_enabled()

    # ── 例外系 ──

    def test_01_07_duplicate_menu_shows_error_toast(self, page: Page):
        """TC-01-07: 同一部位に同名メニュー追加でエラートースト"""
        # 1回目の登録
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("胸")
        page.locator(".type-chip[data-type='フリーウェイト']").click()
        page.locator("#inp-name").fill("ベンチプレス")
        page.locator("#btn-add").click()
        page.wait_for_timeout(2500)

        # 2回目（重複）
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("胸")
        page.locator(".type-chip[data-type='マシン']").click()
        page.locator("#inp-name").fill("ベンチプレス")
        page.locator("#btn-add").click()

        expect(page.locator("#toast")).to_contain_text("同じ部位に同名のメニューがあります")

    # ── 境界値 ──

    def test_01_08_name_max_zenkaku_30chars(self, page: Page):
        """TC-01-08: 全角30文字で登録できる"""
        self._go_to_add_menu(page)
        name_30 = "あ" * 30
        page.locator("#sel-cat").select_option("背中")
        page.locator(".type-chip[data-type='マシン']").click()
        page.locator("#inp-name").fill(name_30)
        expect(page.locator("#btn-add")).to_be_enabled()
        page.locator("#btn-add").click()
        expect(page.locator("#toast")).to_contain_text(name_30)

    def test_01_09_name_zenkaku_31chars_is_cut(self, page: Page):
        """TC-01-09: 全角31文字目が入力できない（30文字でカット）"""
        self._go_to_add_menu(page)
        page.locator("#inp-name").fill("あ" * 31)
        value = page.locator("#inp-name").input_value()
        assert len(value) == 30, f"期待値30文字、実際は{len(value)}文字"

    def test_01_10_name_max_hankaku_60chars(self, page: Page):
        """TC-01-10: 半角60文字で登録できる"""
        self._go_to_add_menu(page)
        name_60 = "a" * 60
        page.locator("#sel-cat").select_option("腕")
        page.locator(".type-chip[data-type='自重運動']").click()
        page.locator("#inp-name").fill(name_60)
        expect(page.locator("#btn-add")).to_be_enabled()

    def test_01_11_name_hankaku_61chars_is_cut(self, page: Page):
        """TC-01-11: 半角61文字目が入力できない（全角換算で30文字にカット）
        アプリは文字数を [...value].length でカウントするため
        半角61文字は全角換算30文字として扱われる"""
        self._go_to_add_menu(page)
        page.locator("#inp-name").fill("a" * 61)
        value = page.locator("#inp-name").input_value()
        assert len(value) == 30, f"期待値30文字（全角換算）、実際は{len(value)}文字"

    def test_01_12_cardio_hides_type_section(self, page: Page):
        """TC-01-12: 有酸素運動選択時に種別選択が非表示"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("有酸素運動")
        expect(page.locator("#type-section")).to_be_hidden()
        # 他の部位に戻すと再表示
        page.locator("#sel-cat").select_option("胸")
        expect(page.locator("#type-section")).to_be_visible()
