import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveTargetReadOnlyExecution } from '../../scripts/deploy/target-readonly-execution.mjs'

const run = promisify(execFile)
export const RETENTION_SUMMARY_PATH = '/var/lib/plush-retention/summary.json'
const states = new Set([
  'retained',
  'protected',
  'cleaned',
  'cleaning',
  'eligible',
  'unverified',
])

export function validateRetentionSummary(value) {
  if (
    value?.schemaVersion !== 'plush.retention-summary/v1' ||
    value.retentionCount !== 7 ||
    !['passed', 'failed'].includes(value.status) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.versions) ||
    !Array.isArray(value.backups) ||
    value.recordsRetained !== true
  )
    { throw new Error('invalid_retention_summary') }
  for (const item of [...value.versions, ...value.backups]) {
    if (
      !states.has(item.state) ||
      !Array.isArray(item.reasons) ||
      item.reasons.some((x) => typeof x !== 'string' || x.length > 200) ||
      (item.cleanedAt !== null && !Number.isFinite(Date.parse(item.cleanedAt)))
    )
      { throw new Error('invalid_retention_entry') }
  }
  if (
    value.versions.some((x) => !/^[a-f0-9]{40}$/u.test(x.gitSha)) ||
    new Set(value.versions.map((x) => x.gitSha)).size !== value.versions.length
  )
    { throw new Error('invalid_retention_version') }
  if (
    value.backups.some(
      (x) =>
        !['demo', 'test', 'erp', 'gitlab'].includes(x.environment) ||
        typeof x.id !== 'string' ||
        typeof x.name !== 'string' ||
        x.name.includes('/') ||
        !Number.isSafeInteger(x.sizeBytes) ||
        x.sizeBytes < 0 ||
        !Number.isFinite(Date.parse(x.createdAt))
    )
  )
    { throw new Error('invalid_retention_backup') }
  return value
}

export async function readRetentionSummary() {
  const execution = resolveTargetReadOnlyExecution('production-133')
  const bytes =
    execution.transport === 'local execution'
      ? await fs.readFile(RETENTION_SUMMARY_PATH, 'utf8')
      : (
          await run(
            'ssh',
            [...execution.args.slice(0, -2), 'cat', RETENTION_SUMMARY_PATH],
            {
              timeout: 15000,
              maxBuffer: 8 * 1024 ** 2,
              env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
            }
          )
        ).stdout
  if (Buffer.byteLength(bytes) > 8 * 1024 ** 2)
    { throw new Error('retention_summary_too_large') }
  return validateRetentionSummary(JSON.parse(bytes))
}
