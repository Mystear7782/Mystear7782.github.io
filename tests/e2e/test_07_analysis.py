"""
test_07_analysis.py
TC-07系: メニュー分析（カレンダービュー・メニュービュー・グラフ）
"""
import pytest
from datetime import datetime
from playwright.sync_api import Page, expect
from conftest import open_sidebar


BASE_URL = "https://mystear7782.github.io/"


class TestAnalysisCalendar:
    """TC-07系: カレンダービュー"""

    def _go_to_analysis(self, page: Page):
        open_sidebar(page)
        page.locator(".sb-item[data-page='analysis']").click()
        page.wait_for_selector("#page-analysis.active")

    def test_07_01_record_date_highlighted_in_calendar(self, page_with_sets: Page):
        """TC-07-01: 記録のある日付がカレンダーで強調表示される"""
        p = page_with_sets
        # 戻ってから分析へ
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        # 今月のカレンダーに has-record のセルがある
        expect(p.locator(".cal-cell.has-record").first).to_be_visible()

    def test_07_02_prev_month_button_changes_month(self, page_with_sets: Page):
        """TC-07-02: 前月ボタンで月が変わる"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        current_title = p.locator(".cal-title").text_content()
        p.locator(".cal-nav-btn").first.click()
        p.wait_for_timeout(300)

        new_title = p.locator(".cal-title").text_content()
        assert current_title != new_title, "月が変わっていない"

    def test_07_03_next_month_button_changes_month(self, page_with_sets: Page):
        """TC-07-03: 翌月ボタンで月が変わる"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        current_title = p.locator(".cal-title").text_content()
        p.locator(".cal-nav-btn").last.click()
        p.wait_for_timeout(300)

        new_title = p.locator(".cal-title").text_content()
        assert current_title != new_title, "月が変わっていない"

    def test_07_04_tap_record_date_expands_session_list(self, page_with_sets: Page):
        """TC-07-04: 記録日をタップするとセッション一覧が展開される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        p.locator(".cal-cell.has-record").first.click()
        p.wait_for_timeout(300)

        expect(p.locator(".cal-detail")).to_be_visible()

    def test_07_05_session_list_shows_correct_data(self, page_with_sets: Page):
        """TC-07-05: セッション一覧にメニュー名・セット数・1RM・ボリュームが表示される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        p.locator(".cal-cell.has-record").first.click()
        p.wait_for_timeout(300)

        sess_row = p.locator(".cal-sess-row").first
        expect(sess_row.locator(".cal-sess-name")).to_contain_text("ベンチプレス")
        expect(sess_row.locator(".cal-sess-stat", has_text="セット数")).to_be_visible()
        expect(sess_row.locator(".cal-sess-stat", has_text="最大1RM")).to_be_visible()
        expect(sess_row.locator(".cal-sess-stat", has_text="ボリューム")).to_be_visible()

    def test_07_06_tap_session_row_goes_to_set_edit(self, page_with_sets: Page):
        """TC-07-06: セッション行タップでセット記録画面に遷移する（F-02）"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        p.locator(".cal-cell.has-record").first.click()
        p.wait_for_timeout(300)
        p.locator(".cal-sess-row").first.click()
        p.wait_for_selector("#page-set-edit.active")

        expect(p.locator("#page-set-edit.active")).to_be_visible()

    def test_07_07_back_from_calendar_session_returns_to_analysis(self, page_with_sets: Page):
        """TC-07-07: カレンダー経由のセット記録画面で戻るとメニュー分析に戻る（F-03）"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis(p)

        p.locator(".cal-cell.has-record").first.click()
        p.wait_for_timeout(300)
        p.locator(".cal-sess-row").first.click()
        p.wait_for_selector("#page-set-edit.active")

        p.locator("#set-back").click()
        p.wait_for_timeout(300)

        expect(p.locator("#page-analysis.active")).to_be_visible()
        expect(p.locator("#page-menu-detail.active")).not_to_be_visible()


class TestAnalysisMenuView:
    """TC-07系: メニュービュー・グラフ"""

    def _go_to_analysis_menu_tab(self, page: Page):
        open_sidebar(page)
        page.locator(".sb-item[data-page='analysis']").click()
        page.wait_for_selector("#page-analysis.active")
        page.locator("#ana-tab-menu").click()
        page.wait_for_timeout(300)

    def test_07_08_select_menu_goes_to_detail(self, page_with_sets: Page):
        """TC-07-08: メニュービューでメニューを選択すると分析詳細に遷移する"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis_menu_tab(p)

        p.locator(".ana-menu-row").first.click()
        p.wait_for_selector("#page-analysis-detail.active")

        expect(p.locator("#page-analysis-detail.active")).to_be_visible()

    def test_07_09_volume_chart_is_visible(self, page_with_sets: Page):
        """TC-07-09: 分析詳細にボリューム推移グラフが表示される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis_menu_tab(p)

        p.locator(".ana-menu-row").first.click()
        p.wait_for_selector("#page-analysis-detail.active")
        # Chart.jsの読み込みを待つ
        p.wait_for_selector("#chart-vol", timeout=10000)

        expect(p.locator("#chart-vol")).to_be_visible()

    def test_07_10_orm_chart_is_visible(self, page_with_sets: Page):
        """TC-07-10: 分析詳細に最大1RM推移グラフが表示される"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_analysis_menu_tab(p)

        p.locator(".ana-menu-row").first.click()
        p.wait_for_selector("#page-analysis-detail.active")
        p.wait_for_selector("#chart-orm", timeout=10000)

        expect(p.locator("#chart-orm")).to_be_visible()
