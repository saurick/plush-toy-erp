import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEV_DATABASE_MIGRATION_SOURCE_FILES,
  SHARED_DEV_BACKUP_SOURCE_POLICY,
  buildSharedDevBackupRehearsalArgs,
  createDevDatabaseMigrationRuntime,
  redactDatabaseMigrationDiagnostic,
} from './devDatabaseMigrationRuntime.mjs'

const BACKUP_ID = 'br-yoyoosun-20260729T080000+0800'

test('database migration backup binds the narrow shared-dev source policy', () => {
  const args = buildSharedDevBackupRehearsalArgs(
    '019ff53e-e92a-7822-876b-d5702198b7e0'
  )
  assert.equal(SHARED_DEV_BACKUP_SOURCE_POLICY, 'shared-dev-session-read-only')
  assert.deepEqual(args.slice(1, 5), [
    '--environment',
    'shared-dev',
    '--source-policy',
    'shared-dev-session-read-only',
  ])
  assert.deepEqual(args.slice(-4), [
    '--backup-purpose',
    'pre-migration',
    '--out',
    'output/dev-workbench/database-migration-backups',
  ])
})

test('database migration source identity follows the centralized dev server paths', () => {
  assert(
    DEV_DATABASE_MIGRATION_SOURCE_FILES.includes(
      'scripts/local-migration-workflow.mjs'
    )
  )
  assert(
    DEV_DATABASE_MIGRATION_SOURCE_FILES.includes(
      'web/dev-server/devDatabaseMigrationPlugin.mjs'
    )
  )
  assert(
    DEV_DATABASE_MIGRATION_SOURCE_FILES.includes(
      'web/dev-server/devDatabaseMigrationRuntime.mjs'
    )
  )
  assert(
    DEV_DATABASE_MIGRATION_SOURCE_FILES.includes(
      'web/dev-server/devServerSecurity.mjs'
    )
  )
  assert.equal(
    DEV_DATABASE_MIGRATION_SOURCE_FILES.some((file) =>
      /^web\/dev(?:DatabaseMigration|ServerSecurity)/u.test(file)
    ),
    false
  )
})

function createRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-migration-runtime-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('database migration runtime verifies the exact ignored backup file', async (t) => {
  const root = createRoot(t)
  const directory = path.join(
    root,
    'output',
    'dev-workbench',
    'database-migration-backups',
    BACKUP_ID
  )
  mkdirSync(directory, { recursive: true })
  const content = Buffer.from('fixed-backup-content')
  writeFileSync(path.join(directory, 'database.dump'), content)
  const runtime = createDevDatabaseMigrationRuntime(
    root,
    'http://127.0.0.1:8300'
  )
  const backup = {
    id: BACKUP_ID,
    sizeBytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    restoreVerified: true,
  }
  assert.equal(await runtime.verifyBackup(backup), true)
  assert.equal(
    await runtime.verifyBackup({ ...backup, sha256: '0'.repeat(64) }),
    false
  )
})

test('database migration runtime rejects a backup symlink', async (t) => {
  const root = createRoot(t)
  const directory = path.join(
    root,
    'output',
    'dev-workbench',
    'database-migration-backups',
    BACKUP_ID
  )
  mkdirSync(directory, { recursive: true })
  const target = path.join(root, 'outside.dump')
  writeFileSync(target, 'outside')
  symlinkSync(target, path.join(directory, 'database.dump'))
  const runtime = createDevDatabaseMigrationRuntime(
    root,
    'http://127.0.0.1:8300'
  )
  assert.equal(
    await runtime.verifyBackup({
      id: BACKUP_ID,
      sizeBytes: 7,
      sha256: createHash('sha256').update('outside').digest('hex'),
      restoreVerified: true,
    }),
    false
  )
})

test('database migration runtime redacts DSN, confirmations, and local paths', () => {
  const redacted = redactDatabaseMigrationDiagnostic(
    'postgres://user:secret@192.168.0.106:5432/plush_erp ' +
      'APPLY_DEV_MIGRATIONS:abc123 /Users/simon/private.log'
  )
  assert.doesNotMatch(redacted, /secret|abc123|\/Users\/simon/u)
  assert.match(redacted, /postgres:\/\/<redacted>@/u)
  assert.match(redacted, /<confirmation-redacted>/u)
  assert.match(redacted, /<local-path>/u)
})
