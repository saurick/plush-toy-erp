import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { createDevDocsMetadataPlugin } from './vite.docs.mjs'
import { getAppDefinition } from './src/erp/config/appRegistry.mjs'
import { normalizeDevRuntimeRecoveryMode } from './src/dev-workbench/config/devRuntimeRecovery.mjs'
import { loadDevPorts } from '../scripts/dev-ports.mjs'
import { normalizeAPIOrigin } from '../scripts/local-runtime-preflight-core.mjs'
import {
  isCodexDevSession,
  resolveERPDevServerPort as resolvePort,
  resolveERPHMRClientPort,
  selectWebDevPort,
} from './scripts/localPort.mjs'

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(ROOT_DIR, '..')
const devPorts = loadDevPorts(PROJECT_ROOT)
const DEV_HOST = '127.0.0.1'
const DEV_WORKBENCH_PLUGIN_MODULE = new URL(
  './dev-server/devWorkbenchPlugins.mjs',
  import.meta.url
).href

export function resolveERPDevServerPort(rawPort, ports = devPorts) {
  return resolvePort(rawPort, ports)
}

export { resolveERPHMRClientPort }

export function assertERPResolvedVitePorts({ hmrClientPort, serverPort } = {}) {
  if (
    !Number.isInteger(serverPort) ||
    !Number.isInteger(hmrClientPort) ||
    hmrClientPort !== serverPort
  ) {
    throw new Error(
      `resolved Vite listener ${String(serverPort)} and HMR client ${String(hmrClientPort)} must match; set ERP_VITE_PORT and ERP_VITE_HMR_CLIENT_PORT to the same port instead of overriding only --port`
    )
  }
}

export function resolveERPViteCacheDir(rootDir, appId, mode, serverPort) {
  if (mode === 'development') {
    return resolve(rootDir, '.vite-cache', appId, String(serverPort))
  }
  return resolve(rootDir, 'build', '.vite-cache', appId)
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

const createDevResolvedPortGuard = (serverPort) => ({
  name: 'plush-dev-resolved-port-guard',
  apply: 'serve',
  configResolved(config) {
    const resolvedServerPort = config.server.port
    if (resolvedServerPort !== serverPort) {
      throw new Error(
        `resolved Vite listener ${String(resolvedServerPort)} must match configured ERP_VITE_PORT=${serverPort}; set ERP_VITE_PORT instead of overriding only --port`
      )
    }
    const resolvedHmrClientPort =
      typeof config.server.hmr === 'object' &&
      Number.isInteger(config.server.hmr.clientPort)
        ? config.server.hmr.clientPort
        : resolvedServerPort
    assertERPResolvedVitePorts({
      serverPort: resolvedServerPort,
      hmrClientPort: resolvedHmrClientPort,
    })
  },
})

const createDevBrowserPolicy = (suppressBrowserOpen) => ({
  name: 'plush-dev-browser-policy',
  apply: 'serve',
  configResolved(config) {
    if (!suppressBrowserOpen) return
    // CLI 和 inline config 会覆盖初始值，自动化开页边界须约束最终配置。
    config.server.open = false
    config.preview.open = false
  },
})

const createDevLinkedDependencyAssets = () => ({
  name: 'plush-dev-linked-dependency-assets',
  apply: 'serve',
  configResolved(config) {
    // 隔离源码副本可链接已安装依赖；字体等静态资源仍受 Vite 的 strict / deny 规则保护。
    const dependencies = [
      resolve(config.root, 'node_modules'),
      resolve(config.root, '../node_modules'),
    ].filter(existsSync).map((directory) => realpathSync(directory))
    config.server.fs.allow = [...new Set([
      ...config.server.fs.allow,
      ...dependencies,
    ])]
  },
})

const createDevArchiveMarkdownAssets = () => ({
  name: 'plush-dev-archive-markdown-assets',
  apply: 'serve',
  configResolved(config) {
    const directory = resolve(PROJECT_ROOT, 'docs/archive')
    if (!existsSync(directory) || realpathSync(directory) !== directory) return
    // Lazy imports need admission before Vite has transformed the source module.
    // Keep access scoped to the product's archive; Vite's deny rules still apply.
    config.server.fs.allow = [...new Set([...config.server.fs.allow, directory])]
  },
})

export function createERPViteConfig(appId) {
  const app = getAppDefinition(appId)
  const apiOrigin = normalizeAPIOrigin(
    process.env.API_ORIGIN || `http://127.0.0.1:${devPorts.http}`
  )
  const recoveryMode = normalizeDevRuntimeRecoveryMode(
    process.env.ERP_DEV_RECOVERY_MODE
  )

  return defineConfig(async ({ command, mode }) => {
    const serverPort =
      command === 'serve'
        ? await selectWebDevPort({ ports: devPorts })
        : resolveERPDevServerPort(process.env.ERP_VITE_PORT)
    // 直接运行 Vite 时也固定本进程选中的辅助端口，配置热重载不能再次换端口。
    if (
      command === 'serve' &&
      isCodexDevSession() &&
      !process.env.ERP_VITE_PORT
    ) {
      process.env.ERP_VITE_PORT = String(serverPort)
    }
    const hmrClientPort = process.env.ERP_VITE_HMR_CLIENT_PORT?.trim()
      ? resolveERPHMRClientPort(
          process.env.ERP_VITE_HMR_CLIENT_PORT,
          serverPort
        )
      : undefined
    const env = loadEnv(mode, process.cwd(), '')
    const isProd = mode === 'production'
    const isDev = mode === 'development'
    const suppressBrowserOpen =
      isCodexDevSession() ||
      ['1', 'true'].includes(process.env.CI) ||
      process.env.NODE_ENV === 'test' ||
      Boolean(process.env.NODE_TEST_CONTEXT)

    if (!isProd) {
      console.log(`[vite] erp app=${app.id} command=${command} mode=${mode}`)
    }

    const devWorkbenchModule =
      isDev && command === 'serve'
        ? await import(DEV_WORKBENCH_PLUGIN_MODULE)
        : null
    const workbenchHttpsOrigin = devWorkbenchModule
      ? devWorkbenchModule.normalizeDevHttpsOrigin(env.PLUSH_DEV_HTTPS_ORIGIN)
      : ''
    const devWorkbenchServePlugins =
      devWorkbenchModule
        ? devWorkbenchModule.createDevWorkbenchServePlugins({
            apiOrigin,
            command,
            devCustomerKey: process.env.ERP_DEV_CUSTOMER_KEY || '',
            mode,
            projectRoot: PROJECT_ROOT,
            recoveryMode,
            recoveryReason: process.env.ERP_DEV_RECOVERY_REASON || '',
            runtimeChecks: process.env.ERP_DEV_RUNTIME_CHECKS === '1',
            workbenchAccess: env.PLUSH_DEV_WORKBENCH_ACCESS,
            workbenchHttpsOrigin,
          })
        : []

    return {
      base: isDev ? '/' : env.VITE_BASE_URL || '/',
      plugins: [
        createDevBrowserPolicy(suppressBrowserOpen),
        // 本机开发统一用 IPv4 origin，避免 localhost 解析或代理链路导致源模块加载抖动。
        isDev ? createDevLocalhostOriginNormalizer(serverPort) : null,
        isDev ? createDevResolvedPortGuard(serverPort) : null,
        isDev ? createDevLinkedDependencyAssets() : null,
        isDev ? createDevArchiveMarkdownAssets() : null,
        isDev ? createDevDocsMetadataPlugin() : null,
        react(),
        ...devWorkbenchServePlugins,
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
      cacheDir: resolveERPViteCacheDir(ROOT_DIR, app.id, mode, serverPort),
      server: {
        host: '0.0.0.0',
        allowedHosts: workbenchHttpsOrigin
          ? [new URL(workbenchHttpsOrigin).hostname]
          : [],
        port: serverPort,
        strictPort: true,
        // 自动化页面由会话浏览器工具管理，避免系统 opener 留下无法归属的标签。
        open: suppressBrowserOpen ? false : createDevOrigin(serverPort),
        // 默认跟随浏览器加载模块的地址，让远程访问和端口转发共用同源 HMR。
        hmr: {
          host: process.env.ERP_VITE_HMR_HOST?.trim() || undefined,
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
