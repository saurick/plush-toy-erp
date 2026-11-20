export const DEV_DATABASE_MIGRATION_RECOVERY_MODE = 'database-migration'
export const DEV_DATABASE_MIGRATION_RECOVERY_ROUTE = '/__dev/database-migration'
export const DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL =
  '__PLUSH_DEV_DATABASE_MIGRATION_RECOVERY_ACTIVE__'
export const DEV_RUNTIME_RECOVERY_HEADER = 'x-plush-dev-recovery-route'
export const DEV_RUNTIME_RECOVERY_EVENT = 'plush:dev-runtime-recovery'
export const DEV_RUNTIME_STATUS_API_PATH = '/__dev/api/runtime-status'
export const DEV_RUNTIME_STATUS_KIND = 'plush.dev-runtime-status'

export function normalizeDevRuntimeRecoveryMode(value = '') {
  const normalized = String(value || '').trim()
  if (normalized && normalized !== DEV_DATABASE_MIGRATION_RECOVERY_MODE) {
    throw new Error(`unsupported ERP_DEV_RECOVERY_MODE: ${normalized}`)
  }
  return normalized
}

export function isDevDatabaseMigrationRecoveryActive(scope = globalThis) {
  return scope?.[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] === true
}

const monitoredFetchScopes = new WeakSet()

export function installDevRuntimeRecoveryFetch(scope = globalThis) {
  if (typeof scope?.fetch !== 'function' || monitoredFetchScopes.has(scope)) {
    return false
  }
  const originalFetch = scope.fetch.bind(scope)
  scope.fetch = async (...args) => {
    const response = await originalFetch(...args)
    activateDevRuntimeRecovery(response, scope)
    return response
  }
  monitoredFetchScopes.add(scope)
  return true
}

export function activateDevRuntimeRecovery(response, scope = globalThis) {
  const route = response.headers?.get(DEV_RUNTIME_RECOVERY_HEADER)
  if (
    response.status !== 503 ||
    route !== DEV_DATABASE_MIGRATION_RECOVERY_ROUTE ||
    !scope.location ||
    /^\/__dev(?:\/|$)/u.test(scope.location.pathname) ||
    isDevDatabaseMigrationRecoveryActive(scope)
  ) {
    return false
  }
  scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = true
  scope.dispatchEvent?.(new Event(DEV_RUNTIME_RECOVERY_EVENT))
  return true
}

export function startDevRuntimeRecoveryMonitor(
  onReady,
  { scope = globalThis, intervalMs = 3000 } = {}
) {
  let stopped = false
  let timer
  const controller = new AbortController()
  const check = async () => {
    try {
      const response = await scope.fetch(DEV_RUNTIME_STATUS_API_PATH, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20_000),
        ]),
      })
      const result = response.ok ? await response.json() : null
      if (
        !stopped &&
        result?.kind === DEV_RUNTIME_STATUS_KIND &&
        result.status === 'ready'
      ) {
        stopped = true
        scope[DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL] = false
        onReady()
      }
    } catch {
      // Only the read-only status probe is repeated; business requests are not.
    } finally {
      if (!stopped) timer = scope.setTimeout(check, intervalMs)
    }
  }
  check()
  return () => {
    stopped = true
    scope.clearTimeout(timer)
    controller.abort()
  }
}
