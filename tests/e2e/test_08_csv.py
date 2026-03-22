"""
test_08_csv.py
TC-08系: CSV出力・入力
"""
import pytest
import os
import tempfile
from playwright.sync_api import Page, expect
from conftest import open_sidebar, seed_menu


BASE_URL = "https://mystear7782.github.io/"


class TestCsvExport:
    """TC-08系: CSVエクスポート"""

    def _go_to_csv_page(self, page: Page):
        open_sidebar(page)
        page.locator(".sb-item[data-page='csv']").click()
        page.wait_for_selector("#page-csv.active")

    def test_08_01_strength_export_triggers_download(self, page_with_sets: Page):
        """TC-08-01: 筋トレCSVエクスポートでダウンロードが発生する"""
        p = page_with_sets
        p.locator("#set-back").click()
        p.wait_for_timeout(300)
        self._go_to_csv_page(p)

        with p.expect_download() as dl_info:
            p.locator(".csv-btn", has_text="筋トレ記録をエクスポート").click()

        dl = dl_info.value
        assert "gymlog_strength" in dl.suggested_filename or ".csv" in dl.suggested_filename

    def test_08_02_cardio_export_triggers_download(self, page_with_cardio: Page):
        """TC-08-02: 有酸素CSVエクスポートでダウンロードが発生する"""
        p = page_with_cardio
        # カーディオのセッションを作成
        open_sidebar(p)
        p.get_by_text("≡メニュー一覧").click()
        p.wait_for_timeout(300)
        p.locator(".menu-row").first.click()
        p.locator("button.btn-action.new-sess").click()
        p.wait_for_timeout(300)
        p.locator("#c-time").fill("30")
        p.locator("#c-dist").fill("5.0")
        p.locator("#c-cal").fill("300")
        p.locator("#c-hr").fill("140")
        p.locator("#btn-save-cardio").click()
        p.wait_for_timeout(500)

        self._go_to_csv_page(p)

        with p.expect_download() as dl_info:
            p.locator(".csv-btn", has_text="有酸素運動記録をエクスポート").click()

        dl = dl_info.value
        assert ".csv" in dl.suggested_filename

    def test_08_03_strength_export_error_when_no_menus(self, page: Page):
        """TC-08-03: 筋トレメニューが0件でエクスポートするとエラートースト"""
        self._go_to_csv_page(page)
        page.locator(".csv-btn", has_text="筋トレ記録をエクスポート").click()
        expect(page.locator("#toast")).to_contain_text("筋トレメニューがありません")

    def test_08_04_cardio_export_error_when_no_menus(self, page: Page):
        """TC-08-04: 有酸素メニューが0件でエクスポートするとエラートースト"""
        self._go_to_csv_page(page)
        page.locator(".csv-btn", has_text="有酸素運動記録をエクスポート").click()
        expect(page.locator("#toast")).to_contain_text("有酸素運動メニューがありません")


class TestCsvImport:
    """TC-08系: CSVインポート"""

    def _go_to_csv_page(self, page: Page):
        open_sidebar(page)
        page.locator(".sb-item[data-page='csv']").click()
        page.wait_for_selector("#page-csv.active")

    def _create_strength_csv(self, rows: list[str]) -> str:
        """一時CSVファイルを作成してパスを返す"""
        header = "menu_name,category,type,date,session_id,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg\n"
        content = header + "\n".join(rows) + "\n"
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False, encoding="utf-8-sig"
        )
        tmp.write(content)
        tmp.close()
        return tmp.name

    def test_08_05_import_csv_shows_count(self, page: Page):
        """TC-08-05: 正常なCSVをインポートすると件数が表示される"""
        csv_path = self._create_strength_csv([
            '"スクワット",足,フリーウェイト,2026-03-01,sess_test_001,1,100,10,125.0,1000',
            '"スクワット",足,フリーウェイト,2026-03-01,sess_test_001,2,105,8,126.0,840',
        ])

        try:
            self._go_to_csv_page(page)
            page.locator("input[type='file']").set_input_files(csv_path)
            page.wait_for_timeout(1000)

            expect(page.locator("#import-result")).to_be_visible()
            expect(page.locator("#import-result")).to_contain_text("インポートしました")
        finally:
            os.unlink(csv_path)

    def test_08_06_import_reflects_in_menu_list(self, page: Page):
        """TC-08-06: インポート後にメニュー一覧に反映される"""
        csv_path = self._create_strength_csv([
            '"デッドリフト",背中,フリーウェイト,2026-03-10,sess_dl_001,1,120,5,129.0,600',
        ])

        try:
            self._go_to_csv_page(page)
            page.locator("input[type='file']").set_input_files(csv_path)
            page.wait_for_timeout(1000)

            open_sidebar(page)
            page.get_by_text("≡メニュー一覧").click()
            page.wait_for_timeout(300)

            expect(page.locator(".menu-row-name", has_text="デッドリフト")).to_be_visible()
        finally:
            os.unlink(csv_path)

    def test_08_07_duplicate_session_shows_skip_count(self, page: Page):
        """TC-08-07: 重複セッションのCSVをインポートするとスキップ件数が表示される"""
        rows = ['"プルアップ",背中,自重運動,2026-03-15,sess_dup_001,1,60,10,75.0,600']
        csv_path = self._create_strength_csv(rows)

        try:
            self._go_to_csv_page(page)
            # 1回目インポート
            page.locator("input[type='file']").set_input_files(csv_path)
            page.wait_for_timeout(1000)
            # 2回目（同じファイル → 重複）
            page.locator("input[type='file']").set_input_files(csv_path)
            page.wait_for_timeout(1000)

            expect(page.locator("#import-result")).to_contain_text("スキップ")
        finally:
            os.unlink(csv_path)

    def test_08_08_empty_session_id_merged_by_date(self, page: Page):
        """TC-08-08: session_id空欄で同日同メニューが同一セッションにまとめられる"""
        csv_path = self._create_strength_csv([
            '"レッグプレス",足,マシン,2026-03-20,,1,80,12,104.0,960',
            '"レッグプレス",足,マシン,2026-03-20,,2,85,10,106.25,850',
            '"レッグプレス",足,マシン,2026-03-20,,3,85,8,102.0,680',
        ])

        try:
            self._go_to_csv_page(page)
            page.locator("input[type='file']").set_input_files(csv_path)
            page.wait_for_timeout(1000)

            # localStorageで確認：1セッションに3セット入っている
            result = page.evaluate("""() => {
                const s = JSON.parse(localStorage.getItem('gl_sessions') || '{}');
                const allSessions = Object.values(s).flatMap(m => Object.values(m));
                const target = allSessions.find(sess =>
                    sess.sets && sess.sets.length === 3
                );
                return target ? target.sets.length : 0;
            }""")
            assert result == 3, f"3セットが1セッションにまとめられていない（実際: {result}セット）"
        finally:
            os.unlink(csv_path)
