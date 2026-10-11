// 折れ線グラフ（体重推移・ボリューム推移・1RM推移で共通）。Chart.js はnpmでバンドルする（CDNを使わない）。
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useSyncExternalStore } from 'react'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const DARK_QUERY = '(prefers-color-scheme:dark)'

/** OSのダークモード設定を購読する */
function useDarkMode(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(DARK_QUERY)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  )
}

type Props = {
  /** canvas の id（E2Eテスト・旧アプリとの互換） */
  id: string
  labels: string[]
  data: number[]
  /** データセット名 例: '体重 (kg)' */
  label: string
  /** ツールチップの単位 */
  unit?: string
}

export function LineChart({ id, labels, data, label, unit = 'kg' }: Props) {
  const isDark = useDarkMode()
  const accent = isDark ? '#38bdf8' : '#0ea5e9'
  const grid = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'
  const tick = isDark ? '#6b7280' : '#9ca3af'

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} ${unit}` } },
    },
    scales: {
      x: { grid: { color: grid }, ticks: { color: tick, font: { size: 11 }, maxRotation: 45 } },
      y: { grid: { color: grid }, ticks: { color: tick, font: { size: 11 } }, beginAtZero: false },
    },
  }

  return (
    <Line
      id={id}
      options={options}
      data={{
        labels,
        datasets: [
          {
            label,
            data,
            borderColor: accent,
            backgroundColor: isDark ? 'rgba(56,189,248,.1)' : 'rgba(14,165,233,.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.3,
          },
        ],
      }}
    />
  )
}
