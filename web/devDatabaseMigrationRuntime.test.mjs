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
  createDevDatabaseMigrationRuntime,
  redactDatabaseMigrationDiagnostic,
} from './devDatabaseMigrationRuntime.mjs'

const BACKUP_ID = 'br-yoyoosun-20260729T080000+0800'

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
