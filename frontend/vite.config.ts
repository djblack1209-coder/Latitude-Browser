import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import packageInfo from './package.json' with { type: 'json' }
import { enUS } from './src/shared/i18n/en-US.ts'
import { zhCN } from './src/shared/i18n/zh-CN.ts'

const defaultDevPort = 5218

function resolveBoolean(rawValue: string | undefined, fallbackValue: boolean) {
  const raw = String(rawValue ?? '').trim().toLowerCase()
  if (!raw) {
    return fallbackValue
  }
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false
  }
  return fallbackValue
}

function resolveDevPort() {
  const raw = Number.parseInt(process.env.FRONTEND_PORT || '', 10)
  if (Number.isInteger(raw) && raw > 0 && raw <= 65535) {
    return raw
  }
  return defaultDevPort
}

const devPort = resolveDevPort()
const disableHmr = resolveBoolean(process.env.FRONTEND_DISABLE_HMR, false)
const cleanDist = resolveBoolean(process.env.FRONTEND_CLEAN_DIST, false)

let development = false
const terminalHtml: Plugin = {
  name: 'latitude-terminal-document',
  configResolved(config) { development = config.command === 'serve' },
  transformIndexHtml(html) {
    return html.replaceAll('__LATITUDE_VERSION__', packageInfo.version)
      .replaceAll('__LATITUDE_DEV__', String(development))
      .replace('__DEV_BOOT_WORDS__', JSON.stringify({ en: [enUS['dev.waiting'], enUS['dev.retry']], zh: [zhCN['dev.waiting'], zhCN['dev.retry']] }))
  },
}

export default defineConfig({
  plugins: [terminalHtml, react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(packageInfo.version) },
  server: {
    port: devPort,
    strictPort: true,
    host: '127.0.0.1',
    cors: true,
    hmr: disableHmr
      ? false
      : {
          host: '127.0.0.1',
          protocol: 'ws',
        },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: cleanDist,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor'
        },
      },
    },
  },
})

