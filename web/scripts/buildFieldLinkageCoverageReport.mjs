import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  FIELD_LINKAGE_CASE_CATALOG,
  FIELD_LINKAGE_RUN_COMMAND,
  buildFieldLinkageCoverageViewModel,
} from '../src/erp/qa/fieldLinkageCatalog.mjs'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEB_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(WEB_ROOT, '..')
const DEFAULT_NODE_TAP_PATH = path.join(
  REPO_ROOT,
  'output',
  'qa',
  'field-linkage',
  'node-test.tap'
)
const DEFAULT_OUTPUT_PATH = path.join(
  WEB_ROOT,
  'public',
  'qa',
  'erp-field-linkage-coverage.latest.json'
)

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

const buildRunContext = async () => {
  const gitCommit = await runGitCommand(['rev-parse', 'HEAD'])
  const gitBranch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'])
  const gitStatus = await runGitCommand(['status', '--short'])
  return {
    repoRoot: REPO_ROOT,
    gitCommit,
    gitCommitShort: gitCommit ? gitCommit.slice(0, 12) : '',
    gitBranch,
    gitDirty: Boolean(gitStatus),
    nodeVersion: process.version,
    generatedBy:
      process.env.USER || process.env.USERNAME || process.env.LOGNAME || '',
  }
}

const parseArgs = (argv) => {
  const options = {
    nodeTap: DEFAULT_NODE_TAP_PATH,
    output: DEFAULT_OUTPUT_PATH,
    command: process.env.ERP_FIELD_LINKAGE_COMMAND || FIELD_LINKAGE_RUN_COMMAND,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--node-tap') {
      options.nodeTap = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--output') {
      options.output = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--command') {
      options.command = argv[index + 1]
      index += 1
    }
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

const collectNodeTapStatuses = async (filePath, statuses) => {
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

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const statuses = new Map()
  const runContext = await buildRunContext()

  await collectNodeTapStatuses(options.nodeTap, statuses)

  const cases = FIELD_LINKAGE_CASE_CATALOG.map((catalogItem) => ({
    caseId: catalogItem.caseId,
    status: statuses.get(catalogItem.caseId)?.status || 'missing',
    durationMs: statuses.get(catalogItem.caseId)?.durationMs ?? null,
    failureMessages: statuses.get(catalogItem.caseId)?.failureMessages || [],
  }))

  const report = buildFieldLinkageCoverageViewModel({
    generatedAt: new Date().toISOString(),
    command: options.command,
    runContext,
    cases,
  })

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${options.output}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`)
  process.exitCode = 1
})
