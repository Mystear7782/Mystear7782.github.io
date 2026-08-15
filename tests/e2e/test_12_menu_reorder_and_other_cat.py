"""
test_12_menu_reorder_and_other_cat.py
UC-31: メニュー一覧を長押しして並び替える
UC-32: 部位「その他」でメニューを登録する
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar, seed_menu


BASE_URL = "https://mystear7782.github.io/"


class TestMenuReorder:
    """UC-31: メニュー一覧を長押しして並び替える"""

    def _seed_two_chest_menus(self, page: Page):
        seed_menu(page, "胸", "フリーウェイト", "ベンチプレス")
        seed_menu(page, "胸", "フリーウェイト", "インクラインベンチ")
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_selector("#page-menu-list.active")
        page.wait_for_selector("#sidebar:not(.show)")
        page.wait_for_timeout(350)  # サイドバーの閉じるアニメーション(280ms)完了待ち

    def _long_press_drag(self, page: Page, from_idx: int, dy: int):
        """指定インデックスの行を長押し(600ms)してから縦方向にドラッグする"""
        rows = page.locator(".menu-row[data-cat='胸']")
        box = rows.nth(from_idx).bounding_box()
        cx = box["x"] + 10
        cy = box["y"] + box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.wait_for_timeout(2200)  # 長押し確定(2000ms)を確実に超える
        page.mouse.move(cx, cy + dy, steps=10)
        page.mouse.up()
        page.wait_for_timeout(300)

    def test_12_01_long_press_drag_swaps_order(self, page: Page):
        """TC-12-01: 長押し後にドラッグすると同一部位内の並び順が入れ替わる"""
        self._seed_two_chest_menus(page)
        names_before = page.locator(".menu-row[data-cat='胸'] .menu-row-name").all_text_contents()
        assert names_before == ["ベンチプレス", "インクラインベンチ"]

        self._long_press_drag(page, 0, 250)

        names_after = page.locator(".menu-row[data-cat='胸'] .menu-row-name").all_text_contents()
        assert names_after == ["インクラインベンチ", "ベンチプレス"], \
            f"並び替えが反映されていない: {names_after}"

    def test_12_02_reorder_persists_after_reload(self, page: Page):
        """TC-12-02: 並び替え後の順序はリロード後も保持される"""
        self._seed_two_chest_menus(page)
        self._long_press_drag(page, 0, 250)

        page.reload()
        page.wait_for_load_state("networkidle")
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_selector("#page-menu-list.active")

        names = page.locator(".menu-row[data-cat='胸'] .menu-row-name").all_text_contents()
        assert names == ["インクラインベンチ", "ベンチプレス"], \
            f"リロード後に並び順が保持されていない: {names}"

    def test_12_03_short_tap_still_opens_detail(self, page: Page):
        """TC-12-03: 通常の短いタップ（長押しでない）は従来どおりメニュー詳細に遷移する"""
        self._seed_two_chest_menus(page)
        page.locator(".menu-row[data-cat='胸']").first.click()
        page.wait_for_selector("#page-menu-detail.active")
        expect(page.locator(".detail-name")).to_contain_text("ベンチプレス")

    def test_12_04_drag_does_not_trigger_navigation(self, page: Page):
        """TC-12-04: 長押しドラッグ操作の直後にメニュー詳細へ誤遷移しない"""
        self._seed_two_chest_menus(page)
        self._long_press_drag(page, 0, 250)
        expect(page.locator("#page-menu-list.active")).to_be_visible()
        expect(page.locator("#page-menu-detail.active")).not_to_be_visible()


class TestOtherCategory:
    """UC-32: 部位「その他」でメニューを登録する"""

    def _go_to_add_menu(self, page: Page):
        open_sidebar(page)
        page.get_by_text("＋メニューの追加").click()
        page.wait_for_selector("#page-add-menu.active")

    def test_12_05_other_category_option_exists_in_add_menu(self, page: Page):
        """TC-12-05: メニュー追加画面の部位セレクトに「その他」がある"""
        self._go_to_add_menu(page)
        options = page.locator("#sel-cat option").all_text_contents()
        assert "その他" in options

    def test_12_06_add_menu_with_other_category(self, page: Page):
        """TC-12-06: 部位「その他」でメニューを登録できる"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("その他")
        page.locator("#type-section .type-chip[data-type='マシン']").click()
        page.locator("#inp-name").fill("特殊マシン")
        page.locator("#btn-add").click()
        page.wait_for_timeout(2500)

        expect(page.locator("#toast")).to_contain_text("特殊マシン")

    def test_12_07_other_category_shown_as_group_in_menu_list(self, page: Page):
        """TC-12-07: 「その他」で登録したメニューが一覧で「その他」グループに表示される"""
        self._go_to_add_menu(page)
        page.locator("#sel-cat").select_option("その他")
        page.locator("#type-section .type-chip[data-type='マシン']").click()
        page.locator("#inp-name").fill("特殊マシン")
        page.locator("#btn-add").click()
        page.wait_for_timeout(2500)

        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_selector("#page-menu-list.active")

        expect(page.locator(".group-name", has_text="その他")).to_be_visible()
        expect(page.locator(".menu-row-name", has_text="特殊マシン")).to_be_visible()

    def test_12_08_edit_menu_category_to_other(self, page_with_menu: Page):
        """TC-12-08: 既存メニューの部位を編集で「その他」に変更できる"""
        p = page_with_menu
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        p.locator(".menu-row").first.click()
        p.wait_for_selector("#page-menu-detail.active")
        p.locator("button.btn-action.edit-menu").click()
        p.wait_for_selector("#edit-menu-modal.show")
        p.locator("#edit-sel-cat").select_option("その他")
        p.locator("#edit-menu-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        expect(p.locator(".detail-tags")).to_contain_text("その他")
