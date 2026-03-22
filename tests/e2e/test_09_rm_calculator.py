"""
test_09_rm_calculator.py
TC-09系: RM換算表（推定1RM計算・1〜10rep換算一覧）

計算式:
  ベンチプレス:           1RM = w × r ÷ 40 + w
  スクワット/デッドリフト: 1RM = w × r ÷ 33.3 + w
  逆算（Nrepの重量）:     w   = 1RM ÷ (r ÷ divisor + 1)

丸め仕様（アプリ・参考表共通）:
  小数部 < 0.5  → 切り捨て（例: 47.25 → 47）
  小数部 >= 0.5 → 切り上げ（例: 52.5  → 53）
  整数のまま    → そのまま（例: 100.0 → 100）

期待値（事前計算済み）:
  80kg×10回  BP=100  SQ=104
  100kg×5回  BP=113  SQ=115
  45kg×2回   BP=47   SQ=48
  60kg×3回   BP=65   SQ=65

  1RM=100kgのとき1〜10rep換算:
  rep:  1    2    3    4    5    6    7    8    9   10
  BP: 100   95   93   91   89   87   85   83   82   80
  SQ: 100   94   92   89   87   85   83   81   79   77
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import open_sidebar


class TestRMCalculator:
    """TC-09系: RM換算表"""

    def _go_to_rm(self, page: Page):
        open_sidebar(page)
        page.locator(".sb-item[data-page='rm']").click()
        page.wait_for_selector("#page-rm.active")

    def _fill_inputs(self, page: Page, weight: str, reps: str):
        page.locator("#rm-inp-w").fill(weight)
        page.locator("#rm-inp-r").fill(reps)
        page.wait_for_timeout(200)

    # ── 正常系：ナビゲーション ──

    def test_09_01_navigate_to_rm_page(self, page: Page):
        """TC-09-01: RM換算表ページに遷移できる"""
        self._go_to_rm(page)
        expect(page.locator("#page-rm.active")).to_be_visible()
        expect(page.locator("#page-title")).to_have_text("RM換算表")

    # ── 正常系：推定1RM計算 ──

    def test_09_02_bench_press_orm_integer_result(self, page: Page):
        """TC-09-02: ベンチプレスの推定1RMが正しく計算される（80kg×10回=100）
        80×10÷40+80 = 100.0 → 整数表示 100"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "10")

        expect(page.locator("#rm-orm-result")).to_be_visible()
        expect(page.locator("#rm-bp-val")).to_have_text("100")

    def test_09_03_squat_orm_integer_result(self, page: Page):
        """TC-09-03: スクワット/DLの推定1RMが正しく計算される（80kg×10回=104）
        80×10÷33.3+80 = 104.024... → 切り捨て 104"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "10")

        expect(page.locator("#rm-sq-val")).to_have_text("104")

    def test_09_04_bench_press_roundup_result(self, page: Page):
        """TC-09-04: 小数部0.5で切り上げになる（100kg×5回=113）
        100×5÷40+100 = 112.5 → 切り上げ 113"""
        self._go_to_rm(page)
        self._fill_inputs(page, "100", "5")

        expect(page.locator("#rm-bp-val")).to_have_text("113")

    def test_09_05_squat_rounddown_result(self, page: Page):
        """TC-09-05: 小数部0.024で切り捨てになる（100kg×5回=115）
        100×5÷33.3+100 = 115.015... → 切り捨て 115"""
        self._go_to_rm(page)
        self._fill_inputs(page, "100", "5")

        expect(page.locator("#rm-sq-val")).to_have_text("115")

    def test_09_06_bench_press_rounddown_result(self, page: Page):
        """TC-09-06: 小数部0.25で切り捨てになる（45kg×2回=47）
        45×2÷40+45 = 47.25 → 切り捨て 47"""
        self._go_to_rm(page)
        self._fill_inputs(page, "45", "2")

        expect(page.locator("#rm-bp-val")).to_have_text("47")

    def test_09_07_bench_press_05_roundup(self, page: Page):
        """TC-09-07: 小数部0.5で切り上げ（60kg×3回=65）
        60×3÷40+60 = 64.5 → 切り上げ 65"""
        self._go_to_rm(page)
        self._fill_inputs(page, "60", "3")

        expect(page.locator("#rm-bp-val")).to_have_text("65")

    # ── 活性制御：結果表示の制御 ──

    def test_09_08_result_hidden_when_no_weight(self, page: Page):
        """TC-09-08: 重量未入力時に推定1RM結果が表示されない"""
        self._go_to_rm(page)
        page.locator("#rm-inp-r").fill("10")
        page.wait_for_timeout(200)

        expect(page.locator("#rm-orm-result")).to_be_hidden()

    def test_09_09_result_hidden_when_no_reps(self, page: Page):
        """TC-09-09: 回数未入力時に推定1RM結果が表示されない"""
        self._go_to_rm(page)
        page.locator("#rm-inp-w").fill("80")
        page.wait_for_timeout(200)

        expect(page.locator("#rm-orm-result")).to_be_hidden()

    def test_09_10_result_hidden_when_weight_zero(self, page: Page):
        """TC-09-10: 重量0で結果が表示されない"""
        self._go_to_rm(page)
        self._fill_inputs(page, "0", "10")

        expect(page.locator("#rm-orm-result")).to_be_hidden()

    def test_09_11_result_hidden_when_reps_zero(self, page: Page):
        """TC-09-11: 回数0で結果が表示されない"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "0")

        expect(page.locator("#rm-orm-result")).to_be_hidden()

    # ── 境界値 ──

    def test_09_12_minimum_inputs(self, page: Page):
        """TC-09-12: 最小値（重量0.5kg・回数1回）で計算できる
        BP: 0.5×1÷40+0.5 = 0.5125 → 切り上げ 1
        SQ: 0.5×1÷33.3+0.5 = 0.515... → 切り上げ 1"""
        self._go_to_rm(page)
        self._fill_inputs(page, "0.5", "1")

        expect(page.locator("#rm-orm-result")).to_be_visible()
        expect(page.locator("#rm-bp-val")).to_have_text("1")
        expect(page.locator("#rm-sq-val")).to_have_text("1")

    def test_09_13_large_inputs(self, page: Page):
        """TC-09-13: 大きい値（200kg×5回）で計算できる
        BP: 200×5÷40+200 = 225 → 225
        SQ: 200×5÷33.3+200 = 230.03... → 切り捨て 230"""
        self._go_to_rm(page)
        self._fill_inputs(page, "200", "5")

        expect(page.locator("#rm-orm-result")).to_be_visible()
        expect(page.locator("#rm-bp-val")).to_have_text("225")
        expect(page.locator("#rm-sq-val")).to_have_text("230")

    # ── 1〜10rep換算一覧 ──

    def test_09_14_auto_link_to_max_rm(self, page: Page):
        """TC-09-14: 推定1RM計算後に最大RM欄へ自動連動される（ベンチプレス値）
        80kg×10回 → BP推定1RM=100 → 最大RM欄に100が入る"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "10")

        max_val = page.locator("#rm-inp-max").input_value()
        assert max_val == "100", f"最大RM欄の自動連動値が不正: {max_val}"

    def test_09_15_table_visible_after_max_rm(self, page: Page):
        """TC-09-15: 最大RM入力後に換算テーブルが表示される"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        expect(page.locator(".rm-rep-table")).to_be_visible()

    def test_09_16_1rep_shows_max_rm(self, page: Page):
        """TC-09-16: 1repは最大RMそのものが表示される（BP=100・SQ=100）"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        first_row = page.locator(".rm-rep-table tbody tr").first
        cells = first_row.locator("td").all_text_contents()
        assert "100 kg" in cells[1], f"BP 1rep期待値100、実際:{cells[1]}"
        assert "100 kg" in cells[2], f"SQ 1rep期待値100、実際:{cells[2]}"

    def test_09_17_bench_5rep_correct(self, page: Page):
        """TC-09-17: ベンチプレス5repの逆算が正しい（1RM=100 → 89kg）
        100 ÷ (5÷40+1) = 88.88... → 切り上げ 89"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        row_5 = page.locator(".rm-rep-table tbody tr").nth(4)
        cells = row_5.locator("td").all_text_contents()
        assert "89 kg" in cells[1], f"BP 5rep期待値89、実際:{cells[1]}"

    def test_09_18_squat_5rep_correct(self, page: Page):
        """TC-09-18: スクワット/DL 5repの逆算が正しい（1RM=100 → 87kg）
        100 ÷ (5÷33.3+1) = 86.94... → 切り上げ 87"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        row_5 = page.locator(".rm-rep-table tbody tr").nth(4)
        cells = row_5.locator("td").all_text_contents()
        assert "87 kg" in cells[2], f"SQ 5rep期待値87、実際:{cells[2]}"

    def test_09_19_bench_10rep_correct(self, page: Page):
        """TC-09-19: ベンチプレス10repの逆算が正しい（1RM=100 → 80kg）
        100 ÷ (10÷40+1) = 80.0 → 80"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        row_10 = page.locator(".rm-rep-table tbody tr").nth(9)
        cells = row_10.locator("td").all_text_contents()
        assert "80 kg" in cells[1], f"BP 10rep期待値80、実際:{cells[1]}"

    def test_09_20_squat_10rep_correct(self, page: Page):
        """TC-09-20: スクワット/DL 10repの逆算が正しい（1RM=100 → 77kg）
        100 ÷ (10÷33.3+1) = 76.92... → 切り上げ 77"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("100")
        page.wait_for_timeout(200)

        row_10 = page.locator(".rm-rep-table tbody tr").nth(9)
        cells = row_10.locator("td").all_text_contents()
        assert "77 kg" in cells[2], f"SQ 10rep期待値77、実際:{cells[2]}"

    def test_09_21_input_rep_row_highlighted(self, page: Page):
        """TC-09-21: 入力した回数（10回）の行がハイライトされる"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "10")

        expect(page.locator(".rm-rep-table tbody tr.rm-highlight")).to_be_visible()
        # 10rep行（10番目の行）がハイライトされているか確認
        highlighted_row = page.locator(".rm-rep-table tbody tr.rm-highlight")
        badge_text = highlighted_row.locator(".rm-rep-badge").text_content()
        assert badge_text == "10", f"ハイライト行のrep番号が不正: {badge_text}"

    def test_09_22_table_hidden_when_no_max_rm(self, page: Page):
        """TC-09-22: 最大RM未入力時にテーブルが表示されない（空状態を表示）"""
        self._go_to_rm(page)
        expect(page.locator(".rm-rep-table")).not_to_be_visible()
        expect(page.locator("#rm-table-wrap .empty-title")).to_be_visible()

    def test_09_23_table_hidden_when_max_rm_zero(self, page: Page):
        """TC-09-23: 最大RM=0でテーブルが表示されない"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("0")
        page.wait_for_timeout(200)

        expect(page.locator(".rm-rep-table")).not_to_be_visible()

    def test_09_24_direct_max_rm_input(self, page: Page):
        """TC-09-24: 最大RMを直接手入力してテーブルを表示できる
        （重量・回数を入力せず最大RMだけ入力する使い方）"""
        self._go_to_rm(page)
        page.locator("#rm-inp-max").fill("120")
        page.wait_for_timeout(200)

        expect(page.locator(".rm-rep-table")).to_be_visible()
        # 1repは120kgそのまま
        first_row = page.locator(".rm-rep-table tbody tr").first
        cells = first_row.locator("td").all_text_contents()
        assert "120 kg" in cells[1], f"直接入力1rep BP期待値120、実際:{cells[1]}"

    def test_09_25_page_reset_on_revisit(self, page: Page):
        """TC-09-25: ページを離れて戻るとフォームがクリアされる"""
        self._go_to_rm(page)
        self._fill_inputs(page, "80", "10")
        expect(page.locator("#rm-orm-result")).to_be_visible()

        # 別ページへ移動
        open_sidebar(page)
        page.get_by_text("≡メニュー一覧").click()
        page.wait_for_timeout(300)

        # RM換算表に戻る
        self._go_to_rm(page)

        # フォームがリセットされている
        assert page.locator("#rm-inp-w").input_value() == "", "重量フィールドがリセットされていない"
        assert page.locator("#rm-inp-r").input_value() == "", "回数フィールドがリセットされていない"
        assert page.locator("#rm-inp-max").input_value() == "", "最大RMフィールドがリセットされていない"
        expect(page.locator("#rm-orm-result")).to_be_hidden()
