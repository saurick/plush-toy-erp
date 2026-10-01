import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { stopRuntimeListeners } from '../../scripts/local-runtime-control.mjs'
import { migrationAuditPaths } from '../../scripts/local-migration.mjs'
import {
  buildRuntimeBundle,
  readRuntimeSource,
  readRuntimeBundle,
  runtimeServerVersion,
  assertRuntimeEnvironment,
  readActiveRuntimeBundle,
  activateRuntimeBundle,
  verifyBundleDatabase,
  verifyRuntimeBackup,
  verifyLocalRuntimeIdentity,
} from '../../scripts/local-runtime-bundle.mjs'
import {
  configuredDatabaseURL,
  readLocalDatabaseRoles,
  verifyAuditRole,
  setLocalDatabaseMaintenance,
} from '../../scripts/local-database-roles.mjs'
import { verifyRuntimeBusiness } from '../../scripts/local-runtime-rehearsal.mjs'
import { presentRuntimeConsole } from '../../scripts/local-runtime-console.mjs'
import {
  LOCAL_RUNTIME_PREFLIGHT_TIMEOUT_MS,
  runWebRuntimePreflight,
} from '../../scripts/local-runtime-preflight.mjs'

const execFileAsync = promisify(execFileCallback)
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000
const RUNTIME_WAIT_TIMEOUT_MS = 90 * 1000
export const SHARED_DEV_BACKUP_SOURCE_POLICY = 'shared-dev-dedicated-backup'
export const DEV_DATABASE_MIGRATION_SOURCE_FILES = Object.freeze([
  'scripts/local-migration.mjs',
  'scripts/local-migration-workflow.mjs',
  'scripts/local-runtime-preflight-core.mjs',
  'scripts/local-runtime-preflight.mjs',
  'scripts/local-runtime-console.mjs',
  'scripts/qa/migration-contracts.mjs',
  'scripts/qa/database-programmability.mjs',
  'scripts/qa/populated-upgrade-preflight.sh',
  'scripts/qa/populated-upgrade-20260714055504.sql',
  'scripts/qa/customer-config-cutover-20260714055825.sql',
  'scripts/qa/operational-fact-lifecycle-20260726173943.sql',
  'scripts/qa/dev-database-migration-operation-store.mjs',
  'deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh',
  'server/Makefile',
  'web/dev-server/devDatabaseMigrationPlugin.mjs',
  'web/dev-server/devDatabaseMigrationRecoveryPlugin.mjs',
  'web/dev-server/devDatabaseMigrationRuntime.mjs',
  'web/dev-server/devServerSecurity.mjs',
])

const MIGRATION_TOOL_CHECKS = Object.freeze([
  {
    key: 'container_runtime',
    label: '容器运行环境',
    blockedMessage:
      '未检测到可用的 Docker-compatible 容器守护进程；可使用 Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack，或配置兼容 docker CLI/socket 的 Podman',
  },
  {
    key: 'atlas',
    label: 'Atlas',
    blockedMessage: 'Atlas CLI 未安装或版本不是项目固定的 v1.3.0',
  },
  {
    key: 'postgresql_client',
    label: 'PostgreSQL 客户端',
    blockedMessage: 'PostgreSQL 18 的 pg_dump / psql 客户端未就绪',
  },
  {
    key: 'supporting_commands',
    label: '基础命令',
    blockedMessage:
      '备份恢复所需基础命令未就绪（Go、lockf、Bash 4+、curl、jq、Python 3、sha256sum 等）',
  },
])

function resolvePostgresCommand(name, env) {
  const override = name === 'pg_dump' ? env.PG_DUMP_BIN : env.PSQL_BIN
  if (String(override || '').trim()) return String(override).trim()
  const homebrew = `/opt/homebrew/opt/postgresql@18/bin/${name}`
  return existsSync(homebrew) ? homebrew : name
}

async function probeTool(executor, command, args, env, accepts) {
  try {
    const result = await executor(command, args, {
      env,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    })
    return accepts(`${result.stdout || ''}\n${result.stderr || ''}`)
  } catch {
    return false
  }
}

export async function readDatabaseMigrationToolReadiness({
  execFile = execFileAsync,
  env = process.env,
} = {}) {
  const pgDump = resolvePostgresCommand('pg_dump', env)
  const psql = resolvePostgresCommand('psql', env)
  const [containerReady, atlasReady, pgDumpReady, psqlReady, supportReady] =
    await Promise.all([
      probeTool(
        execFile,
        'docker',
        ['info', '--format', '{{.ServerVersion}}'],
        env,
        (output) => output.trim().length > 0
      ),
      probeTool(execFile, 'atlas', ['version'], env, (output) =>
        /(?:^|\s)v1\.3\.0(?:\s|$)/u.test(output)
      ),
      probeTool(execFile, pgDump, ['--version'], env, (output) =>
        /PostgreSQL\) 18\./u.test(output)
      ),
      probeTool(execFile, psql, ['--version'], env, (output) =>
        /PostgreSQL\) 18\./u.test(output)
      ),
      probeTool(
        execFile,
        'bash',
        [
          '-c',
          'type mapfile >/dev/null 2>&1 || exit 1; for tool in go lockf curl sha256sum wc awk date jq python3; do command -v "$tool" >/dev/null 2>&1 || exit 1; done',
        ],
        env,
        () => true
      ),
    ])
  const passed = [
    containerReady,
    atlasReady,
    pgDumpReady && psqlReady,
    supportReady,
  ]
  const checks = MIGRATION_TOOL_CHECKS.map((definition, index) => ({
    key: definition.key,
    label: definition.label,
    status: passed[index] ? 'passed' : 'blocked',
    message: passed[index] ? '已就绪' : definition.blockedMessage,
  }))
  return {
    schemaVersion: 'plush.dev-database-migration-tools/v1',
    status: checks.every((check) => check.status === 'passed')
      ? 'ready'
      : 'blocked',
    checks,
  }
}

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

export async function executeCommand(
  command,
  args,
  {
    cwd,
    env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    timeout = COMMAND_TIMEOUT_MS,
    maxBuffer = 16 * 1024 * 1024,
    onStdout,
    killGraceMs = 1000,
    signal,
  } = {}
) {
  signal?.throwIfAborted()
  let child
  let timer
  let timedOut = false
  let cancelled = false
  let onAbort
  const outputFailure = { error: null }
  let cleanup
  const signalGroup = async (signal) => {
    if (!child?.pid) return
    try {
      if (process.platform === 'win32') {
        await execFileAsync(
          'taskkill',
          ['/pid', String(child.pid), '/T', '/F'],
          { timeout: 5000 }
        )
      } else process.kill(-child.pid, signal)
    } catch (error) {
      if (
        error.code !== 'ESRCH' &&
        !(process.platform === 'win32' && error.code === 128)
      ) {
        throw error
      }
    }
  }
  const stop = () => {
    cleanup ||= (async () => {
      await signalGroup('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, killGraceMs))
      await signalGroup('SIGKILL')
    })()
    return cleanup
  }
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const output = { stdout: '', stderr: '' }
      for (const stream of ['stdout', 'stderr']) {
        let bytes = 0
        child[stream].setEncoding('utf8')
        child[stream].on('data', (chunk) => {
          if (outputFailure.error) return
          bytes += Buffer.byteLength(chunk)
          if (bytes > maxBuffer) {
            outputFailure.error = new Error('迁移命令输出超过限制')
            stop().catch(reject)
            return
          }
          output[stream] += chunk
          try {
            if (stream === 'stdout') onStdout?.(chunk)
          } catch (error) {
            outputFailure.error = error
            stop().catch(reject)
          }
        })
      }
      child.once('error', (error) => resolve({ error, ...output }))
      child.once('close', (code, signal) => {
        const error =
          code === 0
            ? null
            : Object.assign(new Error(`${command} exited: ${code ?? signal}`), {
                code,
              })
        resolve({ error, ...output })
      })
      timer = setTimeout(() => {
        timedOut = true
        stop().catch(reject)
      }, timeout)
      onAbort = () => {
        cancelled = true
        stop().catch(reject)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
    clearTimeout(timer)
    // A shell can exit while its children survive and still hold output pipes.
    if (result.error || timedOut || cancelled || outputFailure.error) {
      await stop()
    }
    if (cancelled) {
      const error = new Error('本次命令已取消，已停止本次命令及其子进程')
      error.code = 'command_cancelled'
      throw error
    }
    if (timedOut) {
      const error = new Error('迁移命令超时，已停止本次命令及其子进程')
      error.code = 'migration_command_timeout'
      error.stdout = result.stdout
      error.stderr = result.stderr
      throw error
    }
    if (outputFailure.error) throw outputFailure.error
    if (result.error) {
      throw Object.assign(result.error, {
        stdout: result.stdout,
        stderr: result.stderr,
      })
    }
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = commandFailure(error, `${command} 未完成`)
    if (
      ['migration_command_timeout', 'command_cancelled'].includes(error.code)
    ) {
      failure.code = error.code
    }
    throw failure
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}

export function createBackupProgressReporter(onProgress) {
  const messages = new Map([
    ['starting restore container', '正在启动隔离恢复环境'],
    ['restoring dump into isolated container', '正在将备份恢复到隔离数据库'],
    ['validating migration directory', '正在校验迁移文件'],
    [
      'reading pre-apply migration status against restored DB',
      '正在核对恢复库的迁移状态',
    ],
    ['auditing populated upgrade boundaries', '正在检查恢复库的存量升级条件'],
    ['auditing customer config cutover boundaries', '正在检查恢复库的客户配置'],
    ['auditing database constraint boundaries', '正在检查恢复库的数据约束'],
    ['running tx-mode=all dry-run', '正在隔离数据库预演迁移及事务回滚'],
    ['applying migrations against restored DB', '正在隔离数据库验证升级'],
    [
      'running post-apply migration status against restored DB',
      '正在读回隔离升级结果并核对恢复证据',
    ],
  ])
  let pending = ''
  return (chunk) => {
    pending += String(chunk)
    const lines = pending.split(/\r?\n/u)
    pending = (lines.pop() || '').slice(-1024)
    for (const line of lines) {
      const step = line.replace(/^\[backup-restore-rehearsal\] /u, '')
      const message = messages.get(step)
      if (line.startsWith('[backup-restore-rehearsal] ') && message) {
        onProgress(message)
      }
    }
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
    '--release-id',
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
    ...migrationAuditPaths(
      path.join(root, 'server/internal/data/model/migrate')
    ),
    ...walkRegularFiles(root, 'server/internal/data/model/migrate'),
    ...walkRegularFiles(root, 'server/internal/data/model/schema').filter(
      (file) => file.endsWith('.go')
    ),
  ].sort()
  const hash = createHash('sha256')
  hash.update((await readRuntimeSource(root)).fingerprint)
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
    (restore.businessRowsBeforeUpgrade !== undefined &&
      (!Number.isSafeInteger(restore.businessRowsBeforeUpgrade) ||
        restore.businessRowsBeforeUpgrade < 0)) ||
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
    businessRowsBeforeUpgrade: restore.businessRowsBeforeUpgrade,
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
        redirect: 'manual',
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

export async function waitForRuntime(
  apiOrigin,
  child,
  timeoutMs,
  {
    read = readRuntime,
    intervalMs = 1000,
    onProgress = () => {},
    clock = Date.now,
  } = {}
) {
  const startedAt = clock()
  const deadline = startedAt + timeoutMs
  let lastState = ''
  let lastReportAt = -Infinity
  const checkState = (check) =>
    check?.status === 'passed'
      ? '通过'
      : check?.httpCode
        ? `HTTP ${check.httpCode}`
        : '尚未连接'
  let spawnError
  const onError = (error) => {
    spawnError = error
  }
  child.once('error', onError)
  try {
    while (clock() < deadline) {
      const runtime = await read(apiOrigin)
      if (spawnError) {
        throw new Error('本地后端启动命令不可用；请检查固定二进制和执行权限')
      }
      if (child.exitCode !== null || child.signalCode) {
        throw new Error(
          `本地后端启动进程已退出（${child.signalCode ? `信号=${child.signalCode}` : `退出码=${child.exitCode}`}）；请查看本次启动日志并重新检查`
        )
      }
      const elapsed = clock() - startedAt
      if (runtime.available) {
        onProgress(
          `health / ready 均通过；启动就绪耗时 ${(elapsed / 1000).toFixed(1)} 秒`
        )
        return runtime
      }
      const state = `health=${checkState(runtime.health)} ready=${checkState(runtime.ready)}`
      if (state !== lastState || elapsed - lastReportAt >= 10_000) {
        onProgress(
          `等待本地后端就绪：${state}；已等待 ${(elapsed / 1000).toFixed(1)} 秒（最多 ${timeoutMs / 1000} 秒）`
        )
        lastReportAt = elapsed
        lastState = state
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new Error(
      `本地后端启动超时；${lastState}；请查看本次启动日志并重新检查`
    )
  } finally {
    child.removeListener('error', onError)
  }
}

export function readRuntimeStartupDiagnostic(logFile, logStartOffset = 0) {
  const descriptor = openSync(logFile, 'r')
  try {
    const { size } = fstatSync(descriptor)
    const start = Math.max(logStartOffset, size - 16 * 1024)
    const buffer = Buffer.alloc(size - start)
    readSync(descriptor, buffer, 0, buffer.length, start)
    let text = buffer.toString('utf8')
    if (start > logStartOffset) {
      const newline = text.indexOf('\n')
      text = newline === -1 ? '' : text.slice(newline + 1)
    }
    const lines = text.split('\n').filter((line) => {
      if (!line.trim()) return false
      try {
        return JSON.parse(line).level !== 'DEBUG'
      } catch {
        return true
      }
    })
    return redactDatabaseMigrationDiagnostic(lines.slice(-20).join('\n')).slice(
      -6000
    )
  } finally {
    closeSync(descriptor)
  }
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

export function createDevDatabaseMigrationRuntime(
  projectRoot,
  apiOrigin,
  { openConsole = true } = {}
) {
  const root = path.resolve(projectRoot)
  const serverRoot = path.join(root, 'server')
  let cachedToolReadiness = null
  let cachedToolReadinessUntil = 0
  return {
    async workspaceCheck() {
      try {
        await executeCommand('make', ['migrate_check'], {
          cwd: serverRoot,
          timeout: 60_000,
        })
      } catch (error) {
        error.code = 'migration_workspace_check_failed'
        throw error
      }
    },
    async toolReadiness() {
      if (cachedToolReadiness && Date.now() < cachedToolReadinessUntil) {
        return cachedToolReadiness
      }
      cachedToolReadiness = await readDatabaseMigrationToolReadiness()
      cachedToolReadinessUntil = Date.now() + 15_000
      return cachedToolReadiness
    },
    async status() {
      const result = await executeCommand('make', ['migrate_status'], {
        cwd: serverRoot,
        timeout: 30_000,
      })
      return parseMigrationStatusOutput(result.stdout)
    },
    async sourceIdentity() {
      return readMigrationSourceIdentity(root)
    },
    async stopRuntime(operationId) {
      await stopRuntimeListeners(root, operationId, { execute: executeCommand })
    },
    async audit() {
      await executeCommand(
        process.execPath,
        [path.join(root, 'scripts/local-migration.mjs'), 'audit'],
        { cwd: root, timeout: 120_000 }
      )
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
    async backup(operationId, expectedTarget, onProgress = () => {}) {
      const configured = await configuredDatabaseURL(root)
      const roles = readLocalDatabaseRoles(root, configured)
      await verifyAuditRole(roles.audit)
      const sourceDsn = roles.audit
      let bundle
      const manifest = path.join(
        root,
        'output/dev-workbench/runtime-bundles',
        operationId,
        'manifest.json'
      )
      if (existsSync(manifest)) bundle = readRuntimeBundle(root, operationId)
      else {
        bundle = await buildRuntimeBundle(
          root,
          operationId,
          executeCommand,
          onProgress
        )
      }
      if (!/^postgres(?:ql)?:\/\//u.test(sourceDsn)) {
        throw new Error('shared development database URL is unavailable')
      }
      assertRuntimeEnvironment(
        JSON.parse(
          readFileSync(
            path.join(bundle.directory, 'runtime/environment.json'),
            'utf8'
          )
        )
      )
      onProgress('正在备份共享开发库，源库连接只读')
      const result = await executeCommand(
        'bash',
        [
          ...buildSharedDevBackupRehearsalArgs(operationId),
          '--runtime-bundle',
          bundle.id,
        ],
        {
          cwd: root,
          env: { ...process.env, SOURCE_POSTGRES_DSN: sourceDsn },
          onStdout: createBackupProgressReporter(onProgress),
        }
      )
      const reportPath = parseBackupReportPath(result.stdout, root)
      const backup = validateBackupReport(
        JSON.parse(readFileSync(reportPath, 'utf8')),
        expectedTarget
      )
      const proof = JSON.parse(
        readFileSync(
          path.join(path.dirname(reportPath), 'candidate-runtime-proof.json'),
          'utf8'
        )
      )
      if (
        proof.artifactHash !== bundle.artifactHash ||
        proof.migrationVersion !== expectedTarget.latestVersion ||
        proof.populatedRestore !== true ||
        proof.attachmentsRestored !== true ||
        proof.health !== true ||
        proof.ready !== true ||
        proof.business !== true
      ) {
        throw new Error('候选版本未通过带数据升级和业务验证')
      }
      return { ...backup, bundleId: bundle.id, candidate: proof }
    },
    async verifyBackup(backup) {
      return verifyRuntimeBackup(root, backup)
    },
    async apply(internal) {
      const result = await executeCommand('make', ['migrate_apply'], {
        cwd: serverRoot,
        env: {
          ...process.env,
          MIGRATE_CONFIRM: internal.applyConfirmation,
          LOCAL_MIGRATION_OPERATION_ID: internal.operationId,
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
      const runtime = await readRuntime(apiOrigin)
      const active = readActiveRuntimeBundle(root)
      if (active && runtime.available) {
        await verifyLocalRuntimeIdentity(active, apiOrigin)
      }
      return {
        ...runtime,
        activeVersion: active?.migrationVersion || '',
        bundleId: active?.id || '',
      }
    },
    async maintenance(enabled) {
      await setLocalDatabaseMaintenance(root, enabled)
    },
    async restorePrevious(operationId, options) {
      const active = readActiveRuntimeBundle(root)
      if (!active) return null
      return this.restart(operationId, active.id, options)
    },
    async verifyReadiness() {
      await runWebRuntimePreflight(
        { apiOrigin },
        {
          signal: AbortSignal.timeout(LOCAL_RUNTIME_PREFLIGHT_TIMEOUT_MS),
          writeLine: () => {},
        }
      )
    },
    async restart(
      operationId,
      bundleId,
      { startSource = '迁移恢复', onProgress = () => {} } = {}
    ) {
      const startupStartedAt = Date.now()
      const selected = bundleId || readActiveRuntimeBundle(root)?.id
      if (!selected) {
        throw new Error('没有验证通过的固定运行版本；请先检查并准备')
      }
      const bundle = readRuntimeBundle(root, selected)
      const environmentFile = path.join(
        bundle.directory,
        'runtime/environment.json'
      )
      const fixedEnvironment = existsSync(environmentFile)
        ? JSON.parse(readFileSync(environmentFile, 'utf8'))
        : {}
      assertRuntimeEnvironment(fixedEnvironment)
      const configured = await configuredDatabaseURL(root)
      const roles = readLocalDatabaseRoles(root, configured)
      // Stop the previous process before health checks can accept its response.
      onProgress('正在核对候选制品与当前数据库兼容性；原后端继续运行')
      await verifyBundleDatabase(root, bundle, roles.audit)
      await setLocalDatabaseMaintenance(root, false)
      onProgress('数据库兼容性核对通过；正在停止本工作区旧后端并释放登记端口')
      await stopRuntimeListeners(root, operationId, { execute: executeCommand })
      let child
      let logFile
      let logStartOffset = 0
      try {
        logFile = operationLogFile(root, operationId)
        const descriptor = openSync(logFile, 'a', 0o600)
        logStartOffset = fstatSync(descriptor).size
        const startedAt = new Date().toISOString()
        try {
          child = spawn(path.join(bundle.directory, 'runtime/server'), [], {
            cwd: path.join(bundle.directory, 'source/server'),
            env: {
              ...process.env,
              ...fixedEnvironment,
              PLUSH_GITLAB_READ_TOKEN: '',
              PLUSH_GITLAB_TOKEN: '',
              GIT_OPTIONAL_LOCKS: '0',
              GIT_SHA: runtimeServerVersion(bundle),
              POSTGRES_DSN: roles.app,
              ERP_CUSTOMER_KEY: fixedEnvironment.ERP_CUSTOMER_KEY || 'yoyoosun',
              ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG: '1',
            },
            detached: true,
            stdio: ['ignore', descriptor, descriptor],
          })
        } finally {
          closeSync(descriptor)
        }
        child.unref()
        onProgress(
          `已启动候选进程 PID=${child.pid}；地址=${apiOrigin}；启动来源=${startSource}`
        )
        onProgress(`本次启动日志：${logFile}`)
        const runtime = await waitForRuntime(
          apiOrigin,
          child,
          RUNTIME_WAIT_TIMEOUT_MS,
          { onProgress }
        )
        onProgress('正在核对 HTTP 响应的运行版本与候选二进制身份')
        await verifyLocalRuntimeIdentity(bundle, apiOrigin)
        onProgress('运行版本核对通过；正在验证登录与业务入口')
        await verifyRuntimeBusiness(apiOrigin, {
          username: fixedEnvironment.APP_ADMIN_USERNAME,
          password: fixedEnvironment.APP_ADMIN_PASSWORD,
          customerKey: fixedEnvironment.ERP_CUSTOMER_KEY || 'yoyoosun',
        })
        const startupDurationMs = Date.now() - startupStartedAt
        const startupLogEndOffset = statSync(logFile).size
        onProgress(
          `业务验证通过；后端切换完成，耗时 ${(startupDurationMs / 1000).toFixed(1)} 秒`
        )
        activateRuntimeBundle(root, bundle.id, {
          artifactHash: bundle.artifactHash,
          migrationVersion: bundle.migrationVersion,
          health: true,
          ready: true,
          business: true,
          runtime: {
            pid: child.pid,
            logFile: path.relative(root, logFile).split(path.sep).join('/'),
            startedAt,
            startSource,
            version: runtimeServerVersion(bundle),
            logStartOffset,
            startupLogEndOffset,
            startupDurationMs,
          },
        })
        if (openConsole) {
          await presentRuntimeConsole(root, { interactive: false }).catch(
            (error) => {
              console.error(
                `[local-runtime] 后端已通过验证，但日志终端未能打开：${error.message}；可执行 make dev_logs`
              )
            }
          )
        }
        return {
          ...runtime,
          bundleId: bundle.id,
          activeVersion: bundle.migrationVersion,
        }
      } catch (error) {
        if (child?.pid && child.exitCode === null && !child.signalCode) {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {}
        }
        if (logFile) {
          error.runtimeLogFile = path
            .relative(root, logFile)
            .split(path.sep)
            .join('/')
          try {
            error.diagnostic = readRuntimeStartupDiagnostic(
              logFile,
              logStartOffset
            )
          } catch {
            // Preserve the activation error if its log could not be read.
          }
        }
        error.runtimeCutoverStarted = true
        throw error
      }
    },
  }
}
