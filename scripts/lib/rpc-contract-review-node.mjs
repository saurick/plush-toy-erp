import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRepositoryIdentity, normalizeRepositoryIdentity, repositoryIdentitiesEqual } from '../qa/lib/repository-identity.mjs'
import { compareRPCContracts, inspectRPCDocumentation, normalizeRPCCatalog, requiresRPCContractCheck } from './rpc-contract-review.mjs'
import { evaluateTestGate } from '../qa/run-test-gate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SNAPSHOT_PATHS = ['server/internal/biz', 'server/internal/service', 'server/internal/core', 'server/internal/buildinfo', 'server/internal/projectmanuals', 'server/internal/server', 'server/api/jsonrpc', 'server/cmd/public-contracts/testdata', 'server/docs/api.md', 'docs/product/ui-design/index.html', 'web/src/common/consts', 'web/src/dev-workbench/config/rpcInspection.generated.mjs']
const EXAMPLE_RECEIPT = 'output/dev-workbench/contracts/examples.json'
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0' }

function contractEvidenceDirectory(root, create = false) {
  let directory = root
  for (const part of ['output', 'dev-workbench', 'contracts']) {
    directory = path.join(directory, part)
    if (create && !fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 })
    const info = fs.lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('接口合同证据目录无效')
  }
  return directory
}

function boundedBytes(file, limit) {
  const before = fs.lstatSync(file)
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('接口合同证据文件无效')
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0))
  try {
    const opened = fs.fstatSync(fd)
    if (!opened.isFile() || opened.size > limit || opened.ino !== before.ino || opened.dev !== before.dev) throw new Error('接口合同证据读取期间发生变化')
    const buffer = Buffer.alloc(opened.size + 1)
    let size = 0
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null)
      if (!count) break
      size += count
    }
    const bytes = buffer.subarray(0, size)
    const after = fs.fstatSync(fd)
    if (bytes.length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || bytes.length > limit) throw new Error('接口合同证据读取期间发生变化')
    return bytes
  } finally { fs.closeSync(fd) }
}

export function rpcExampleExecutionMethods(examples, output) {
  const events = String(output).split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.Package === 'server/internal/service')
  return Object.entries(examples).filter(([, sample]) => sample.verification).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, sample]) => {
    const prefix = `${sample.verification.test}/${sample.verification.case}`
    const selected = events.filter((event) => event.Test === prefix || event.Test?.startsWith(`${prefix}/`))
    const documented = selected.filter((event) => event.Test === `${prefix}/documented`)
    const ran = documented.some((event) => event.Action === 'run')
    const failed = selected.some((event) => event.Action === 'fail')
    const skipped = selected.some((event) => event.Action === 'skip')
    const passed = documented.some((event) => event.Action === 'pass') && selected.some((event) => event.Test === prefix && event.Action === 'pass')
    const cases = [...new Set(selected.filter((event) => event.Test !== prefix && event.Action === 'run').map((event) => event.Test))].map((name) => {
      const actions = selected.filter((event) => event.Test === name).map((event) => event.Action)
      return { name: name.slice(prefix.length + 1), status: actions.includes('fail') ? 'failed' : actions.includes('skip') ? 'skipped' : actions.includes('pass') ? 'passed' : 'missing' }
    })
    const failureFields = [...new Set(selected.filter((event) => event.Action === 'output').flatMap((event) => [...String(event.Output || '').matchAll(/\b(result\.data(?:[.a-zA-Z0-9_[\]-]*)):/gu)].map((match) => match[1])))].slice(0, 20)
    return { key, test: prefix, status: failed ? 'failed' : skipped ? 'skipped' : !ran || !passed || cases.some((item) => item.status === 'missing') ? 'missing' : 'passed', cases, failureFields }
  })
}

export async function verifyRPCDocumentedExamples(root = ROOT, { run = spawnSync, readIdentity = readRepositoryIdentity } = {}) {
  const examples = JSON.parse(fs.readFileSync(path.join(root, 'server/cmd/public-contracts/testdata/rpc_examples.json'), 'utf8'))
  const selected = Object.entries(examples).filter(([, sample]) => sample.verification)
  if (!selected.length || selected.some(([key, sample]) => !/^[a-z_]+\.[a-z_]+$/u.test(key) || !/^TestRPCDocumented[A-Za-z0-9_]*$/u.test(sample.verification.test) || sample.verification.case !== key)) throw new Error('可执行样例登记缺失或无效')
  const repository = await readIdentity(root)
  const startedAt = new Date().toISOString()
  const names = [...new Set(selected.map(([, sample]) => sample.verification.test))].sort()
  const result = run('go', ['test', '-json', './internal/service', '-run', `^(?:${names.join('|')})$`, '-count=1'], { cwd: path.join(root, 'server'), encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024, env: GIT_ENV })
  let gate
  let methods
  try {
    gate = evaluateTestGate({ kind: 'go', status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error })
    methods = rpcExampleExecutionMethods(examples, result.stdout)
  } catch {
    gate = { ok: false }
    methods = selected.map(([key, sample]) => ({ key, test: `${sample.verification.test}/${key}`, status: 'missing', cases: [], failureFields: [] }))
  }
  const repositoryAfter = await readIdentity(root)
  const directory = contractEvidenceDirectory(root, true)
  const raw = String(result.stdout || '')
  const report = {
    kind: 'plush.rpc-example-verification', status: gate.ok && methods.every((method) => method.status === 'passed') && repositoryIdentitiesEqual(repository, repositoryAfter) ? 'passed' : 'failed',
    repository, repositoryAfter, startedAt, finishedAt: new Date().toISOString(), methods,
    reportDigest: createHash('sha256').update(raw).digest('hex'), receipt: EXAMPLE_RECEIPT,
  }
  const temporary = path.join(directory, `.${randomUUID()}`)
  try {
    fs.writeFileSync(`${temporary}.go.jsonl`, raw, { mode: 0o600, flag: 'wx' })
    fs.writeFileSync(`${temporary}.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    fs.renameSync(`${temporary}.go.jsonl`, path.join(directory, 'examples.go.jsonl'))
    fs.renameSync(`${temporary}.json`, path.join(directory, 'examples.json'))
  } finally {
    for (const suffix of ['.go.jsonl', '.json']) fs.rmSync(`${temporary}${suffix}`, { force: true })
  }
  return report
}

function git(root, args, { buffer = false, allowChanges = false } = {}) {
  const result = spawnSync('git', ['-c', 'diff.autoRefreshIndex=false', '-C', root, ...args], { env: GIT_ENV, encoding: buffer ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 30_000 })
  if (result.error) throw result.error
  if (result.status !== 0 && !(allowChanges && result.status === 1)) throw new Error('无法读取 Git 合同基线或暂存快照')
  return result.stdout
}

function snapshot(root, destination, base) {
  fs.mkdirSync(destination, { recursive: true })
  if (base) {
    const archive = git(root, ['archive', '--format=tar', base, '--', ...SNAPSHOT_PATHS], { buffer: true })
    execFileSync('tar', ['-xf', '-', '-C', destination], { input: archive, timeout: 30_000 })
  } else git(root, ['checkout-index', '--all', `--prefix=${destination}${path.sep}`])
}

function check(label, action) {
  try { action(); return { key: label, status: 'passed', message: '检查通过' } }
  catch (error) { return { key: label, status: 'failed', message: String(error.message).slice(0, 2000) } }
}

function generatedCheck(root, catalog, generators) {
  const directory = inspectRPCDocumentation(catalog.rpc, fs.readFileSync(path.join(root, 'server/docs/api.md'), 'utf8'))
  if (directory.issues.length || catalog.rpcIssues?.length) throw new Error('接口目录或样例不完整；先修正来源，再生成并检查')
  generators.syncOutputs(generators.renderCatalog(catalog), { repositoryRoot: root, check: true })
  generators.syncTaskDesignCatalog(catalog, { repositoryRoot: root, check: true })
  generators.syncRPCDocumentation(catalog, { repositoryRoot: root, check: true })
}

export function readRPCExampleReceipt(root, repository, currentExamples) {
  const expected = Object.entries(currentExamples).filter(([, sample]) => sample.verification).map(([key]) => key).sort()
  const empty = { status: 'missing', current: false, methods: [], registered: expected, receipt: null }
  const file = path.join(root, EXAMPLE_RECEIPT)
  if (!fs.existsSync(file)) return empty
  contractEvidenceDirectory(root)
  const value = JSON.parse(boundedBytes(file, 1024 * 1024).toString('utf8'))
  normalizeRepositoryIdentity(value.repository)
  normalizeRepositoryIdentity(value.repositoryAfter)
  if (value.kind !== 'plush.rpc-example-verification' || !['passed', 'failed'].includes(value.status) || !Array.isArray(value.methods) || value.methods.some((row) => !/^[a-z_]+\.[a-z_]+$/u.test(row.key) || !['passed', 'failed', 'missing', 'skipped'].includes(row.status))) throw new Error('样例执行回执结构无效')
  const raw = path.join(root, 'output/dev-workbench/contracts/examples.go.jsonl')
  const bytes = boundedBytes(raw, 32 * 1024 * 1024)
  if (createHash('sha256').update(bytes).digest('hex') !== value.reportDigest) throw new Error('样例执行原始报告已变化')
  const receiptExamples = Object.fromEntries(value.methods.map((row) => {
    const match = /^(TestRPCDocumented[A-Za-z0-9_]*)\/([a-z_]+\.[a-z_]+)$/u.exec(row.test || '')
    if (!match || match[2] !== row.key) throw new Error('样例执行入口与方法不一致')
    return [row.key, { verification: { test: match[1], case: row.key } }]
  }))
  if (!value.methods.length || Object.keys(receiptExamples).length !== value.methods.length) throw new Error('样例执行登记缺失或重复')
  const derived = rpcExampleExecutionMethods(receiptExamples, bytes.toString('utf8'))
  if (JSON.stringify(derived) !== JSON.stringify(value.methods) || value.status === 'passed' && derived.some((method) => method.status !== 'passed')) throw new Error('样例执行状态与原始报告不一致')
  const sameRegistration = expected.length === value.methods.length && value.methods.every((row) => currentExamples[row.key]?.verification?.test === row.test.split('/')[0] && currentExamples[row.key]?.verification?.case === row.key)
  const current = sameRegistration && repositoryIdentitiesEqual(repository, value.repository) && repositoryIdentitiesEqual(value.repository, value.repositoryAfter)
  return { status: value.status, current, methods: value.methods, registered: expected, receipt: EXAMPLE_RECEIPT, finishedAt: value.finishedAt }
}

export async function createRPCContractReview(root = ROOT, { range = 'worktree', base = 'HEAD', generators, readIdentity = readRepositoryIdentity } = {}) {
  if (!['worktree', 'staged'].includes(range) || typeof base !== 'string' || !/^[a-zA-Z0-9_./~-]+$/u.test(base) || base.startsWith('-')) throw new Error('接口合同比较范围无效')
  const repository = await readIdentity(root)
  const baseCommit = git(root, ['rev-parse', '--verify', `${base}^{commit}`]).trim()
  const staged = git(root, ['diff', '--cached', '--name-only', '--exit-code', '-z', baseCommit, '--'], { allowChanges: true }).split('\0').filter(Boolean)
  const changed = git(root, ['diff', '--name-only', '--exit-code', '-z', baseCommit, '--'], { allowChanges: true }).split('\0').filter(Boolean)
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-rpc-contract-review-'))
  try {
    const baselineRoot = path.join(temp, 'baseline')
    snapshot(root, baselineRoot, baseCommit)
    const baselineCatalog = generators.loadCatalog(baselineRoot, { review: true })
    const baseline = normalizeRPCCatalog(baselineCatalog, fs.readFileSync(path.join(baselineRoot, 'server/docs/api.md'), 'utf8'))
    const stagedRelevant = staged.filter((file) => requiresRPCContractCheck([file]))
    let targetRoot = root
    let indexCatalog
    let indexRoot
    if (stagedRelevant.length || range === 'staged') {
      indexRoot = path.join(temp, 'index')
      snapshot(root, indexRoot)
      if (range === 'staged') targetRoot = indexRoot
    }
    const catalog = generators.loadCatalog(targetRoot, { review: true })
    const document = fs.readFileSync(path.join(targetRoot, 'server/docs/api.md'), 'utf8')
    const index = inspectRPCDocumentation(catalog.rpc, document)
    const problems = [...index.issues, ...(catalog.rpcIssues || []).map((issue) => ({ key: issue.key, reason: issue.message }))]
    const current = normalizeRPCCatalog(catalog, document)
    const changes = compareRPCContracts(baseline, current)
    const targetFiles = range === 'staged' ? staged : [...changed, ...untracked]
    for (const [key, method] of Object.entries(current)) {
      if (!changes.some((row) => row.key === key) && method.sources.some((source) => targetFiles.includes(source))) {
        changes.push({ key, label: method.label, kind: 'implementation', fields: [], source: method.source, sample: method.sample })
      }
    }
    const { collectRPCConsumerReferences } = await import('../qa/public-contract-consumers.mjs')
    const consumers = [...new Map([...collectRPCConsumerReferences(targetRoot, { rpcCatalog: baselineCatalog.rpc }), ...collectRPCConsumerReferences(targetRoot, { rpcCatalog: catalog.rpc })].map((row) => [`${row.key}:${row.path}:${row.line}`, row])).values()]
    changes.forEach((change) => { change.consumers = consumers.filter((row) => row.key === change.key) })
    changes.sort((left, right) => left.key.localeCompare(right.key, 'en'))
    const contractCheck = range === 'staged' && !stagedRelevant.length
      ? { key: 'generated', status: 'missing', message: '暂存范围没有接口相关改动，未执行生成同步检查' }
      : check('generated', () => generatedCheck(targetRoot, catalog, generators))
    let stagedCheck = { key: 'staging', status: 'missing', message: '本轮尚未暂存接口相关改动；提交时会自动检查实际暂存内容' }
    if (stagedRelevant.length) {
      indexCatalog = targetRoot === indexRoot ? catalog : generators.loadCatalog(indexRoot, { review: true })
      stagedCheck = check('staging', () => generatedCheck(indexRoot, indexCatalog, generators))
    }
    const examples = JSON.parse(fs.readFileSync(path.join(targetRoot, 'server/cmd/public-contracts/testdata/rpc_examples.json'), 'utf8'))
    let execution
    const workspaceExamples = range === 'staged' ? JSON.parse(fs.readFileSync(path.join(root, 'server/cmd/public-contracts/testdata/rpc_examples.json'), 'utf8')) : examples
    try { execution = readRPCExampleReceipt(root, repository, workspaceExamples) }
    catch { execution = { status: 'failed', current: false, methods: [], registered: Object.entries(examples).filter(([, sample]) => sample.verification).map(([key]) => key), receipt: EXAMPLE_RECEIPT, message: '样例执行回执读取失败或与原始报告不一致' } }
    if (range === 'staged') {
      execution.current = false
      execution.registered = Object.entries(examples).filter(([, sample]) => sample.verification).map(([key]) => key).sort()
    }
    const relevantFiles = [...new Set([...changed, ...untracked, ...staged])].filter((file) => requiresRPCContractCheck([file])).sort()
    const repositoryAfter = await readIdentity(root)
    return {
      kind: 'plush.rpc-contract-review', range, base: baseCommit, repository, current: repositoryIdentitiesEqual(repository, repositoryAfter), readAt: new Date().toISOString(),
      changes, methodCount: Object.keys(current).length,
      checks: [{ key: 'catalog', status: problems.length ? 'failed' : 'passed', message: problems.length ? `${problems.length} 项目录或样例问题` : '后端、正式方法表、样例与工作台目录一致', issues: problems }, contractCheck, stagedCheck],
      files: relevantFiles.map((file) => ({ path: file, worktreeChanged: changed.includes(file) || untracked.includes(file), staged: staged.includes(file) })),
      execution,
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
