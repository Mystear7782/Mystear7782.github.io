import { createHashRouter, type RouteObject } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { AnalysisDetailPage } from '@/features/analysis/AnalysisDetailPage'
import { AnalysisPage } from '@/features/analysis/AnalysisPage'
import { MealPage } from '@/features/body/MealPage'
import { WeightPage } from '@/features/body/WeightPage'
import { CsvPage } from '@/features/csv/CsvPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MenuSetDetailPage } from '@/features/menu-sets/MenuSetDetailPage'
import { MenuSetListPage } from '@/features/menu-sets/MenuSetListPage'
import { MenuAddPage } from '@/features/menus/MenuAddPage'
import { MenuDetailPage } from '@/features/menus/MenuDetailPage'
import { MenuListPage } from '@/features/menus/MenuListPage'
import { RmPage } from '@/features/rm/RmPage'
import { SessionEditPage } from '@/features/session/SessionEditPage'
import { ConfigPage } from '@/features/settings/ConfigPage'

/**
 * 画面のルーティング。GitHub Pagesにはtopのindex.html以外へのフォールバックが無いため、
 * パスに # を使う HashRouter にしている（例: https://mystear7782.github.io/#/menus）。
 * handle.title は、ヘッダーに表示するページ名。
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage />, handle: { title: 'ダッシュボード' } },
      { path: 'menus', element: <MenuListPage />, handle: { title: 'メニュー一覧' } },
      { path: 'menus/new', element: <MenuAddPage />, handle: { title: 'メニューの追加' } },
      { path: 'menus/:menuId', element: <MenuDetailPage />, handle: { title: 'メニュー詳細' } },
      // sessionId が "new" のときは、まだ保存されていない新規セッション
      {
        path: 'menus/:menuId/sessions/:sessionId',
        element: <SessionEditPage />,
        handle: { title: 'セット記録' },
      },
      { path: 'menu-sets', element: <MenuSetListPage />, handle: { title: 'メニューセット' } },
      { path: 'menu-sets/:setId', element: <MenuSetDetailPage />, handle: { title: 'セット詳細' } },
      { path: 'analysis', element: <AnalysisPage />, handle: { title: 'メニュー分析' } },
      { path: 'analysis/:menuId', element: <AnalysisDetailPage />, handle: { title: '分析詳細' } },
      { path: 'weight', element: <WeightPage />, handle: { title: '体重ログ' } },
      { path: 'meal', element: <MealPage />, handle: { title: '食事記録' } },
      { path: 'rm', element: <RmPage />, handle: { title: 'RM換算表' } },
      { path: 'csv', element: <CsvPage />, handle: { title: 'CSV出力 / 入力' } },
      { path: 'config', element: <ConfigPage />, handle: { title: '設定' } },
      { path: '*', element: <DashboardPage />, handle: { title: 'ダッシュボード' } },
    ],
  },
]

export const createAppRouter = () => createHashRouter(routes)
