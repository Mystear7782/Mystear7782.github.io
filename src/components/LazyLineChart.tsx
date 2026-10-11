// グラフ(Chart.js)は大きいので、グラフを使う画面を開いたときに初めて読み込む（最初の起動を軽くする）。
import { lazy, Suspense, type ComponentProps } from 'react'

const LineChartImpl = lazy(() => import('./LineChart').then((m) => ({ default: m.LineChart })))

export function LazyLineChart(props: ComponentProps<typeof LineChartImpl>) {
  return (
    <Suspense fallback={<div style={{ height: '100%' }} aria-busy="true" />}>
      <LineChartImpl {...props} />
    </Suspense>
  )
}
