"""
test_04_set_record.py
TC-04系: セット記録（筋トレ）
TC-06系: メニュー詳細・統計
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar


BASE_URL = "https://mystear7782.github.io/"


class TestSetRecord:
    """TC-04系: セット記録"""

    def _open_new_session(self, page: Page):
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row").first.click()
        page.wait_for_selector("#page-menu-detail.active")
        page.locator("button.btn-action.new-sess").click()
        page.wait_for_selector("#page-set-edit.active")

    # ── 正常系 ──

    def test_04_01_add_set_appears_in_list(self, page_with_menu: Page):
        """TC-04-01: 重量と回数を入力してセットを追加できる"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("80")
        page_with_menu.locator("#inp-r").fill("10")
        page_with_menu.locator("#btn-add-set").click()
        page_with_menu.wait_for_timeout(300)

        expect(page_with_menu.locator(".set-main", has_text="80 kg × 10 回")).to_be_visible()

    def test_04_02_orm_preview_shows_correct_value(self, page_with_menu: Page):
        """TC-04-02: 推定1RMプレビューが正しい値を表示する（80kg×10回=100kg）
        アプリ側は整数表示のため '100 kg' を期待"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("80")
        page_with_menu.locator("#inp-r").fill("10")

        expect(page_with_menu.locator("#orm-prev")).to_contain_text("100 kg")

    # ── 活性制御 ──

    def test_04_03_button_disabled_no_weight(self, page_with_menu: Page):
        """TC-04-03: 重量未入力時にセット追加ボタンが非活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-r").fill("10")
        expect(page_with_menu.locator("#btn-add-set")).to_be_disabled()

    def test_04_04_button_disabled_no_reps(self, page_with_menu: Page):
        """TC-04-04: 回数未入力時にセット追加ボタンが非活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("80")
        expect(page_with_menu.locator("#btn-add-set")).to_be_disabled()

    def test_04_05_button_enabled_both_filled(self, page_with_menu: Page):
        """TC-04-05: 重量・回数入力後にセット追加ボタンが活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("80")
        page_with_menu.locator("#inp-r").fill("10")
        expect(page_with_menu.locator("#btn-add-set")).to_be_enabled()

    # ── 境界値 ──

    def test_04_06_weight_zero_disables_button(self, page_with_menu: Page):
        """TC-04-06: 重量0でボタンが非活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("0")
        page_with_menu.locator("#inp-r").fill("10")
        expect(page_with_menu.locator("#btn-add-set")).to_be_disabled()

    def test_04_07_reps_zero_disables_button(self, page_with_menu: Page):
        """TC-04-07: 回数0でボタンが非活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("80")
        page_with_menu.locator("#inp-r").fill("0")
        expect(page_with_menu.locator("#btn-add-set")).to_be_disabled()

    def test_04_08_weight_half_kg_is_valid(self, page_with_menu: Page):
        """TC-04-08: 重量0.5kg（最小刻み）でボタンが活性"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#inp-w").fill("0.5")
        page_with_menu.locator("#inp-r").fill("5")
        expect(page_with_menu.locator("#btn-add-set")).to_be_enabled()

    # ── セット編集 ──

    def test_04_09_tap_set_enters_edit_mode(self, page_with_sets: Page):
        """TC-04-09: セット行タップで編集モードに切り替わる"""
        p = page_with_sets
        p.locator(".set-row").first.click()
        p.wait_for_timeout(300)

        expect(p.locator(".set-row.editing")).to_be_visible()
        expect(p.locator("#form-label")).to_contain_text("編集中")

    def test_04_10_edit_set_updates_list(self, page_with_sets: Page):
        """TC-04-10: 編集内容を保存するとセット一覧に反映される"""
        p = page_with_sets
        p.locator(".set-row").first.click()
        p.wait_for_timeout(300)

        p.locator("#inp-w").fill("90")
        p.locator("#inp-r").fill("5")
        p.locator("#btn-add-set").click()
        p.wait_for_timeout(300)

        expect(p.locator(".set-main", has_text="90 kg × 5 回")).to_be_visible()

    # ── セット削除 ──

    def test_04_11_delete_set_removes_from_list(self, page_with_sets: Page):
        """TC-04-11: セットを削除するとセット一覧から消える"""
        p = page_with_sets
        p.on("dialog", lambda d: d.accept())

        set_count_before = p.locator(".set-row").count()
        p.locator(".btn-del").first.click()
        p.wait_for_timeout(300)

        assert p.locator(".set-row").count() == set_count_before - 1

    # ── 日付・時刻変更 ──

    def test_04_12_change_session_date(self, page_with_menu: Page):
        """TC-04-12: セッション日付を変更できる"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#sess-date").fill("2026-01-01")
        page_with_menu.wait_for_timeout(500)

        # localStorageに反映されているか確認
        stored = page_with_menu.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('gl_sessions') || '{}');
            const sessions = Object.values(Object.values(s)[0] || {});
            return sessions.length > 0 ? sessions[sessions.length - 1].date : null;
        }""")
        assert stored == "2026-01-01", f"日付が保存されていない: {stored}"

    def test_04_13_change_session_time(self, page_with_menu: Page):
        """TC-04-13: セッション時刻を変更できる"""
        self._open_new_session(page_with_menu)
        page_with_menu.locator("#sess-time").fill("14:30")
        page_with_menu.wait_for_timeout(500)

        stored = page_with_menu.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('gl_sessions') || '{}');
            const sessions = Object.values(Object.values(s)[0] || {});
            return sessions.length > 0 ? sessions[sessions.length - 1].time : null;
        }""")
        assert stored == "14:30", f"時刻が保存されていない: {stored}"

    def test_04_14_multiple_sessions_same_day(self, page_with_menu: Page):
        """TC-04-14: 同一日に複数セッションを作成できる"""
        p = page_with_menu
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        p.locator(".menu-row").first.click()
        p.wait_for_selector("#page-menu-detail.active")

        # セッション1
        p.locator("button.btn-action.new-sess").click()
        p.wait_for_selector("#page-set-edit.active")
        p.locator("#inp-w").fill("80")
        p.locator("#inp-r").fill("10")
        p.locator("#btn-add-set").click()
        p.wait_for_timeout(300)
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        # セッション2
        p.locator("button.btn-action.new-sess").click()
        p.wait_for_selector("#page-set-edit.active")
        p.locator("#inp-w").fill("85")
        p.locator("#inp-r").fill("8")
        p.locator("#btn-add-set").click()
        p.wait_for_timeout(300)
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        # 履歴テーブルに2行あること
        assert p.locator(".hist-table tbody tr").count() == 2


class TestMenuDetail:
    """TC-06系: メニュー詳細・統計"""

    def test_06_01_max_orm_shown_after_record(self, page_with_sets: Page):
        """TC-06-01: セット記録後にメニュー詳細で最大1RMが表示される
        アプリ側は整数表示のため '102' を期待（85×(1+8/40)=102.0→102）"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        expect(p.locator(".stat-val").first).to_contain_text("102")

    def test_06_02_max_volume_shown_after_record(self, page_with_sets: Page):
        """TC-06-02: セット記録後にメニュー詳細で最大ボリュームが表示される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        # 80×10 + 85×8 = 800 + 680 = 1480
        stat_vals = p.locator(".stat-val").all_text_contents()
        assert any("1480" in v for v in stat_vals), f"ボリューム1480が見つからない: {stat_vals}"

    def test_06_03_session_history_shows_correct_columns(self, page_with_sets: Page):
        """TC-06-03: セッション履歴テーブルに記録日・セット数・1RMが表示される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        row = p.locator(".hist-table tbody tr").first
        expect(row.locator(".td-date")).to_be_visible()
        expect(row.locator(".td-1rm")).to_be_visible()

    def test_06_04_history_row_opens_set_edit(self, page_with_sets: Page):
        """TC-06-04: 履歴テーブルの行タップでセット記録画面に遷移する"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_selector("#page-menu-detail.active")

        p.locator(".hist-table tbody tr.clickable").first.click()
        p.wait_for_selector("#page-set-edit.active")
        expect(p.locator("#page-set-edit.active")).to_be_visible()
