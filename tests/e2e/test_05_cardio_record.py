"""
test_05_cardio_record.py
TC-05系: 有酸素運動記録
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar


BASE_URL = "https://mystear7782.github.io/"

REQUIRED_FIELDS = [
    ("c-time",  "合計時間"),
    ("c-dist",  "合計距離"),
    ("c-cal",   "消費カロリー"),
    ("c-hr",    "平均心拍数"),
]

ALL_VALUES = {
    "c-time": "30",
    "c-dist": "5.0",
    "c-cal":  "300",
    "c-hr":   "140",
}


class TestCardioRecord:
    """TC-05系: 有酸素運動記録"""

    def _open_cardio_session(self, page: Page):
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)
        page.locator(".menu-row").first.click()
        page.wait_for_selector("#page-menu-detail.active")
        page.locator("button.btn-action.new-sess").click()
        page.wait_for_selector("#page-set-edit.active")

    def _fill_required(self, page: Page, skip_field: str | None = None):
        for field_id, _ in REQUIRED_FIELDS:
            if field_id != skip_field:
                page.locator(f"#{field_id}").fill(ALL_VALUES[field_id])

    # ── 正常系 ──

    def test_05_01_save_with_required_fields(self, page_with_cardio: Page):
        """TC-05-01: 必須4項目を入力して有酸素運動を記録できる"""
        self._open_cardio_session(page_with_cardio)
        self._fill_required(page_with_cardio)
        page_with_cardio.locator("#btn-save-cardio").click()
        page_with_cardio.wait_for_timeout(500)

        expect(page_with_cardio.locator("#toast")).to_contain_text("記録を保存しました")
        # カレンダー経由でない場合はmenu-detailに遷移する
        page_with_cardio.wait_for_selector("#page-menu-detail.active")
        expect(page_with_cardio.locator("#page-menu-detail.active")).to_be_visible()

    def test_05_02_save_with_optional_fields(self, page_with_cardio: Page):
        """TC-05-02: 任意項目（速度）も入力して保存できる"""
        self._open_cardio_session(page_with_cardio)
        self._fill_required(page_with_cardio)
        page_with_cardio.locator("#c-maxspd").fill("12.0")
        page_with_cardio.locator("#c-avgspd").fill("8.5")
        page_with_cardio.locator("#btn-save-cardio").click()
        page_with_cardio.wait_for_timeout(500)

        expect(page_with_cardio.locator("#toast")).to_contain_text("記録を保存しました")

    # ── 活性制御・必須項目 ──

    def test_05_03_save_with_all_empty_shows_error(self, page_with_cardio: Page):
        """TC-05-03: 必須項目全未入力で保存するとエラートーストが表示される"""
        self._open_cardio_session(page_with_cardio)
        page_with_cardio.locator("#btn-save-cardio").click()

        expect(page_with_cardio.locator("#toast")).to_be_visible()
        # set-editにとどまる
        expect(page_with_cardio.locator("#page-set-edit.active")).to_be_visible()

    @pytest.mark.parametrize("skip_id,field_name", REQUIRED_FIELDS)
    def test_05_04_07_missing_required_field_shows_field_name(
        self, page_with_cardio: Page, skip_id: str, field_name: str
    ):
        """TC-05-04〜07: 各必須項目の未入力でトーストにフィールド名が含まれる"""
        self._open_cardio_session(page_with_cardio)
        self._fill_required(page_with_cardio, skip_field=skip_id)
        page_with_cardio.locator("#btn-save-cardio").click()

        expect(page_with_cardio.locator("#toast")).to_contain_text(field_name)
        # set-editにとどまる
        expect(page_with_cardio.locator("#page-set-edit.active")).to_be_visible()

    # ── 境界値 ──

    def test_05_08_time_zero_triggers_error(self, page_with_cardio: Page):
        """TC-05-08: 時間0分で保存するとエラー
        アプリ側で 0 を null 扱いするよう修正済みのためエラーになることを確認"""
        self._open_cardio_session(page_with_cardio)
        self._fill_required(page_with_cardio, skip_field="c-time")
        page_with_cardio.locator("#c-time").fill("0")
        page_with_cardio.locator("#btn-save-cardio").click()

        expect(page_with_cardio.locator("#toast")).to_contain_text("合計時間")
        expect(page_with_cardio.locator("#page-set-edit.active")).to_be_visible()

    def test_05_09_dist_min_value_is_valid(self, page_with_cardio: Page):
        """TC-05-09: 距離0.1km（最小刻み）で保存できる"""
        self._open_cardio_session(page_with_cardio)
        self._fill_required(page_with_cardio, skip_field="c-dist")
        page_with_cardio.locator("#c-dist").fill("0.1")
        page_with_cardio.locator("#btn-save-cardio").click()
        page_with_cardio.wait_for_timeout(500)

        expect(page_with_cardio.locator("#toast")).to_contain_text("記録を保存しました")
