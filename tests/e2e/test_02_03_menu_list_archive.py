"""
test_02_menu_list.py / test_03_menu_archive.py
TC-02系: メニュー一覧
TC-03系: アーカイブ・復元・削除
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar, seed_menu


BASE_URL = "https://mystear7782.github.io/"


class TestMenuList:
    """TC-02系: メニュー一覧"""

    def test_02_01_added_menu_appears_in_list(self, page_with_menu: Page):
        """TC-02-01: 追加したメニューが部位グループに表示される"""
        p = page_with_menu
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_selector("#page-menu-list.active")

        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).to_be_visible()
        expect(p.locator(".group-name", has_text="胸")).to_be_visible()

    def test_02_02_multiple_categories_display_correctly(self, page: Page):
        """TC-02-02: 複数部位のメニューが正しいグループに表示される"""
        seed_menu(page, "胸", "フリーウェイト", "ベンチプレス")
        seed_menu(page, "背中", "マシン", "ラットプルダウン")
        seed_menu(page, "有酸素運動", None, "ランニング")

        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_selector("#page-menu-list.active")

        expect(page.locator(".group-name", has_text="胸")).to_be_visible()
        expect(page.locator(".group-name", has_text="背中")).to_be_visible()
        expect(page.locator(".group-name", has_text="有酸素運動")).to_be_visible()
        expect(page.locator(".menu-row-name", has_text="ベンチプレス")).to_be_visible()
        expect(page.locator(".menu-row-name", has_text="ラットプルダウン")).to_be_visible()


class TestMenuArchiveDeleteRestore:
    """TC-03系: アーカイブ・復元・削除"""

    def _go_to_menu_detail(self, page: Page):
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row").first.click()
        page.wait_for_selector("#page-menu-detail.active")

    def test_03_01_archive_removes_from_list(self, page_with_menu: Page):
        """TC-03-01: アーカイブするとメニュー一覧から消える"""
        p = page_with_menu
        self._go_to_menu_detail(p)

        p.on("dialog", lambda d: d.accept())
        p.locator("button.btn-action.archive").click()
        p.wait_for_timeout(500)

        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_selector("#page-menu-list.active")

        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).not_to_be_visible()

    def test_03_02_archive_toggle_shows_archived(self, page_with_menu: Page):
        """TC-03-02: アーカイブ表示トグルONでアーカイブ済みが表示される"""
        p = page_with_menu
        self._go_to_menu_detail(p)
        p.on("dialog", lambda d: d.accept())
        p.locator("button.btn-action.archive").click()
        p.wait_for_timeout(500)

        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_selector("#page-menu-list.active")

        p.locator(".toggle-archive-btn").click()
        p.wait_for_timeout(300)

        expect(p.locator(".menu-row.archived")).to_be_visible()
        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).to_be_visible()

    def test_03_03_unarchive_restores_to_list(self, page_with_menu: Page):
        """TC-03-03: アーカイブ解除するとメニュー一覧に戻る"""
        p = page_with_menu
        # アーカイブ
        self._go_to_menu_detail(p)
        p.on("dialog", lambda d: d.accept())
        p.locator("button.btn-action.archive").click()
        p.wait_for_timeout(500)

        # アーカイブ済み表示して詳細へ
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        p.locator(".toggle-archive-btn").click()
        p.wait_for_timeout(300)
        p.locator(".menu-row.archived").first.click()
        p.wait_for_selector("#page-menu-detail.active")

        # 解除
        p.locator("button.btn-action.unarchive").click()
        p.wait_for_timeout(500)

        # 通常一覧に戻って表示される
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).to_be_visible()
        expect(p.locator(".menu-row.archived")).not_to_be_visible()

    def test_03_04_delete_removes_from_list(self, page_with_menu: Page):
        """TC-03-04: 完全削除するとメニュー一覧から消える"""
        p = page_with_menu
        self._go_to_menu_detail(p)

        p.on("dialog", lambda d: d.accept())
        p.locator("button.btn-action.delete").click()
        p.wait_for_selector("#page-menu-list.active")

        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).not_to_be_visible()

    def test_03_05_deleted_menu_not_in_archive(self, page_with_menu: Page):
        """TC-03-05: 完全削除後はアーカイブ表示しても存在しない"""
        p = page_with_menu
        self._go_to_menu_detail(p)

        p.on("dialog", lambda d: d.accept())
        p.locator("button.btn-action.delete").click()
        p.wait_for_selector("#page-menu-list.active")

        p.locator(".toggle-archive-btn").click()
        p.wait_for_timeout(300)
        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).not_to_be_visible()
