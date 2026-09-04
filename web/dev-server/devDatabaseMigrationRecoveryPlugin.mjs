import {
  DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL,
  DEV_DATABASE_MIGRATION_RECOVERY_MODE,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  normalizeDevRuntimeRecoveryMode,
} from '../src/dev-workbench/config/devRuntimeRecovery.mjs'

export const DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME =
  'plush-dev-database-migration-recovery'

function requestPath(request) {
  try {
    return new URL(request.url || '/', 'http://localhost').pathname
  } catch {
    return ''
  }
}

function setRecoveryHeaders(response) {
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
}

function sendRecoveryBlocked(response) {
  response.statusCode = 503
  setRecoveryHeaders(response)
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(
    JSON.stringify({
      status: 'blocked',
      code: 'dev_runtime_recovery_active',
      message: '数据库恢复尚未完成，普通 ERP 请求暂不可用',
    })
  )
}

export function createDevDatabaseMigrationRecoveryController({
  mode = '',
} = {}) {
  const normalizedMode = normalizeDevRuntimeRecoveryMode(mode)
  let active = normalizedMode === DEV_DATABASE_MIGRATION_RECOVERY_MODE

  const controller = {
    isActive() {
      return active
    },
    markRuntimeReady() {
      active = false
    },
  }

  if (!active) {
    return { ...controller, plugin: null }
  }

  return {
    ...controller,
    plugin: {
      name: DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME,
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!active) {
            next()
            return
          }
          const pathname = requestPath(request)
          if (
            pathname === '/__dev/api/database-migration' ||
            pathname.startsWith('/__dev/api/database-migration/')
          ) {
            next()
            return
          }
          if (
            pathname === '/rpc' ||
            pathname.startsWith('/rpc/') ||
            pathname === '/templates' ||
            pathname.startsWith('/templates/') ||
            pathname.startsWith('/__dev/api/')
          ) {
            sendRecoveryBlocked(response)
            return
          }
          const acceptsHtml = String(request.headers?.accept || '').includes(
            'text/html'
          )
          const isRecoveryDocument =
            pathname === DEV_DATABASE_MIGRATION_RECOVERY_ROUTE ||
            pathname === `${DEV_DATABASE_MIGRATION_RECOVERY_ROUTE}/`
          if (request.method === 'GET' && acceptsHtml && !isRecoveryDocument) {
            response.statusCode = 302
            setRecoveryHeaders(response)
            response.setHeader(
              'location',
              DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
            )
            response.end()
            return
          }
          next()
        })
      },
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `window[${JSON.stringify(
              DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL
            )}] = ${active ? 'true' : 'false'};`,
          },
        ]
      },
    },
  }
}
