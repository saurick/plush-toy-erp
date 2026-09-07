import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
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
  readDatabaseMigrationToolReadiness,
  redactDatabaseMigrationDiagnostic,
  waitForRuntime,
} from './devDatabaseMigrationRuntime.mjs'

test('database migration runtime handles spawn failure without crashing the workbench', async () => {
  const child = new EventEmitter()
  child.exitCode = null
  await assert.rejects(
    waitForRuntime('http://127.0.0.1:8300', child, 100, {
      read: async () => {
        child.emit('error', new Error('spawn make ENOENT'))
        return { available: false }
      },
      intervalMs: 1,
    }),
    /启动命令不可用/u
  )
  assert.equal(child.listenerCount('error'), 0)
})

test('database migration runtime rejects old healthy responses when the new process has exited', async () => {
  const child = new EventEmitter()
  child.exitCode = 1
  await assert.rejects(
    waitForRuntime('http://127.0.0.1:8300', child, 100, {
      read: async () => ({ available: true }),
      intervalMs: 1,
    }),
    /启动进程已退出/u
  )
})

test('database migration runtime stops waiting when backend health cannot be proved', async () => {
  const child = new EventEmitter()
  child.exitCode = null
  await assert.rejects(
    waitForRuntime('http://127.0.0.1:8300', child, 5, {
      read: async () => ({ available: false }),
      intervalMs: 1,
    }),
    /启动超时/u
  )
})

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
    'postgres://user:secret@192.168.0.133:5432/plush_erp ' +
      'APPLY_DEV_MIGRATIONS:abc123 /Users/simon/private.log'
  )
  assert.doesNotMatch(redacted, /secret|abc123|\/Users\/simon/u)
  assert.match(redacted, /postgres:\/\/<redacted>@/u)
  assert.match(redacted, /<confirmation-redacted>/u)
  assert.match(redacted, /<local-path>/u)
})

test('database migration runtime accepts platform-neutral compatible tooling', async () => {
  const calls = []
  const readiness = await readDatabaseMigrationToolReadiness({
    env: {},
    execFile: async (command, args) => {
      calls.push([command, ...args])
      if (command === 'docker') return { stdout: '28.0.0\n', stderr: '' }
      if (command === 'atlas') {
        return { stdout: 'atlas version v1.2.0\n', stderr: '' }
      }
      if (
        path.basename(command) === 'pg_dump' ||
        path.basename(command) === 'psql'
      ) {
        return {
          stdout: `${path.basename(command)} (PostgreSQL) 18.1\n`,
          stderr: '',
        }
      }
      assert.equal(command, 'bash')
      return { stdout: '', stderr: '' }
    },
  })

  assert.equal(readiness.status, 'ready')
  assert.equal(
    readiness.checks.every((check) => check.status === 'passed'),
    true
  )
  assert.deepEqual(
    calls.map(([command]) => path.basename(command)),
    ['docker', 'atlas', 'pg_dump', 'psql', 'bash']
  )
})

test('database migration runtime requires every supporting command before preparation', async (t) => {
  for (const missing of ['go', 'lockf', 'jq', null]) {
    const root = createRoot(t)
    const bin = path.join(root, 'bin')
    mkdirSync(bin)
    for (const command of [
      'go',
      'lockf',
      'curl',
      'sha256sum',
      'wc',
      'awk',
      'date',
      'jq',
      'python3',
    ]) {
      if (command !== missing) {
        symlinkSync(process.execPath, path.join(bin, command))
      }
    }
    const readiness = await readDatabaseMigrationToolReadiness({
      env: {},
      execFile: async (command, args) => {
        if (command === 'docker') return { stdout: '29.0.0', stderr: '' }
        if (command === 'atlas') {
          return { stdout: 'atlas version v1.2.0', stderr: '' }
        }
        if (
          path.basename(command) === 'pg_dump' ||
          path.basename(command) === 'psql'
        ) {
          return { stdout: 'PostgreSQL) 18.1', stderr: '' }
        }
        assert.equal(command, 'bash')
        return {
          stdout: execFileSync(
            'bash',
            ['-c', `PATH="$MIGRATION_TEST_PATH"\n${args[1]}`],
            {
              env: { ...process.env, MIGRATION_TEST_PATH: bin },
              encoding: 'utf8',
            }
          ),
          stderr: '',
        }
      },
    })
    const check = readiness.checks.find(
      (item) => item.key === 'supporting_commands'
    )
    assert.equal(check.status, missing ? 'blocked' : 'passed', String(missing))
    assert.equal(
      readiness.status,
      missing ? 'blocked' : 'ready',
      String(missing)
    )
  }
})

test('database migration runtime identifies an unavailable container daemon without naming one desktop product', async () => {
  const readiness = await readDatabaseMigrationToolReadiness({
    env: {},
    execFile: async (command) => {
      if (command === 'docker') throw new Error('daemon unavailable')
      if (command === 'atlas') return { stdout: 'atlas version v1.2.0\n' }
      if (
        path.basename(command) === 'pg_dump' ||
        path.basename(command) === 'psql'
      ) {
        return { stdout: `${path.basename(command)} (PostgreSQL) 18.1\n` }
      }
      return { stdout: '' }
    },
  })

  assert.equal(readiness.status, 'blocked')
  const container = readiness.checks.find(
    (check) => check.key === 'container_runtime'
  )
  assert.equal(container.status, 'blocked')
  assert.match(container.message, /Docker-compatible/u)
  assert.match(
    container.message,
    /Docker Engine.*Docker Desktop.*Colima.*Rancher.*OrbStack.*Podman/u
  )
})
