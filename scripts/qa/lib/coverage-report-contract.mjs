import path from 'node:path'

export const COVERAGE_REPORT_SCHEMA = 'plush-test-coverage-report/v1'

const FORBIDDEN_REPORT_KEYS = new Set([
  'accesstoken',
  'authorization',
  'cookie',
  'generatedby',
  'gitremote',
  'overallcoverage',
  'overallpercent',
  'password',
  'refreshtoken',
  'remote',
  'remoteaddress',
  'remoteurl',
  'reporoot',
  'repositoryurl',
  'token',
  'totalcoveragepercent',
  'username',
])

const normalizeKey = (value) =>
  String(value || '')
    .replace(/[^a-z0-9]/giu, '')
    .toLowerCase()

const containsSensitiveString = (value) => {
  const text = String(value || '')
  if (
    /(?:^|[\s"'=])(Bearer\s+|ghp_|github_pat_|sk-[A-Za-z0-9]|xox[baprs]-)/iu.test(
      text
    )
  ) {
    return true
  }
  if (/(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\)/u.test(text)) return true
  if (path.isAbsolute(text)) return true
  if (/(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)(?:\/|$)/u.test(text)) {
    return true
  }

  if (/(?:^|[\s"'=])[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return true
  if (/(?:^|[\s"'=])[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:.+/u.test(text)) {
    return true
  }
  return false
}

const assertSafeReportValue = (value, key = '', depth = 0) => {
  if (depth > 64) throw new Error('report nesting exceeds limit')
  if (typeof value === 'string') {
    if (containsSensitiveString(value)) {
      throw new Error('report contains restricted data')
    }
    return
  }
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeReportValue(item, key, depth + 1))
    return
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(normalizeKey(childKey))) {
      throw new Error('report contains restricted data')
    }
    assertSafeReportValue(childValue, childKey, depth + 1)
  }
}

export function validateCoverageReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('report must be an object')
  }
  if (report.schemaVersion !== COVERAGE_REPORT_SCHEMA) {
    throw new Error('report schema is unsupported')
  }
  const { repository } = report
  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    !/^[0-9a-f]{40,64}$/u.test(repository.commit || '') ||
    typeof repository.dirty !== 'boolean' ||
    !/^[0-9a-f]{64}$/u.test(repository.fingerprint || '')
  ) {
    throw new Error('report repository state is invalid')
  }
  assertSafeReportValue(report)
  return report
}
