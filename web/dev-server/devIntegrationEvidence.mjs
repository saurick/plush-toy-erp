import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  readRepositoryIdentity,
  normalizeRepositoryIdentity,
  repositoryIdentitiesEqual,
} from '../../scripts/qa/lib/repository-identity.mjs'
import { businessRuleTestResults, verifyGoTestJson } from '../../scripts/qa/verify-go-test-json.mjs'
import { businessRuleTests, businessTestKey } from '../../scripts/qa/lib/business-rule-catalog.mjs'
import { DISPOSABLE_DATABASE_RUN_SCHEMA } from '../../scripts/qa/disposable-database-runner.mjs'
import { readIntegrationScenarios } from '../src/dev-workbench/config/devIntegration.mjs'

const DIRECTORY = 'output/dev-workbench/database'

async function boundedFile(file, maxBytes) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) {
    throw new Error('场景证据文件无效')
  }
  const handle = await open(
    file,
    constants.O_RDONLY + (constants.O_NOFOLLOW || 0) + constants.O_NONBLOCK
  )
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.ino !== info.ino ||
      opened.dev !== info.dev ||
      opened.size !== info.size
    ) {
      throw new Error('场景证据读取期间发生变化')
    }
    const value = Buffer.alloc(info.size + 1)
    let size = 0
    while (size < value.length) {
      const result = await handle.read(value, size, value.length - size, null)
      if (!result.bytesRead) break
      size += result.bytesRead
    }
    const after = await handle.stat()
    if (
      size !== info.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.size !== opened.size
    ) {
      throw new Error('场景证据读取期间发生变化')
    }
    return value.subarray(0, size)
  } finally {
    await handle.close()
  }
}

export async function readIntegrationRunEvidence(
  root,
  { readIdentity = readRepositoryIdentity, now = () => new Date() } = {}
) {
  const scenarios = readIntegrationScenarios(
    await readFile(path.join(root, 'server/docs/api.md'), 'utf8')
  )
  const repository = await readIdentity(root)
  const empty = {
    kind: 'plush.integration-evidence',
    readAt: now().toISOString(),
    repository,
    current: false,
    run: null,
    scenarios: scenarios.map((row) => ({ ...row, status: 'missing' })),
    ruleTests: businessRuleTests('postgres').map((test) => ({ id: businessTestKey(test), status: 'missing' })),
  }
  let files
  const directory = path.join(root, DIRECTORY)
  try {
    // Evidence and its ancestors must stay in this checkout, including output.
    let ancestor = root
    for (const part of DIRECTORY.split('/')) {
      ancestor = path.join(ancestor, part)
      const info = await lstat(ancestor)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('场景证据目录无效')
      }
    }
    files = (await readdir(directory)).filter((name) =>
      /^ci-[a-z0-9_-]+\.json$/u.test(name)
    )
  } catch (error) {
    if (error.code === 'ENOENT') return empty
    throw error
  }
  if (files.length > 500) throw new Error('场景证据数量超过读取上限')
  const reports = []
  for (const name of files) {
    const report = JSON.parse(
      (await boundedFile(path.join(directory, name), 1024 * 1024)).toString(
        'utf8'
      )
    )
    if (report.workflow !== 'critical-postgres') continue
    if (
      report.schemaVersion !== DISPOSABLE_DATABASE_RUN_SCHEMA ||
      !Number.isFinite(Date.parse(report.generatedAt))
    ) {
      throw new Error('场景运行回执无效')
    }
    reports.push({ name, report })
  }
  reports.sort(
    (a, b) =>
      Date.parse(b.report.generatedAt) - Date.parse(a.report.generatedAt) ||
      b.name.localeCompare(a.name)
  )
  const latest = reports[0]
  if (!latest) return empty
  const { name, report } = latest
  const run = {
    status: report.status,
    startedAt: report.generatedAt,
    finishedAt: report.finishedAt || null,
    repository: report.repository || null,
    receipt: `${DIRECTORY}/${name}`,
    databaseRunIdentity: report.databaseRunIdentity,
    cleanupComplete:
      report.cleanup?.attempted === true &&
      report.cleanup.residualDatabase === '',
  }
  if (!report.testReport || !report.repository) {
    return { ...empty, run }
  }
  normalizeRepositoryIdentity(report.repository)
  if (report.repositoryAfter) {
    normalizeRepositoryIdentity(report.repositoryAfter)
  }
  const expected = `${DIRECTORY}/${name.replace(/\.json$/u, '.go.jsonl')}`
  if (
    report.testReport.path !== expected ||
    !/^[a-f0-9]{64}$/u.test(report.testReport.digest || '') ||
    !['passed', 'failed'].includes(report.status) ||
    !Number.isFinite(Date.parse(report.finishedAt))
  ) {
    throw new Error('场景证据关联无效')
  }
  const bytes = await boundedFile(path.join(root, expected), 64 * 1024 * 1024)
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    report.testReport.digest
  ) {
    throw new Error('原始场景报告已变化')
  }
  const events = bytes
    .toString('utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return {
    ...empty,
    run,
    ruleTests: businessRuleTestResults(events, 'postgres'),
    current:
      repositoryIdentitiesEqual(report.repository, report.repositoryAfter) &&
      repositoryIdentitiesEqual(report.repository, repository),
    scenarios: scenarios.map((row) => {
      const selected = events.filter(
        (event) =>
          event.Package === 'server/internal/data' &&
          (event.Test === row.test || event.Test?.startsWith(`${row.test}/`))
      )
      const result = verifyGoTestJson(
        selected.map((event) => JSON.stringify(event)).join('\n'),
        [row.test]
      )
      return {
        ...row,
        status: result.fail
          ? 'failed'
          : result.skip
            ? 'skipped'
            : result.ok
              ? 'passed'
              : 'missing',
        counts: {
          executed: result.run,
          passed: result.pass,
          failed: result.fail,
          skipped: result.skip,
        },
      }
    }),
  }
}
