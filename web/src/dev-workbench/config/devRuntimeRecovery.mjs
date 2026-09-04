export const DEV_DATABASE_MIGRATION_RECOVERY_MODE = 'database-migration'
export const DEV_DATABASE_MIGRATION_RECOVERY_ROUTE = '/__dev/database-migration'
export const DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL =
  '__PLUSH_DEV_DATABASE_MIGRATION_RECOVERY_ACTIVE__'

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
