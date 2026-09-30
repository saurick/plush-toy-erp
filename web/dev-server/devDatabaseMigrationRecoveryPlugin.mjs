import {
  DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL,
  DEV_DATABASE_MIGRATION_RECOVERY_MODE,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_BACKEND_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_HEADER,
  DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL,
  normalizeDevRuntimeRecoveryMode,
  resolveDevRuntimeRecoveryRoute,
} from '../src/dev-workbench/config/devRuntimeRecovery.mjs'
import {
  isLoopbackAPIOrigin,
  normalizeAPIOrigin,
} from '../../scripts/local-runtime-preflight-core.mjs'

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

function sendRecoveryBlocked(response, route) {
  response.statusCode = 503
  setRecoveryHeaders(response)
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader(DEV_RUNTIME_RECOVERY_HEADER, route)
  response.end(
    JSON.stringify({
      status: 'blocked',
      code: 'dev_runtime_recovery_active',
      message:
        route === DEV_BACKEND_RECOVERY_ROUTE
          ? '本地后端未就绪，请在效能工作台检查并恢复服务'
          : '数据库恢复尚未完成，普通 ERP 请求暂不可用',
    })
  )
}

export function createDevDatabaseMigrationRecoveryController({
  mode = '',
  reason = '',
  apiOrigin = 'http://127.0.0.1:8300',
  runtimeChecks = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedMode = normalizeDevRuntimeRecoveryMode(mode)
  let active = normalizedMode === DEV_DATABASE_MIGRATION_RECOVERY_MODE
  let recoveryReason = reason
  let backendCheck
  const monitorBackend = runtimeChecks && isLoopbackAPIOrigin(apiOrigin)
  const backendOrigin = monitorBackend ? normalizeAPIOrigin(apiOrigin) : ''

  const recoveryRoute = () => resolveDevRuntimeRecoveryRoute(recoveryReason)
  const checkBackendAvailability = async () => {
    if (!monitorBackend || active) return
    // Concurrent page RPCs share a probe; checks only run on business traffic.
    if (!backendCheck) {
      backendCheck = (async () => {
        try {
          const response = await fetchImpl(`${backendOrigin}/healthz`, {
            signal: AbortSignal.timeout(1500),
            redirect: 'error',
          })
          if (!response.ok || (await response.text()).trim() !== 'ok') {
            throw new Error('local backend unavailable')
          }
        } catch {
          active = true
          recoveryReason = 'local_backend_unavailable'
        }
      })()
    }
    const currentCheck = backendCheck
    await currentCheck
    if (backendCheck === currentCheck) backendCheck = null
  }

  const controller = {
    isActive() {
      return active
    },
    markRuntimeReady() {
      active = false
      recoveryReason = ''
    },
  }

  if (!active && !monitorBackend) {
    return { ...controller, plugin: null }
  }

  return {
    ...controller,
    plugin: {
      name: DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME,
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = requestPath(request)
          const acceptsHtml = String(request.headers?.accept || '').includes(
            'text/html'
          )
          const isBusinessRequest =
            pathname === '/rpc' ||
            pathname.startsWith('/rpc/') ||
            pathname === '/templates' ||
            pathname.startsWith('/templates/')
          const isBusinessDocument =
            request.method === 'GET' &&
            acceptsHtml &&
            !/^\/__dev(?:\/|$)/u.test(pathname)
          if (isBusinessRequest || isBusinessDocument) {
            await checkBackendAvailability()
          }
          if (!active) {
            next()
            return
          }
          if (
            pathname === '/__dev/api/database-migration' ||
            pathname.startsWith('/__dev/api/database-migration/')
          ) {
            next()
            return
          }
          if (isBusinessRequest || pathname.startsWith('/__dev/api/')) {
            sendRecoveryBlocked(response, recoveryRoute())
            return
          }
          const isRecoveryDocument =
            pathname === DEV_DATABASE_MIGRATION_RECOVERY_ROUTE ||
            pathname === `${DEV_DATABASE_MIGRATION_RECOVERY_ROUTE}/` ||
            (recoveryRoute() === DEV_BACKEND_RECOVERY_ROUTE &&
              (pathname === '/__dev' ||
                pathname === DEV_BACKEND_RECOVERY_ROUTE))
          if (request.method === 'GET' && acceptsHtml && !isRecoveryDocument) {
            response.statusCode = 302
            setRecoveryHeaders(response)
            response.setHeader('location', recoveryRoute())
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
            )}] = ${active ? 'true' : 'false'}; window[${JSON.stringify(
              DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL
            )}] = ${JSON.stringify(recoveryRoute())};`,
          },
        ]
      },
    },
  }
}
