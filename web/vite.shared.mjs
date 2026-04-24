import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { getAppDefinition } from './src/erp/config/appRegistry.mjs'

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))

export function createERPViteConfig(appId) {
  const app = getAppDefinition(appId)

  return defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const isProd = mode === 'production'
    const isDev = mode === 'development'

    if (!isProd) {
      console.log(`[vite] erp app=${app.id} command=${command} mode=${mode}`)
    }

    return {
      base: isDev ? '/' : env.VITE_BASE_URL || '/',
      plugins: [react()],
      define: {
        'import.meta.env.VITE_ERP_APP_ID': JSON.stringify(app.id),
      },
      esbuild: {
        drop: isProd ? ['console', 'debugger'] : [],
      },
      reportCompressedSize: false,
      build: {
        outDir: app.kind === 'desktop' ? 'build' : `build/${app.id}`,
        assetsDir: 'assets',
        sourcemap: !isProd,
        minify: 'esbuild',
        cssMinify: 'esbuild',
        target: 'es2018',
        rollupOptions: {
          output: {
            entryFileNames: 'assets/[name].[hash].js',
            chunkFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash].[ext]',
            manualChunks(id) {
              if (id.includes('node_modules')) {
                return 'vendor'
              }
            },
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
        port: app.port,
        strictPort: true,
        open: app.kind === 'desktop',
        proxy: {
          '/rpc': {
            target: 'http://localhost:8200',
            changeOrigin: true,
          },
          '/templates': {
            target: 'http://localhost:8200',
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
