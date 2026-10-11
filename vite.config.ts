import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// 本番のSupabaseプロジェクト。VITE_SUPABASE_URL で上書きできる（E2E/ローカル開発はローカルのSupabaseを指す）
const PROD_SUPABASE_URL = 'https://swncmbsamxoyjeojwbyc.supabase.co'

/**
 * 本番ビルドの index.html に Content-Security-Policy を埋め込む。
 * - inline script は使わない（'unsafe-inline' を script-src に含めない）。外部スクリプトはすべてバンドル。
 * - スタイルのinline属性はReact/Chart.jsが CSSOM 経由で設定するため、style-src に 'unsafe-inline' は不要。
 * 開発サーバー(vite dev)ではReact Fast Refreshがinline scriptを差し込むため適用しない。
 */
function cspPlugin(supabaseUrl: string): Plugin {
  const supabaseOrigin = new URL(supabaseUrl).origin
  const csp = [
    `default-src 'self'`,
    `script-src 'self'`,
    `style-src 'self' https://fonts.googleapis.com`,
    `font-src https://fonts.gstatic.com`,
    `img-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `form-action 'self'`,
    `base-uri 'self'`,
  ].join('; ')
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL || PROD_SUPABASE_URL

  return {
    base: '/',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      react(),
      cspPlugin(supabaseUrl),
      VitePWA({
        // 新しい版が見つかったら画面にバナーを出し、ユーザーの操作で切り替える（入力中の突然のリロードを避ける）
        registerType: 'prompt',
        injectRegister: false,
        // 出力は旧アプリと同じ sw.js / manifest.json の名前にして、旧Service Workerを置き換える
        filename: 'sw.ts',
        manifestFilename: 'manifest.json',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: 'Workout tracker',
          short_name: 'Workout tracker',
          description: '筋トレ記録アプリ',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0d0f14',
          theme_color: '#0d0f14',
          lang: 'ja',
          icons: [
            { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        // Service Worker は自作（src/sw/sw.ts）。HTML/JS/CSSはネットワーク優先(3秒でキャッシュに切り替え)、
        // Supabaseへの通信は一切キャッシュしない。詳細は src/sw/routing.ts。
        strategies: 'injectManifest',
        srcDir: 'src/sw',
        injectManifest: {
          // 古い端末でも動くよう、Service Workerは通常(classic)のスクリプトとして出力する
          rollupFormat: 'iife',
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          // OAuth同意画面は、あらかじめキャッシュしない（常にネットワークから取る）
          globIgnores: ['oauth-consent.*'],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  }
})
