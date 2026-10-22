import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { getDeploymentTarget } from '../../scripts/deploy/deployment-targets.mjs'

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u
const BACKUP_ID_PATTERN = /^br-[a-z0-9][A-Za-z0-9+_-]{1,126}$/u
const TIMESTAMP_WITH_TIME_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
const REPORT_FILE_NAMES = new Set([
  'backup-restore-report.json',
  'backup-set-restore-report.json',
])
const MAX_REPORT_BYTES = 128 * 1024
const MAX_SCANNED_ENTRIES = 500
const MAX_SCAN_DEPTH = 4

function assertSafeKey(value, field) {
  if (!SAFE_KEY_PATTERN.test(String(value || ''))) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function collectReportPaths(directory, depth = 0, state = { entries: 0 }) {
  if (depth > MAX_SCAN_DEPTH) return []
  const reports = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    state.entries += 1
    if (state.entries > MAX_SCANNED_ENTRIES) {
      throw new Error('backup restore evidence directory is too large')
    }
    const absolutePath = path.join(directory, entry.name)
    const stats = lstatSync(absolutePath)
    if (stats.isSymbolicLink()) continue
    if (stats.isDirectory()) {
      reports.push(...collectReportPaths(absolutePath, depth + 1, state))
    } else if (
      stats.isFile() &&
      REPORT_FILE_NAMES.has(entry.name) &&
      stats.size > 0 &&
      stats.size <= MAX_REPORT_BYTES
    ) {
      reports.push(absolutePath)
    }
  }
  return reports
}

function hasPassedReportContract(report, { customer, environment }) {
  const backup = report?.backup
  const restore = report?.restore
  const smoke = report?.smoke
  const summary = report?.summary
  const redaction = report?.redaction
  const verifiedAt = String(report?.verifiedAt || '')
  return Boolean(
    report &&
    typeof report === 'object' &&
    report.customerCode === customer &&
    report.environment === environment &&
    SHA_PATTERN.test(String(report.releaseId || '')) &&
    BACKUP_ID_PATTERN.test(String(report.backupId || '')) &&
    String(report.backupId).startsWith(`br-${customer}-`) &&
    TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(verifiedAt) &&
    Number.isFinite(Date.parse(verifiedAt)) &&
    typeof report.restoreTarget === 'string' &&
    report.restoreTarget.endsWith(':removed-after-run') &&
    redaction?.containsSecrets === false &&
    redaction?.containsRawCustomerRows === false &&
    redaction?.containsDumpContent === false &&
    redaction?.containsFullDsn === false &&
    summary?.backupCreated === true &&
    summary?.restoreCompleted === true &&
    summary?.migrationStatus === 'ok' &&
    summary?.populatedUpgradeAuditStatus === 'passed' &&
    summary?.customerConfigCutoverAuditStatus === 'passed' &&
    summary?.databaseConstraintAuditStatus === 'passed' &&
    summary?.smokeQueryStatus === 'passed' &&
    Number.isSafeInteger(backup?.databaseBackupSize) &&
    backup.databaseBackupSize > 0 &&
    HASH_PATTERN.test(String(backup?.databaseBackupHash || '')) &&
    backup?.sourcePolicy === 'dedicated-backup' &&
    backup?.sourceRole === 'erp_backup' &&
    typeof backup?.migrationVersion === 'string' &&
    backup.migrationVersion !== '' &&
    backup.migrationVersion !== 'unknown' &&
    restore?.restoreTestStatus === 'passed-temp-container' &&
    restore?.migrationBeforeApply === backup.migrationVersion &&
    typeof restore?.restoreMigrationVersion === 'string' &&
    restore.restoreMigrationVersion !== '' &&
    restore.restoreMigrationVersion !== 'unknown' &&
    String(restore?.pendingFiles || '') === '0' &&
    restore?.programmability === '0|0|0' &&
    restore?.permissionReadbackStatus === 'passed' &&
    restore?.populatedUpgradeAuditStatus === 'passed' &&
    restore?.customerConfigCutoverAuditStatus === 'passed' &&
    restore?.databaseConstraintAuditStatus === 'passed' &&
    HASH_PATTERN.test(String(restore?.schemaReadbackSha256 || '')) &&
    smoke?.smokeQueryStatus === 'passed' &&
    Number(smoke?.publicTableCount) > 0 &&
    smoke?.backendHealthStatus === 'passed' &&
    smoke?.backendReadyStatus === 'passed' &&
    smoke?.webSmokeStatus === 'passed'
  )
}

function readReceipt(reportPath, context) {
  let content
  let report
  try {
    content = readFileSync(reportPath)
    report = JSON.parse(content.toString('utf8'))
  } catch {
    return null
  }
  if (report?.schemaVersion === 'plush.backup-set-restore/v1') {
    return readBackupSetReceipt(report, content, reportPath, context)
  }
  if (!hasPassedReportContract(report, context)) return null
  const verifiedAt = new Date(report.verifiedAt).toISOString()
  return Object.freeze({
    schemaVersion: 'plush.backup-restore-evidence/v1',
    status: 'passed',
    target: context.target,
    customer: context.customer,
    environment: context.environment,
    releaseVersion: report.releaseId,
    verifiedAt,
    backupId: report.backupId,
    reportPath: path
      .relative(context.projectRoot, reportPath)
      .split(path.sep)
      .join('/'),
    reportSha256: createHash('sha256').update(content).digest('hex'),
    backupSha256: report.backup.databaseBackupHash,
    backupSizeBytes: report.backup.databaseBackupSize,
    migrationBefore: report.restore.migrationBeforeApply,
    migrationAfter: report.restore.restoreMigrationVersion,
    pendingFiles: 0,
    disposableCleanup: 'passed',
  })
}

function readBackupSetReceipt(report, content, reportPath, context) {
  const target = getDeploymentTarget(context.target)
  const checked = Date.parse(report.checkedAt)
  const started = Date.parse(report.startedAt)
  const count = report.attachmentCount
  const bytes = report.attachmentBytes
  const business = report.businessSmoke
  const expectedChecks = [
    'health',
    'ready',
    'login',
    'customer-config',
    'units',
    'sales-orders',
    'attachment-download',
    'logout',
  ]
  const businessPassed =
    business?.status === 'passed' &&
    business.releaseSha === report.releaseSha &&
    business.backupId === report.backupId &&
    business.responseBodiesStored === false &&
    Array.isArray(business.checks) &&
    expectedChecks.every((key) =>
      business.checks?.some(
        (check) => check?.key === key && check.status === 'passed'
      )
    ) &&
    business.checks?.every(
      (check) =>
        expectedChecks.includes(check?.key) && check.status === 'passed'
    ) &&
    business.checks.length === expectedChecks.length
  if (
    report.status !== 'passed' ||
    report.project !== target.compose.projectName ||
    context.customer !== target.customer ||
    context.environment !== target.trialTarget ||
    !SHA_PATTERN.test(String(report.releaseSha || '')) ||
    !/^plush-set-\d{8}T\d{6}Z-[0-9a-f-]{36}$/u.test(
      String(report.backupId || '')
    ) ||
    !HASH_PATTERN.test(String(report.encryptedSha256 || '')) ||
    !HASH_PATTERN.test(String(report.attachmentRowsSha256 || '')) ||
    !/^\d{14}$/u.test(String(report.migrationVersion || '')) ||
    !['offsite-backup-set', 'explicit-backup-set'].includes(
      report.sourceKind
    ) ||
    report.restoreTarget !== 'temporary-postgres-and-s3-removed' ||
    !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(String(report.checkedAt || '')) ||
    !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(String(report.startedAt || '')) ||
    !Number.isFinite(checked) ||
    !Number.isFinite(started) ||
    started > checked ||
    checked > Date.now() + 5 * 60_000 ||
    !Number.isSafeInteger(report.publicTableCount) ||
    report.publicTableCount <= 0 ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    (count === 0 ? bytes !== 0 : bytes === 0) ||
    !Number.isSafeInteger(report.backupAgeSeconds) ||
    report.backupAgeSeconds < 0 ||
    !Number.isSafeInteger(report.maxBackupAgeSeconds) ||
    report.maxBackupAgeSeconds < 3600 ||
    report.maxBackupAgeSeconds > 168 * 3600 ||
    (report.sourceKind === 'offsite-backup-set' &&
      report.backupAgeSeconds > report.maxBackupAgeSeconds) ||
    (business !== 'not-run' && !businessPassed)
  ) {
    return null
  }
  return Object.freeze({
    schemaVersion: 'plush.backup-restore-evidence/v1',
    status: 'passed',
    target: context.target,
    customer: context.customer,
    environment: context.environment,
    releaseVersion: report.releaseSha,
    verifiedAt: new Date(checked).toISOString(),
    backupId: report.backupId,
    reportPath: path
      .relative(context.projectRoot, reportPath)
      .split(path.sep)
      .join('/'),
    reportSha256: createHash('sha256').update(content).digest('hex'),
    backupSha256: report.encryptedSha256,
    coverage: 'database-and-attachments',
    sourceKind: report.sourceKind,
    attachmentCount: count,
    attachmentBytes: bytes,
    publicTableCount: report.publicTableCount,
    businessSmoke: businessPassed ? 'passed' : 'not-run',
    migrationBefore: report.migrationVersion,
    migrationAfter: report.migrationVersion,
    pendingFiles: 0,
    disposableCleanup: 'passed',
  })
}

export function readLatestBackupRestoreEvidence({
  projectRoot,
  target,
  customer,
  environment,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  assertSafeKey(target, 'recovery target')
  assertSafeKey(customer, 'recovery customer')
  assertSafeKey(environment, 'recovery environment')
  const evidenceRoot = path.join(
    root,
    'output',
    'customers',
    customer,
    'backup-restore-rehearsal'
  )
  if (!existsSync(evidenceRoot)) return null
  const rootStats = lstatSync(evidenceRoot)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('backup restore evidence root is not a regular directory')
  }
  const receipts = collectReportPaths(evidenceRoot)
    .map((reportPath) =>
      readReceipt(reportPath, {
        projectRoot: root,
        target,
        customer,
        environment,
      })
    )
    .filter(Boolean)
    .sort(
      (left, right) =>
        Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt)
    )
  return receipts[0] || null
}
