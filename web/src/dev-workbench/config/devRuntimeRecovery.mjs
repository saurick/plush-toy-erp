export const DEV_DATABASE_MIGRATION_RECOVERY_MODE = 'database-migration'
export const DEV_DATABASE_MIGRATION_RECOVERY_ROUTE = '/__dev/database-migration'
export const DEV_BACKEND_RECOVERY_ROUTE = '/__dev/'
export const DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL =
  '__PLUSH_DEV_DATABASE_MIGRATION_RECOVERY_ACTIVE__'
export const DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL =
  '__PLUSH_DEV_RUNTIME_RECOVERY_ROUTE__'
export const DEV_RUNTIME_RECOVERY_HEADER = 'x-plush-dev-recovery-route'

export function resolveDevRuntimeRecoveryRoute(reason = '') {
  return ['local_backend_unavailable', 'local_backend_start_failed'].includes(
    reason
  )
    ? DEV_BACKEND_RECOVERY_ROUTE
    : DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
}

export function getDevRuntimeRecoveryRoute(scope = globalThis) {
  return scope?.[DEV_RUNTIME_RECOVERY_ROUTE_GLOBAL] ===
    DEV_BACKEND_RECOVERY_ROUTE
    ? DEV_BACKEND_RECOVERY_ROUTE
    : DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
}

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

const redirectingScopes = new WeakSet()

export function redirectDevRuntimeRecovery(response, scope = globalThis) {
  const route = response.headers?.get(DEV_RUNTIME_RECOVERY_HEADER)
  if (
    response.status !== 503 ||
    ![
      DEV_BACKEND_RECOVERY_ROUTE,
      DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
    ].includes(route) ||
    !scope.location ||
    /^\/__dev(?:\/|$)/u.test(scope.location.pathname) ||
    redirectingScopes.has(scope)
  ) {
    return false
  }
  redirectingScopes.add(scope)
  scope.location.replace(route)
  return true
}
