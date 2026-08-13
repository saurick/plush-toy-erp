import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFileCallback)
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000
const RUNTIME_WAIT_TIMEOUT_MS = 90 * 1000
export const SHARED_DEV_BACKUP_SOURCE_POLICY =
  'shared-dev-session-read-only'
export const DEV_DATABASE_MIGRATION_SOURCE_FILES = Object.freeze([
  'scripts/local-migration.mjs',
  'scripts/local-migration-workflow.mjs',
  'scripts/local-runtime-preflight-core.mjs',
  'scripts/qa/database-programmability.mjs',
  'scripts/qa/populated-upgrade-preflight.sh',
  'scripts/qa/populated-upgrade-20260714055504.sql',
  'scripts/qa/customer-config-cutover-20260714055825.sql',
  'scripts/qa/operational-fact-lifecycle-20260726173943.sql',
  'scripts/qa/dev-database-migration-operation-store.mjs',
  'deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh',
  'server/Makefile',
  'web/dev-server/devDatabaseMigrationPlugin.mjs',
  'web/dev-server/devDatabaseMigrationRuntime.mjs',
  'web/dev-server/devServerSecurity.mjs',
])

export function redactDatabaseMigrationDiagnostic(value) {
  return String(value || '')
    .replace(
      /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      'postgres://<redacted>@'
    )
    .replace(/\bpassword=[^\s&]+/giu, 'password=<redacted>')
    .replace(
      /\b(?:TRUST_SHARED_DEV_DATABASE|APPLY_DEV_MIGRATIONS|SHARED_DEV_MAINTENANCE_READY):[A-Za-z0-9_-]+/gu,
      '<confirmation-redacted>'
    )
    .replace(/\/(?:Users|home|private|var|tmp)\/[^\s'"]+/gu, '<local-path>')
}

function commandFailure(error, fallback) {
  const output = redactDatabaseMigrationDiagnostic(
    [error?.stdout, error?.stderr, error?.message].filter(Boolean).join('\n')
  )
  const wrapped = new Error(fallback)
  wrapped.diagnostic = output.slice(-6000)
  wrapped.exitCode = error?.code
  return wrapped
}

async function executeCommand(
  command,
  args,
  { cwd, env, timeout = COMMAND_TIMEOUT_MS, maxBuffer = 16 * 1024 * 1024 } = {}
) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      env,
      timeout,
      maxBuffer,
      encoding: 'utf8',
    })
  } catch (error) {
    throw commandFailure(error, `${command} 未完成`)
  }
}

export function parseMigrationStatusOutput(output) {
  const text = String(output || '')
  const target = text.match(/^\[migration\] target=([a-z-]+) (.+)$/mu)
  const status = text.match(
    /^\[migration\] current=(\S+) latest=(\S+) applied=(\d+)\/(\d+) pending=(\d+)$/mu
  )
  const confirmation = text.match(
    /^\[migration\] MIGRATE_TARGET_CONFIRM=(\S+)$/mu
  )
  if (!target || !status) {
    throw new Error('migration status output is incomplete')
  }
  return {
    key: target[1],
    safeTarget: target[2],
    currentVersion: status[1] === 'none' ? '' : status[1],
    latestVersion: status[2] === 'none' ? '' : status[2],
    appliedFiles: Number(status[3]),
    availableFiles: Number(status[4]),
    pendingFiles: Number(status[5]),
    targetConfirmation: confirmation?.[1] || '',
  }
}

export function parseMigrationPlanOutput(output) {
  const text = String(output || '')
  const apply = text.match(/^\[migration\] MIGRATE_CONFIRM=(\S+)$/mu)
  const maintenance = text.match(
    /^\[migration\] MIGRATE_MAINTENANCE_CONFIRM=(\S+)$/mu
  )
  if (
    !/^\[migration\] plan=complete writes=0$/mu.test(text) ||
    !apply ||
    !maintenance
  ) {
    throw new Error('migration plan output is incomplete')
  }
  return {
    applyConfirmation: apply[1],
    maintenanceConfirmation: maintenance[1],
    outputHash: createHash('sha256').update(text).digest('hex'),
  }
}

export function buildSharedDevBackupRehearsalArgs(operationId) {
  return [
    'deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh',
    '--environment',
    'shared-dev',
    '--source-policy',
    SHARED_DEV_BACKUP_SOURCE_POLICY,
    '--release-version',
    `migration-${operationId}`,
    '--backup-purpose',
    'pre-migration',
    '--out',
    'output/dev-workbench/database-migration-backups',
  ]
}

function walkRegularFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relativePath = path.posix.join(relativeDirectory, entry.name)
    const absolutePath = path.join(root, relativePath)
    const stats = lstatSync(absolutePath)
    if (stats.isSymbolicLink()) {
      throw new Error('migration source contains a symbolic link')
    }
    if (stats.isDirectory()) {
      files.push(...walkRegularFiles(root, relativePath))
    } else if (stats.isFile()) {
      files.push(relativePath)
    }
  }
  return files
}

export async function readMigrationSourceIdentity(projectRoot) {
  const root = path.resolve(projectRoot)
  const files = [
    ...DEV_DATABASE_MIGRATION_SOURCE_FILES,
    ...walkRegularFiles(root, 'server/internal/data/model/migrate'),
    ...walkRegularFiles(root, 'server/internal/data/model/schema').filter(
      (file) => file.endsWith('.go')
    ),
  ].sort()
  const hash = createHash('sha256')
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`migration source file is missing: ${relativePath}`)
    }
    hash.update(relativePath)
    hash.update('\0')
    hash.update(readFileSync(absolutePath))
    hash.update('\0')
  }
  const { stdout } = await executeCommand(
    'git',
    ['rev-parse', '--verify', 'HEAD'],
    { cwd: root, timeout: 10_000, maxBuffer: 1024 * 1024 }
  )
  const commit = stdout.trim()
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error('repository commit is unavailable')
  }
  return { commit, fingerprint: hash.digest('hex') }
}

function validateBackupReport(report, expected) {
  const backup = report?.backup
  const restore = report?.restore
  const summary = report?.summary
  const redaction = report?.redaction
  if (
    !report ||
    typeof report !== 'object' ||
    !/^br-yoyoosun-[A-Za-z0-9+_-]+$/u.test(String(report.backupId || '')) ||
    !Number.isSafeInteger(backup?.databaseBackupSize) ||
    backup.databaseBackupSize < 1 ||
    !HASH_PATTERN.test(String(backup?.databaseBackupHash || '')) ||
    redaction?.containsSecrets !== false ||
    redaction?.containsRawCustomerRows !== false ||
    redaction?.containsDumpContent !== false ||
    redaction?.containsFullDsn !== false ||
    summary?.backupCreated !== true ||
    summary?.restoreCompleted !== true ||
    summary?.migrationStatus !== 'ok' ||
    summary?.populatedUpgradeAuditStatus !== 'passed' ||
    summary?.customerConfigCutoverAuditStatus !== 'passed' ||
    summary?.smokeQueryStatus !== 'passed' ||
    restore?.restoreTestStatus !== 'passed-temp-container' ||
    String(restore?.migrationBeforeApply || '') !== expected.currentVersion ||
    String(restore?.restoreMigrationVersion || '') !== expected.latestVersion ||
    String(restore?.pendingFiles || '') !== '0'
  ) {
    throw new Error('backup restore report did not prove the planned upgrade')
  }
  return {
    id: report.backupId,
    sizeBytes: backup.databaseBackupSize,
    sha256: backup.databaseBackupHash,
    restoreVerified: true,
    migrationBefore: restore.migrationBeforeApply,
    migrationAfter: restore.restoreMigrationVersion,
    verifiedAt: new Date(report.verifiedAt).toISOString(),
  }
}

function parseBackupReportPath(stdout, projectRoot) {
  const match = String(stdout || '').match(
    /^\[backup-restore-rehearsal\] ok: (.+\/backup-restore-report\.json)$/mu
  )
  if (!match) throw new Error('backup restore report path is missing')
  const absolutePath = path.resolve(projectRoot, match[1])
  const outputRoot = path.resolve(projectRoot, 'output')
  if (
    absolutePath === outputRoot ||
    !absolutePath.startsWith(`${outputRoot}${path.sep}`)
  ) {
    throw new Error('backup restore report escaped the ignored output root')
  }
  return absolutePath
}

async function readRuntime(apiOrigin) {
  const checks = {}
  for (const [name, expectedBody] of [
    ['health', 'ok'],
    ['ready', 'ready'],
  ]) {
    try {
      const response = await fetch(`${apiOrigin}/${name}z`, {
        signal: AbortSignal.timeout(2500),
        headers: { accept: 'text/plain' },
      })
      const body = response.ok ? (await response.text()).trim() : ''
      const passed = response.ok && body === expectedBody
      checks[name] = {
        status: passed ? 'passed' : 'failed',
        httpCode: response.status,
        expectedBodyMatched: passed,
      }
    } catch {
      checks[name] = {
        status: 'unavailable',
        httpCode: 0,
        expectedBodyMatched: false,
      }
    }
  }
  return {
    health: checks.health,
    ready: checks.ready,
    available:
      checks.health.status === 'passed' && checks.ready.status === 'passed',
  }
}

async function waitForRuntime(apiOrigin, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const runtime = await readRuntime(apiOrigin)
    if (runtime.available) return runtime
    if (child.exitCode !== null) {
      throw new Error('local backend exited before health and ready passed')
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('local backend did not become ready before timeout')
}

function operationLogFile(projectRoot, operationId) {
  const directory = path.join(
    projectRoot,
    'output',
    'dev-workbench',
    'database-migration-runtime'
  )
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return path.join(directory, `${operationId}.log`)
}

export function createDevDatabaseMigrationRuntime(projectRoot, apiOrigin) {
  const root = path.resolve(projectRoot)
  const serverRoot = path.join(root, 'server')
  return {
    async status() {
      const result = await executeCommand('make', ['migrate_status'], {
        cwd: serverRoot,
      })
      return parseMigrationStatusOutput(result.stdout)
    },
    async sourceIdentity() {
      return readMigrationSourceIdentity(root)
    },
    async stopRuntime() {
      await executeCommand('make', ['dev_stop'], {
        cwd: serverRoot,
        timeout: 90_000,
      })
    },
    async plan(targetConfirmation) {
      const result = await executeCommand('make', ['migrate_plan'], {
        cwd: serverRoot,
        env: {
          ...process.env,
          MIGRATE_TARGET_CONFIRM: targetConfirmation,
        },
      })
      return parseMigrationPlanOutput(result.stdout)
    },
    async backup(operationId, expectedTarget) {
      const dsnResult = await executeCommand(
        'go',
        ['run', './cmd/dburl', '-conf', './configs/dev/config.yaml'],
        {
          cwd: serverRoot,
          timeout: 120_000,
          maxBuffer: 1024 * 1024,
        }
      )
      const sourceDsn = dsnResult.stdout.trim()
      if (!/^postgres(?:ql)?:\/\//u.test(sourceDsn)) {
        throw new Error('shared development database URL is unavailable')
      }
      const result = await executeCommand(
        'bash',
        buildSharedDevBackupRehearsalArgs(operationId),
        {
          cwd: root,
          env: { ...process.env, SOURCE_POSTGRES_DSN: sourceDsn },
        }
      )
      const reportPath = parseBackupReportPath(result.stdout, root)
      return validateBackupReport(
        JSON.parse(readFileSync(reportPath, 'utf8')),
        expectedTarget
      )
    },
    async verifyBackup(backup) {
      if (
        !backup ||
        !/^br-yoyoosun-[A-Za-z0-9+_-]+$/u.test(String(backup.id || '')) ||
        !Number.isSafeInteger(backup.sizeBytes) ||
        backup.sizeBytes < 1 ||
        !HASH_PATTERN.test(String(backup.sha256 || '')) ||
        backup.restoreVerified !== true
      ) {
        return false
      }
      const backupFile = path.join(
        root,
        'output',
        'dev-workbench',
        'database-migration-backups',
        backup.id,
        'database.dump'
      )
      if (!existsSync(backupFile)) return false
      const stats = lstatSync(backupFile)
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.size !== backup.sizeBytes
      ) {
        return false
      }
      const hash = createHash('sha256')
      await new Promise((resolve, reject) => {
        createReadStream(backupFile)
          .on('data', (chunk) => hash.update(chunk))
          .once('error', reject)
          .once('end', resolve)
      })
      return hash.digest('hex') === backup.sha256
    },
    async apply(internal) {
      const result = await executeCommand('make', ['migrate_apply'], {
        cwd: serverRoot,
        env: {
          ...process.env,
          MIGRATE_CONFIRM: internal.applyConfirmation,
          MIGRATE_MAINTENANCE_CONFIRM: internal.maintenanceConfirmation,
        },
      })
      if (
        !/^\[migration\] applied_verified .+ pending=0$/mu.test(result.stdout)
      ) {
        throw new Error('migration apply readback is incomplete')
      }
    },
    async runtime() {
      return readRuntime(apiOrigin)
    },
    async restart(operationId) {
      const logFile = operationLogFile(root, operationId)
      const descriptor = openSync(logFile, 'a', 0o600)
      let child
      try {
        child = spawn('make', ['dev_restart'], {
          cwd: serverRoot,
          env: process.env,
          detached: true,
          stdio: ['ignore', descriptor, descriptor],
        })
      } finally {
        closeSync(descriptor)
      }
      child.unref()
      return waitForRuntime(apiOrigin, child, RUNTIME_WAIT_TIMEOUT_MS)
    },
  }
}
