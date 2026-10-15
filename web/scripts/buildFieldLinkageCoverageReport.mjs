import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  FIELD_LINKAGE_CASE_CATALOG,
  FIELD_LINKAGE_RUN_COMMAND,
  buildFieldLinkageCoverageViewModel,
} from '../src/erp/qa/fieldLinkageCatalog.mjs'
import {
  assertRepositoryIdentityEqual,
  normalizeRepositoryIdentity,
  readRepositoryIdentity,
} from '../../scripts/qa/lib/repository-identity.mjs'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEB_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(WEB_ROOT, '..')
export const DEFAULT_NODE_TAP_PATH = path.join(
  REPO_ROOT,
  'output',
  'qa',
  'field-linkage',
  'node-test.tap'
)
export const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'output',
  'qa',
  'coverage',
  'field-linkage.latest.json'
)
const ALLOWED_OUTPUT_ROOT = path.dirname(DEFAULT_OUTPUT_PATH)

const runGitCommand = async (args) => {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: REPO_ROOT,
      env: process.env,
    })
    return String(stdout || '').trim()
  } catch (_error) {
    return ''
  }
}

export const buildRepositoryState = async () =>
  readRepositoryIdentity(REPO_ROOT)

export const buildRunContext = async (repository) => {
  const currentRepository = repository || (await buildRepositoryState())
  const gitBranch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'])
  return {
    gitCommit: currentRepository.commit,
    gitCommitShort: currentRepository.commit
      ? currentRepository.commit.slice(0, 12)
      : '',
    gitBranch,
    gitDirty: currentRepository.dirty,
    nodeVersion: process.version,
  }
}

const requireOptionValue = (argv, index, optionName) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value`)
  }
  return value
}

const normalizeOutputPath = (value) => {
  const outputPath = path.resolve(REPO_ROOT, value)
  const relativePath = path.relative(ALLOWED_OUTPUT_ROOT, outputPath)
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('--output must stay inside output/qa/coverage')
  }
  return outputPath
}

export const normalizeReportCommand = (value) =>
  String(value || '').trim() === FIELD_LINKAGE_RUN_COMMAND
    ? FIELD_LINKAGE_RUN_COMMAND
    : 'custom field linkage command'

export const parseExpectedRepository = (value) => {
  try {
    return normalizeRepositoryIdentity(JSON.parse(value))
  } catch {
    throw new Error(
      '--expected-repository must be a canonical repository identity'
    )
  }
}

export const parseArgs = (argv) => {
  const options = {
    nodeTap: DEFAULT_NODE_TAP_PATH,
    output: DEFAULT_OUTPUT_PATH,
    command: FIELD_LINKAGE_RUN_COMMAND,
    expectedRepository: null,
  }
  let expectedRepositorySeen = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--node-tap') {
      options.nodeTap = path.resolve(
        REPO_ROOT,
        requireOptionValue(argv, index, arg)
      )
      index += 1
      continue
    }
    if (arg === '--output') {
      options.output = normalizeOutputPath(requireOptionValue(argv, index, arg))
      index += 1
      continue
    }
    if (arg === '--command') {
      options.command = normalizeReportCommand(
        requireOptionValue(argv, index, arg)
      )
      index += 1
      continue
    }
    if (arg === '--expected-repository') {
      if (expectedRepositorySeen) {
        throw new Error('--expected-repository may only be specified once')
      }
      options.expectedRepository = parseExpectedRepository(
        requireOptionValue(argv, index, arg)
      )
      expectedRepositorySeen = true
      index += 1
      continue
    }
    throw new Error(`unsupported option: ${arg}`)
  }
  if (!options.expectedRepository) {
    throw new Error('--expected-repository is required')
  }
  return options
}

const extractCaseId = (raw = '') => {
  const matched = String(raw || '').match(/FL_[A-Za-z0-9_]+/u)
  return matched?.[0] || ''
}

const mergeCaseStatus = (current, next) => {
  const priority = { fail: 3, pass: 2, skip: 1, missing: 0 }
  if (!current) return next
  return priority[next.status] > priority[current.status] ? next : current
}

export const collectNodeTapStatuses = async (filePath, statuses) => {
  const raw = await readFile(filePath, 'utf8')
  let currentCaseId = ''
  raw.split('\n').forEach((line) => {
    const resultMatch = line.match(
      /^(not ok|ok)\s+\d+\s+-\s+(.+?)(?:\s+#\s+SKIP.*)?$/u
    )
    if (resultMatch) {
      const [, rawStatus, title] = resultMatch
      const caseId = extractCaseId(title)
      if (!caseId) {
        currentCaseId = ''
        return
      }
      currentCaseId = caseId
      const status = line.includes('# SKIP')
        ? 'skip'
        : rawStatus === 'ok'
          ? 'pass'
          : 'fail'
      statuses.set(
        caseId,
        mergeCaseStatus(statuses.get(caseId), {
          caseId,
          status,
          durationMs: null,
          failureMessages: [],
        })
      )
      return
    }

    const durationMatch = line.match(/^\s+duration_ms:\s+([0-9.]+)/u)
    if (currentCaseId && durationMatch) {
      const current = statuses.get(currentCaseId)
      if (!current) return
      statuses.set(currentCaseId, {
        ...current,
        durationMs: Math.round(Number(durationMatch[1])),
      })
    }
  })
}

export const buildFieldLinkageReport = ({
  generatedAt,
  command,
  repository,
  runContext,
  cases,
}) => ({
  ...buildFieldLinkageCoverageViewModel({
    generatedAt,
    command,
    runContext,
    cases,
  }),
  repository,
})

export const generateFieldLinkageReport = async (
  options,
  {
    repositoryReader = buildRepositoryState,
    collectStatuses = collectNodeTapStatuses,
    clock = () => new Date(),
    makeDirectory = mkdir,
    writeOutput = writeFile,
    moveOutput = rename,
    removeOutput = rm,
  } = {}
) => {
  const expectedRepository = normalizeRepositoryIdentity(
    options.expectedRepository
  )
  assertRepositoryIdentityEqual(expectedRepository, await repositoryReader())
  const statuses = new Map()
  const runContext = await buildRunContext(expectedRepository)

  await collectStatuses(options.nodeTap, statuses)

  const cases = FIELD_LINKAGE_CASE_CATALOG.map((catalogItem) => ({
    caseId: catalogItem.caseId,
    status: statuses.get(catalogItem.caseId)?.status || 'missing',
    durationMs: statuses.get(catalogItem.caseId)?.durationMs ?? null,
    failureMessages: statuses.get(catalogItem.caseId)?.failureMessages || [],
  }))

  const report = buildFieldLinkageReport({
    generatedAt: clock().toISOString(),
    command: options.command,
    repository: expectedRepository,
    runContext,
    cases,
  })

  await makeDirectory(path.dirname(options.output), { recursive: true })
  const temporaryOutput = `${options.output}.${process.pid}.tmp`
  try {
    await writeOutput(
      temporaryOutput,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    )
    assertRepositoryIdentityEqual(expectedRepository, await repositoryReader())
    await moveOutput(temporaryOutput, options.output)
    try {
      assertRepositoryIdentityEqual(
        expectedRepository,
        await repositoryReader()
      )
    } catch (error) {
      await removeOutput(options.output, { force: true })
      throw error
    }
  } finally {
    await removeOutput(temporaryOutput, { force: true })
  }
  return report
}

export const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  await generateFieldLinkageReport(options)
  process.stdout.write(`${path.relative(REPO_ROOT, options.output)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(() => {
    process.stderr.write('字段联动覆盖报告生成失败\n')
    process.exitCode = 1
  })
}
