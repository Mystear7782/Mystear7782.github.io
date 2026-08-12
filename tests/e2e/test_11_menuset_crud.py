"""
test_11_menuset_crud.py
UC-27: メニューセットを作成する
UC-28: メニューセット一覧で中身を確認する
UC-29: メニューセットを編集する
UC-30: メニューセットを削除する
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar, seed_menu


BASE_URL = "https://mystear7782.github.io/"


def _go_to_menuset_page(page: Page):
    open_sidebar(page)
    page.locator(".sb-item[data-page='menuset-list']").click()
    page.wait_for_selector("#page-menuset-list.active")


class TestMenuSetCreate:
    """UC-27: メニューセットを作成する"""

    def test_11_01_create_menuset_appears_in_list(self, page_with_menu: Page):
        """TC-11-01: セットを作成すると一覧に表示される"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("プッシュデー")
        p.locator("#menuset-menu-checklist input[type=checkbox]").first.check()
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        expect(p.locator(".prog-card-name", has_text="プッシュデー")).to_be_visible()

    def test_11_02_create_requires_name(self, page_with_menu: Page):
        """TC-11-02: セット名未入力時はトーストでエラー表示される"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-menu-checklist input[type=checkbox]").first.check()
        p.locator("#menuset-modal .btn-modal-save").click()

        expect(p.locator("#toast")).to_contain_text("セット名を入力してください")

    def test_11_03_create_requires_at_least_one_menu(self, page_with_menu: Page):
        """TC-11-03: メニュー未選択時はトーストでエラー表示される"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("空セット")
        p.locator("#menuset-modal .btn-modal-save").click()

        expect(p.locator("#toast")).to_contain_text("メニューを1つ以上選択してください")

    def test_11_04_menuset_persists_after_reload(self, page_with_menu: Page):
        """TC-11-04: 作成したセットはリロード後も保持される"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("保持テスト")
        p.locator("#menuset-menu-checklist input[type=checkbox]").first.check()
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        p.reload()
        p.wait_for_load_state("networkidle")
        _go_to_menuset_page(p)
        expect(p.locator(".prog-card-name", has_text="保持テスト")).to_be_visible()

    def test_11_05_cancel_closes_modal_without_saving(self, page_with_menu: Page):
        """TC-11-05: キャンセルするとセットは作成されない"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("キャンセルテスト")
        p.locator("#menuset-modal .btn-modal-cancel").click()

        expect(p.locator(".prog-card-name", has_text="キャンセルテスト")).not_to_be_visible()

    def test_11_06_html_tag_in_name_displayed_as_text(self, page_with_menu: Page):
        """TC-11-06: セット名にHTMLタグを含めても文字列としてそのまま表示される（R-01踏襲）"""
        p = page_with_menu
        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("<b>test</b>")
        p.locator("#menuset-menu-checklist input[type=checkbox]").first.check()
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        expect(p.locator(".prog-card-name")).to_contain_text("<b>test</b>")
        assert p.locator(".prog-card-name b").count() == 0, \
            "セット名のHTMLタグが要素として解釈されている"


class TestMenuSetListDisplay:
    """UC-28: メニューセット一覧で中身を確認する"""

    def test_11_07_list_shows_member_menu(self, page_with_menuset: Page):
        """TC-11-07: セットをクリックすると含まれるメニューが表示される"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        expect(p.locator(".menuset-member-name", has_text="ベンチプレス")).to_be_visible()

    def test_11_08_list_shows_member_count(self, page_with_menuset: Page):
        """TC-11-08: セットカードにメニュー件数が表示される"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        expect(p.locator(".prog-card-meta", has_text="1件のメニュー")).to_be_visible()

    def test_11_09_empty_state_when_no_sets(self, page: Page):
        """TC-11-09: セットが1件もない場合、空状態メッセージが表示される"""
        _go_to_menuset_page(page)
        expect(page.locator(".empty-title", has_text="メニューセットがありません")).to_be_visible()


class TestMenuSetEditDelete:
    """UC-29: メニューセットを編集する / UC-30: メニューセットを削除する"""

    def test_11_10_edit_updates_name(self, page_with_menuset: Page):
        """TC-11-10: 編集でセット名を変更できる"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        p.locator(".prog-card button", has_text="編集").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("更新後の名前")
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        expect(p.locator(".prog-card-name", has_text="更新後の名前")).to_be_visible()

    def test_11_11_edit_modal_prefilled_with_current_values(self, page_with_menuset: Page):
        """TC-11-11: 編集モーダルに現在のセット名・選択メニューが初期入力されている"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        p.locator(".prog-card button", has_text="編集").click()
        p.wait_for_selector("#menuset-modal.show")

        expect(p.locator("#menuset-inp-name")).to_have_value("プッシュデー")
        expect(p.locator("#menuset-menu-checklist input[type=checkbox]").first).to_be_checked()

    def test_11_12_edit_can_change_menu_selection(self, page_with_menu: Page):
        """TC-11-12: 編集で含まれるメニューの選択を変更できる"""
        p = page_with_menu
        # 2件目のメニューを追加登録
        open_sidebar(p)
        p.get_by_text("＋メニューの追加").click()
        p.locator("#sel-cat").select_option("足")
        p.locator("#type-section .type-chip[data-type='フリーウェイト']").click()
        p.locator("#inp-name").fill("スクワット")
        p.locator("#btn-add").click()
        p.wait_for_timeout(2500)

        _go_to_menuset_page(p)
        p.get_by_text("＋ 新規セットを作成").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-inp-name").fill("複合セット")
        p.locator("#menuset-menu-checklist input[type=checkbox]").first.check()
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        p.locator(".prog-card button", has_text="編集").click()
        p.wait_for_selector("#menuset-modal.show")
        p.locator("#menuset-menu-checklist input[type=checkbox]").nth(1).check()
        p.locator("#menuset-modal .btn-modal-save").click()
        p.wait_for_timeout(500)

        expect(p.locator(".menuset-member-name", has_text="スクワット")).to_be_visible()

    def test_11_13_delete_removes_from_list(self, page_with_menuset: Page):
        """TC-11-13: セットを削除すると一覧から消える"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        p.on("dialog", lambda d: d.accept())
        p.locator(".prog-card button", has_text="削除").click()
        p.wait_for_timeout(300)

        expect(p.locator(".prog-card-name", has_text="プッシュデー")).not_to_be_visible()

    def test_11_14_cancel_delete_dialog_keeps_menuset(self, page_with_menuset: Page):
        """TC-11-14: 削除確認ダイアログをキャンセルするとセットが残る"""
        p = page_with_menuset
        _go_to_menuset_page(p)
        p.on("dialog", lambda d: d.dismiss())
        p.locator(".prog-card button", has_text="削除").click()
        p.wait_for_timeout(300)

        expect(p.locator(".prog-card-name", has_text="プッシュデー")).to_be_visible()

    def test_11_15_no_menuset_leaves_existing_features_intact(self, page_with_menu: Page):
        """TC-11-15: セットを1つも作らない状態で既存機能（メニュー一覧）が従来どおり動作する"""
        p = page_with_menu
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_selector("#page-menu-list.active")
        expect(p.locator(".menu-row-name", has_text="ベンチプレス")).to_be_visible()
