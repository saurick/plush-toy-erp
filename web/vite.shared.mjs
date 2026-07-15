import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { createDevCustomerImportDryRunPlugin } from './devCustomerImportDryRunPlugin.mjs'
import { createDevCustomerConfigPlugin } from './devCustomerConfigPlugin.mjs'
import { getAppDefinition } from './src/erp/config/appRegistry.mjs'
import { loadDevPorts } from '../scripts/dev-ports.mjs'
import { normalizeAPIOrigin } from '../scripts/local-runtime-preflight-core.mjs'

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(ROOT_DIR, '..')
const devPorts = loadDevPorts(PROJECT_ROOT)
const DEV_HOST = '127.0.0.1'

export function resolveERPDevServerPort(rawPort, ports = devPorts) {
  const normalized = String(rawPort || '').trim()
  const port = normalized ? Number(normalized) : ports.web
  const auxEnd = ports.auxStart + 99
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('ERP_VITE_PORT must be an integer between 1024 and 65535')
  }
  if (
    port !== ports.web &&
    port !== ports.style &&
    (port < ports.auxStart || port > auxEnd)
  ) {
    throw new Error(
      `ERP_VITE_PORT=${port} must use web=${ports.web}, style=${ports.style}, or auxiliary range ${ports.auxStart}-${auxEnd}`
    )
  }
  return port
}

export function resolveERPHMRClientPort(rawPort, serverPort) {
  const normalized = String(rawPort || '').trim()
  const port = normalized ? Number(normalized) : serverPort
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      'ERP_VITE_HMR_CLIENT_PORT must be an integer between 1024 and 65535'
    )
  }
  if (port !== serverPort) {
    throw new Error(
      `ERP_VITE_HMR_CLIENT_PORT=${port} must match ERP_VITE_PORT=${serverPort}`
    )
  }
  return port
}

const createDevOrigin = (port) => `http://${DEV_HOST}:${port}`

const normalizeDevLocalUrl = (url, port) => {
  return String(url || '').replace(
    `http://localhost:${port}`,
    createDevOrigin(port)
  )
}

const createDevLocalhostOriginNormalizer = (port) => ({
  name: 'plush-dev-localhost-origin-normalizer',
  apply: 'serve',
  configureServer(server) {
    const printUrls = server.printUrls.bind(server)
    server.printUrls = () => {
      if (server.resolvedUrls?.local) {
        server.resolvedUrls.local = server.resolvedUrls.local.map((url) =>
          normalizeDevLocalUrl(url, port)
        )
      }
      printUrls()
    }
  },
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        injectTo: 'head-prepend',
        children: `
;(function () {
  var loc = window.location
  if (loc.protocol === 'http:' && loc.hostname === 'localhost' && loc.port === '${port}') {
    loc.replace('${createDevOrigin(port)}' + loc.pathname + loc.search + loc.hash)
  }
})()
`,
      },
    ]
  },
})

export function createERPViteConfig(appId) {
  const app = getAppDefinition(appId)
  const serverPort = resolveERPDevServerPort(process.env.ERP_VITE_PORT)
  const hmrClientPort = resolveERPHMRClientPort(
    process.env.ERP_VITE_HMR_CLIENT_PORT,
    serverPort
  )
  const apiOrigin = normalizeAPIOrigin(
    process.env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`
  )

  return defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const isProd = mode === 'production'
    const isDev = mode === 'development'

    if (!isProd) {
      console.log(`[vite] erp app=${app.id} command=${command} mode=${mode}`)
    }

    return {
      base: isDev ? '/' : env.VITE_BASE_URL || '/',
      plugins: [
        // 本机开发统一用 IPv4 origin，避免 localhost 解析或代理链路导致源模块加载抖动。
        isDev ? createDevLocalhostOriginNormalizer(serverPort) : null,
        react(),
        isDev
          ? createDevCustomerImportDryRunPlugin({
              projectRoot: resolve(ROOT_DIR, '..'),
              apiOrigin,
              devCustomerKey: process.env.ERP_DEV_CUSTOMER_KEY || '',
            })
          : null,
        isDev
          ? createDevCustomerConfigPlugin({
              projectRoot: resolve(ROOT_DIR, '..'),
            })
          : null,
      ].filter(Boolean),
      esbuild: {
        drop: isProd ? ['console', 'debugger'] : [],
      },
      reportCompressedSize: false,
      build: {
        outDir: 'build',
        assetsDir: 'assets',
        sourcemap: !isProd,
        minify: 'esbuild',
        cssMinify: 'esbuild',
        target: 'es2018',
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            entryFileNames: 'assets/[name].[hash].js',
            chunkFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash].[ext]',
            // 交给 Rollup 自动拆包，避免手工 vendor 分组把 antd 等运行时依赖压成一个大 chunk。
          },
        },
      },
      resolve: {
        alias: {
          '@': resolve(ROOT_DIR, './src'),
        },
        extensions: [
          '.js',
          '.jsx',
          '.ts',
          '.tsx',
          '.json',
          '.css',
          '.scss',
          '.sass',
        ],
      },
      cacheDir: resolve(
        ROOT_DIR,
        mode === 'development'
          ? `.vite-cache/${app.id}`
          : `build/.vite-cache/${app.id}`
      ),
      server: {
        host: '0.0.0.0',
        port: serverPort,
        strictPort: true,
        open: createDevOrigin(serverPort),
        hmr: {
          host: DEV_HOST,
          clientPort: hmrClientPort,
        },
        proxy: {
          '/rpc': {
            target: apiOrigin,
            changeOrigin: true,
          },
          '/templates': {
            target: apiOrigin,
            changeOrigin: true,
          },
        },
      },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-router-dom',
          'react-helmet-async',
        ],
      },
    }
  })
}
