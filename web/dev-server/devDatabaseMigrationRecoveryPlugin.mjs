import {
  DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL,
  DEV_DATABASE_MIGRATION_RECOVERY_MODE,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_HEADER,
  DEV_RUNTIME_STATUS_API_PATH,
  DEV_RUNTIME_STATUS_SCHEMA,
  normalizeDevRuntimeRecoveryMode,
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

function sendRecoveryBlocked(response) {
  response.statusCode = 503
  setRecoveryHeaders(response)
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader(
    DEV_RUNTIME_RECOVERY_HEADER,
    DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
  )
  response.end(
    JSON.stringify({
      status: 'blocked',
      code: 'dev_runtime_recovery_active',
      message: '本地服务尚未就绪，业务请求暂不可用',
    })
  )
}

export function createDevDatabaseMigrationRecoveryController({
  mode = '',
  apiOrigin = 'http://127.0.0.1:8300',
  runtimeChecks = false,
  fetchImpl = globalThis.fetch,
  verifyReadiness,
} = {}) {
  const normalizedMode = normalizeDevRuntimeRecoveryMode(mode)
  let active = normalizedMode === DEV_DATABASE_MIGRATION_RECOVERY_MODE
  let backendCheck
  let readinessCheck
  const monitorBackend = runtimeChecks && isLoopbackAPIOrigin(apiOrigin)
  const backendOrigin = monitorBackend ? normalizeAPIOrigin(apiOrigin) : ''

  const checkBackendAvailability = async ({ probeRecovery = false } = {}) => {
    if (!monitorBackend || (active && !probeRecovery)) return false
    // Concurrent business requests and recovery reads share a health probe.
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
          return true
        } catch {
          active = true
          return false
        }
      })()
    }
    const currentCheck = backendCheck
    const available = await currentCheck
    if (backendCheck === currentCheck) backendCheck = null
    return available
  }

  const controller = {
    isActive() {
      return active
    },
    markRuntimeReady() {
      active = false
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
          if (pathname === DEV_RUNTIME_STATUS_API_PATH) {
            setRecoveryHeaders(response)
            response.setHeader(
              'content-type',
              'application/json; charset=utf-8'
            )
            // Frontend clients can read availability; detailed diagnostics and
            // recovery actions use the trusted DEV access guard.
            if (request.method !== 'GET') {
              response.statusCode = 405
              response.setHeader('allow', 'GET')
              response.end(JSON.stringify({ status: 'blocked' }))
              return
            }
            if (!readinessCheck) {
              readinessCheck = (async () => {
                const available = await checkBackendAvailability({
                  probeRecovery: true,
                })
                if (
                  active &&
                  available &&
                  typeof verifyReadiness === 'function'
                ) {
                  try {
                    await verifyReadiness()
                    controller.markRuntimeReady()
                  } catch {
                    active = true
                  }
                }
              })()
            }
            const currentCheck = readinessCheck
            await currentCheck
            if (readinessCheck === currentCheck) readinessCheck = null
            response.statusCode = 200
            response.end(
              JSON.stringify({
                schemaVersion: DEV_RUNTIME_STATUS_SCHEMA,
                status: active ? 'blocked' : 'ready',
              })
            )
            return
          }
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
            sendRecoveryBlocked(response)
            return
          }
          // Serve the application at its original URL; the DEV boundary blocks
          // business routes while the migration page remains directly reachable.
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
          {
            tag: 'script',
            attrs: { type: 'module' },
            injectTo: 'head-prepend',
            children:
              'import { installDevRuntimeRecoveryFetch } from "/src/dev-workbench/config/devRuntimeRecovery.mjs"; installDevRuntimeRecoveryFetch(window);',
          },
        ]
      },
    },
  }
}
