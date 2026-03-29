"""
test_10_myst_features.py
MYST-29: 初期表示をメニュー一覧画面にする
MYST-7:  登録済みメニューの編集機能（名前・種別・部位）
MYST-30: セッション削除機能
MYST-31: 自重トレーニングのセッション追加画面で重量を非表示
BW-DET:  自重メニュー詳細で最大1RM・最大ボリュームを非表示
"""
import re
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar, seed_menu


BASE_URL = "https://mystear7782.github.io/"


# ─────────────────────────────────────────
# MYST-29: 初期表示をメニュー一覧画面にする
# ─────────────────────────────────────────

class TestMYST29InitialPage:
    """MYST-29: アプリ起動時の初期表示がメニュー一覧であること"""

    def test_29_01_menu_list_page_is_active(self, page: Page):
        """TC-29-01: 初期表示でメニュー一覧ページがアクティブ（表示中）である"""
        expect(page.locator("#page-menu-list")).to_be_visible()

    def test_29_02_add_menu_page_is_not_visible(self, page: Page):
        """TC-29-02: 初期表示でメニュー追加ページが非表示である"""
        expect(page.locator("#page-add-menu")).not_to_be_visible()

    def test_29_03_page_title_is_menu_list(self, page: Page):
        """TC-29-03: 初期表示のヘッダータイトルが「メニュー一覧」である"""
        expect(page.locator("#page-title")).to_have_text("メニュー一覧")

    def test_29_04_sidebar_menu_list_item_is_active(self, page: Page):
        """TC-29-04: 初期表示でサイドバーの「メニュー一覧」アイテムがアクティブである"""
        open_sidebar(page)
        expect(page.locator(".sb-item[data-page='menu-list']")).to_have_class(
            re.compile(r"active")
        )

    def test_29_05_sidebar_add_menu_item_is_not_active(self, page: Page):
        """TC-29-05: 初期表示でサイドバーの「メニューの追加」アイテムが非アクティブである"""
        open_sidebar(page)
        expect(page.locator(".sb-item[data-page='add-menu']")).not_to_have_class(
            re.compile(r"\bactive\b")
        )


# ─────────────────────────────────────────
# MYST-7: 登録済みメニューの編集機能
# ─────────────────────────────────────────

class TestMYST7MenuEdit:
    """MYST-7: 登録済みメニューの名前・種別・部位を編集できること"""

    def _go_to_detail(self, page: Page):
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row").first.click()
        page.wait_for_selector("#page-menu-detail.active")

    def test_07_01_edit_button_visible_in_detail(self, page_with_menu: Page):
        """TC-07-01: メニュー詳細画面に「編集」ボタンが表示される"""
        self._go_to_detail(page_with_menu)
        expect(page_with_menu.locator("button.btn-action.edit-menu")).to_be_visible()

    def test_07_02_edit_modal_opens_on_click(self, page_with_menu: Page):
        """TC-07-02: 「編集」ボタンクリックでモーダルが表示される"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        expect(page_with_menu.locator("#edit-menu-modal")).to_have_class(
            re.compile(r"show")
        )

    def test_07_03_modal_prefilled_with_current_values(self, page_with_menu: Page):
        """TC-07-03: モーダルに現在のメニュー名・部位が初期入力されている"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        expect(page_with_menu.locator("#edit-inp-name")).to_have_value("ベンチプレス")
        expect(page_with_menu.locator("#edit-sel-cat")).to_have_value("胸")

    def test_07_04_can_save_new_name(self, page_with_menu: Page):
        """TC-07-04: メニュー名を変更して保存するとメニュー詳細に反映される"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator("#edit-inp-name").fill("インクラインベンチプレス")
        page_with_menu.locator(".btn-modal-save").click()
        page_with_menu.wait_for_timeout(500)
        expect(page_with_menu.locator(".detail-name")).to_have_text("インクラインベンチプレス")

    def test_07_05_can_save_new_category(self, page_with_menu: Page):
        """TC-07-05: 部位を変更して保存するとメニュー詳細に反映される"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator("#edit-sel-cat").select_option("肩")
        page_with_menu.locator(".btn-modal-save").click()
        page_with_menu.wait_for_timeout(500)
        expect(page_with_menu.locator(".detail-tags")).to_contain_text("肩")

    def test_07_06_can_save_new_type(self, page_with_menu: Page):
        """TC-07-06: 種別を変更して保存するとメニュー詳細に反映される"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator("#edit-type-section .type-chip[data-type='マシン']").click()
        page_with_menu.locator(".btn-modal-save").click()
        page_with_menu.wait_for_timeout(500)
        expect(page_with_menu.locator(".detail-tags")).to_contain_text("マシン")

    def test_07_07_duplicate_name_shows_error_toast(self, page: Page):
        """TC-07-07: 同じ部位に同名メニューが存在する場合エラートーストが表示される"""
        seed_menu(page, "胸", "フリーウェイト", "ベンチプレス")
        seed_menu(page, "胸", "マシン", "チェストプレス")
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row", has_text="チェストプレス").click()
        page.wait_for_selector("#page-menu-detail.active")
        page.locator("button.btn-action.edit-menu").click()
        page.locator("#edit-inp-name").fill("ベンチプレス")
        page.locator(".btn-modal-save").click()
        expect(page.locator("#toast")).to_contain_text("同じ部位に同名のメニューがあります")

    def test_07_08_cancel_closes_modal(self, page_with_menu: Page):
        """TC-07-08: 「キャンセル」ボタンでモーダルが閉じる"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator(".btn-modal-cancel").click()
        expect(page_with_menu.locator("#edit-menu-modal")).not_to_have_class(
            re.compile(r"show")
        )

    def test_07_09_success_toast_on_save(self, page_with_menu: Page):
        """TC-07-09: 保存成功時にトーストが表示される"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator("#edit-inp-name").fill("ダンベルプレス")
        page_with_menu.locator(".btn-modal-save").click()
        expect(page_with_menu.locator("#toast")).to_contain_text("ダンベルプレス")

    def test_07_10_cardio_category_hides_type_section(self, page_with_menu: Page):
        """TC-07-10: 編集モーダルで有酸素運動を選択すると種別セクションが非表示になる"""
        self._go_to_detail(page_with_menu)
        page_with_menu.locator("button.btn-action.edit-menu").click()
        page_with_menu.locator("#edit-sel-cat").select_option("有酸素運動")
        expect(page_with_menu.locator("#edit-type-section")).to_be_hidden()


# ─────────────────────────────────────────
# MYST-30: セッション削除機能
# ─────────────────────────────────────────

class TestMYST30SessionDelete:
    """MYST-30: セッションを削除できること"""

    def _go_to_detail(self, page: Page):
        page.locator("#set-back").click()
        page.wait_for_selector("#page-menu-detail.active")

    def test_30_01_delete_button_visible_in_session_row(self, page_with_sets: Page):
        """TC-30-01: セッション履歴の各行に削除ボタンが表示される"""
        self._go_to_detail(page_with_sets)
        expect(page_with_sets.locator(".hist-table tbody tr .btn-del").first).to_be_visible()

    def test_30_02_delete_session_reduces_row_count(self, page_with_sets: Page):
        """TC-30-02: セッション削除後に履歴テーブルの行数が1件減る"""
        self._go_to_detail(page_with_sets)
        count_before = page_with_sets.locator(".hist-table tbody tr").count()
        page_with_sets.on("dialog", lambda d: d.accept())
        page_with_sets.locator(".hist-table tbody tr .btn-del").first.click()
        page_with_sets.wait_for_timeout(500)
        assert page_with_sets.locator(".hist-table tbody tr").count() == count_before - 1

    def test_30_03_delete_session_shows_toast(self, page_with_sets: Page):
        """TC-30-03: セッション削除後にトーストが表示される"""
        self._go_to_detail(page_with_sets)
        page_with_sets.on("dialog", lambda d: d.accept())
        page_with_sets.locator(".hist-table tbody tr .btn-del").first.click()
        expect(page_with_sets.locator("#toast")).to_contain_text("削除しました")

    def test_30_04_delete_all_sessions_shows_empty_state(self, page_with_menu: Page):
        """TC-30-04: 全セッション削除後にメニュー詳細で空状態メッセージが表示される"""
        p = page_with_menu
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        p.locator(".menu-row").first.click()
        p.wait_for_selector("#page-menu-detail.active")
        # セッション作成
        p.locator("button.btn-action.new-sess").click()
        p.wait_for_selector("#page-set-edit.active")
        p.locator("#inp-w").fill("80")
        p.locator("#inp-r").fill("10")
        p.locator("#btn-add-set").click()
        p.wait_for_timeout(300)
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")
        # セッションを削除
        p.on("dialog", lambda d: d.accept())
        p.locator(".hist-table tbody tr .btn-del").first.click()
        p.wait_for_timeout(500)
        expect(p.locator("#detail-body .empty-state")).to_be_visible()

    def test_30_05_cancel_dialog_keeps_session(self, page_with_sets: Page):
        """TC-30-05: 削除確認ダイアログをキャンセルするとセッションが残る"""
        self._go_to_detail(page_with_sets)
        count_before = page_with_sets.locator(".hist-table tbody tr").count()
        page_with_sets.on("dialog", lambda d: d.dismiss())
        page_with_sets.locator(".hist-table tbody tr .btn-del").first.click()
        page_with_sets.wait_for_timeout(300)
        assert page_with_sets.locator(".hist-table tbody tr").count() == count_before


# ─────────────────────────────────────────
# MYST-31: 自重トレーニングのセッション追加画面で重量を非表示
# ─────────────────────────────────────────

class TestMYST31BodyweightNoWeight:
    """MYST-31: 自重運動のセッション追加画面で重量入力欄が表示されないこと"""

    def _open_new_session(self, page: Page):
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row").first.click()
        page.wait_for_selector("#page-menu-detail.active")
        page.locator("button.btn-action.new-sess").click()
        page.wait_for_selector("#page-set-edit.active")

    def test_31_01_weight_input_not_visible(self, page_with_bodyweight_menu: Page):
        """TC-31-01: 自重運動の新規セッション画面で重量入力欄が表示されない"""
        self._open_new_session(page_with_bodyweight_menu)
        expect(page_with_bodyweight_menu.locator("#inp-w")).not_to_be_visible()

    def test_31_02_reps_input_is_visible(self, page_with_bodyweight_menu: Page):
        """TC-31-02: 自重運動の新規セッション画面で回数入力欄が表示される"""
        self._open_new_session(page_with_bodyweight_menu)
        expect(page_with_bodyweight_menu.locator("#inp-r")).to_be_visible()

    def test_31_03_button_enabled_with_reps_only(self, page_with_bodyweight_menu: Page):
        """TC-31-03: 自重運動では回数のみ入力でセット追加ボタンが活性になる"""
        self._open_new_session(page_with_bodyweight_menu)
        page_with_bodyweight_menu.locator("#inp-r").fill("10")
        expect(page_with_bodyweight_menu.locator("#btn-add-set")).to_be_enabled()

    def test_31_04_button_disabled_no_reps(self, page_with_bodyweight_menu: Page):
        """TC-31-04: 自重運動では回数未入力でセット追加ボタンが非活性"""
        self._open_new_session(page_with_bodyweight_menu)
        expect(page_with_bodyweight_menu.locator("#btn-add-set")).to_be_disabled()

    def test_31_05_set_shows_reps_only(self, page_with_bodyweight_sets: Page):
        """TC-31-05: 自重運動のセット一覧は「○回」形式で表示される（重量なし）"""
        expect(page_with_bodyweight_sets.locator(".set-main").first).to_contain_text("10 回")
        main_texts = page_with_bodyweight_sets.locator(".set-main").all_text_contents()
        assert all("kg" not in t for t in main_texts), \
            f"重量（kg）が表示されているセット行がある: {main_texts}"

    def test_31_06_set_list_has_no_1rm_display(self, page_with_bodyweight_sets: Page):
        """TC-31-06: 自重運動のセット一覧に1RM表示がない"""
        expect(page_with_bodyweight_sets.locator(".set-sub")).not_to_be_visible()

    def test_31_07_multiple_sets_recorded(self, page_with_bodyweight_sets: Page):
        """TC-31-07: 自重運動で複数セットを連続して記録できる"""
        assert page_with_bodyweight_sets.locator(".set-row").count() == 2


# ─────────────────────────────────────────
# BW-DET: 自重メニュー詳細で最大1RM・最大ボリュームを非表示
# ─────────────────────────────────────────

class TestBodyweightMenuDetail:
    """自重メニュー詳細画面で最大1RM・最大ボリュームが表示されないこと"""

    def _go_to_detail(self, page: Page):
        page.locator("#set-back").click()
        page.wait_for_selector("#page-menu-detail.active")

    def test_bw_det_01_no_max_orm_stat(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-01: 自重メニュー詳細に「最大1RM」統計が表示されない"""
        self._go_to_detail(page_with_bodyweight_sets)
        stat_labels = page_with_bodyweight_sets.locator(".stat-label").all_text_contents()
        assert "最大1RM" not in stat_labels, \
            f"最大1RMが表示されている: {stat_labels}"

    def test_bw_det_02_no_max_volume_stat(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-02: 自重メニュー詳細に「最大ボリューム」統計が表示されない"""
        self._go_to_detail(page_with_bodyweight_sets)
        stat_labels = page_with_bodyweight_sets.locator(".stat-label").all_text_contents()
        assert "最大ボリューム" not in stat_labels, \
            f"最大ボリュームが表示されている: {stat_labels}"

    def test_bw_det_03_session_count_stat_visible(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-03: 自重メニュー詳細に「セッション数」統計が表示される"""
        self._go_to_detail(page_with_bodyweight_sets)
        stat_labels = page_with_bodyweight_sets.locator(".stat-label").all_text_contents()
        assert "セッション数" in stat_labels, \
            f"セッション数が表示されていない: {stat_labels}"

    def test_bw_det_04_history_has_total_reps_column(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-04: 自重メニュー詳細の履歴テーブルに「総回数」列が表示される"""
        self._go_to_detail(page_with_bodyweight_sets)
        headers = page_with_bodyweight_sets.locator(".hist-table thead th").all_text_contents()
        assert "総回数" in headers, \
            f"総回数列が見つからない: {headers}"

    def test_bw_det_05_history_no_weight_column(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-05: 自重メニュー詳細の履歴テーブルに「最大重量」列がない"""
        self._go_to_detail(page_with_bodyweight_sets)
        headers = page_with_bodyweight_sets.locator(".hist-table thead th").all_text_contents()
        assert "最大重量" not in headers, \
            f"最大重量列が残っている: {headers}"

    def test_bw_det_06_history_no_1rm_column(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-06: 自重メニュー詳細の履歴テーブルに「1RM」列がない"""
        self._go_to_detail(page_with_bodyweight_sets)
        headers = page_with_bodyweight_sets.locator(".hist-table thead th").all_text_contents()
        assert "1RM" not in headers, \
            f"1RM列が残っている: {headers}"

    def test_bw_det_07_history_total_reps_value(self, page_with_bodyweight_sets: Page):
        """TC-BW-DET-07: 自重メニューの履歴に正しい総回数が表示される（10+15=25回）"""
        self._go_to_detail(page_with_bodyweight_sets)
        row = page_with_bodyweight_sets.locator(".hist-table tbody tr").first
        expect(row.locator(".td-vol")).to_contain_text("25 回")
