"""
conftest.py - 共通フィクスチャ
全テストで共有するブラウザ起動・localStorage初期化を提供する
"""
import pytest
from playwright.sync_api import sync_playwright, Page

BASE_URL = "https://mystear7782.github.io/"


def clear_storage(page: Page) -> None:
    """localStorageをクリアしてページをリロードする"""
    page.evaluate("() => { localStorage.clear(); }")
    page.reload()
    page.wait_for_load_state("networkidle")


def seed_menu(page: Page, category: str, menu_type: str | None, name: str) -> None:
    """テスト用メニューを1件登録するヘルパー"""
    open_sidebar(page)
    page.get_by_text("＋メニューの追加").click()
    close_sidebar_if_open(page)

    page.locator("#sel-cat").select_option(category)
    if menu_type:
        page.locator(f".type-chip[data-type='{menu_type}']").click()
    page.locator("#inp-name").fill(name)
    page.locator("#btn-add").click()
    # トーストが消えるまで待つ
    page.wait_for_timeout(2500)


def open_sidebar(page: Page) -> None:
    page.locator("#hamburger").click()
    page.wait_for_selector("#sidebar.show")


def close_sidebar_if_open(page: Page) -> None:
    if page.locator("#sidebar.show").is_visible():
        page.locator("#overlay").click()
        page.wait_for_selector("#sidebar:not(.show)")


@pytest.fixture(scope="function")
def page():
    """各テストに独立したページを提供する"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        pg = context.new_page()
        pg.goto(BASE_URL)
        pg.wait_for_load_state("networkidle")
        clear_storage(pg)
        yield pg
        context.close()
        browser.close()


@pytest.fixture(scope="function")
def page_with_menu(page: Page):
    """「胸/フリーウェイト/ベンチプレス」が登録済みのページを提供する"""
    seed_menu(page, "胸", "フリーウェイト", "ベンチプレス")
    yield page


@pytest.fixture(scope="function")
def page_with_cardio(page: Page):
    """「有酸素運動/ランニング」が登録済みのページを提供する"""
    seed_menu(page, "有酸素運動", None, "ランニング")
    yield page


@pytest.fixture(scope="function")
def page_with_bodyweight_menu(page: Page):
    """「足/自重運動/スクワット」が登録済みのページを提供する"""
    seed_menu(page, "足", "自重運動", "スクワット")
    yield page


@pytest.fixture(scope="function")
def page_with_bodyweight_sets(page_with_bodyweight_menu: Page):
    """スクワットに2セット記録済みのページを提供する（set-edit画面）"""
    p = page_with_bodyweight_menu
    open_sidebar(p)
    p.get_by_text("≡メニュー一覧").click()
    p.wait_for_timeout(300)
    p.locator(".menu-row").first.click()
    p.wait_for_selector("#page-menu-detail.active")
    p.locator("button.btn-action.new-sess").click()
    p.wait_for_selector("#page-set-edit.active")
    # セット1: 10回
    p.locator("#inp-r").fill("10")
    p.locator("#btn-add-set").click()
    p.wait_for_timeout(300)
    # セット2: 15回
    p.locator("#inp-r").fill("15")
    p.locator("#btn-add-set").click()
    p.wait_for_timeout(300)
    yield p


@pytest.fixture(scope="function")
def page_with_sets(page_with_menu: Page):
    """ベンチプレスに2セット記録済みのページを提供する"""
    p = page_with_menu
    # メニュー一覧へ
    open_sidebar(p)
    p.get_by_text("≡メニュー一覧").click()
    p.wait_for_timeout(300)
    p.locator(".menu-row").first.click()
    # 新規セッション
    p.locator("button.btn-action.new-sess").click()
    p.wait_for_timeout(300)
    # セット1: 80kg x 10回
    p.locator("#inp-w").fill("80")
    p.locator("#inp-r").fill("10")
    p.locator("#btn-add-set").click()
    p.wait_for_timeout(300)
    # セット2: 85kg x 8回
    p.locator("#inp-w").fill("85")
    p.locator("#inp-r").fill("8")
    p.locator("#btn-add-set").click()
    p.wait_for_timeout(300)
    yield p
