import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRPCContractReview, readRPCExampleReceipt, rpcExampleExecutionMethods, verifyRPCDocumentedExamples } from './rpc-contract-review-node.mjs'

const IDENTITY = { commit: 'a'.repeat(40), dirty: true, fingerprint: 'b'.repeat(64) }
const EXAMPLES = { 'orders.list': { verification: { test: 'TestRPCDocumentedFixture', case: 'orders.list' } } }
const events = (action = 'pass', { documented = true } = {}) => {
  const names = ['TestRPCDocumentedFixture', 'TestRPCDocumentedFixture/orders.list', ...(documented ? ['TestRPCDocumentedFixture/orders.list/documented'] : [])]
  return names.flatMap((Test) => [{ Action: 'run', Test }, { Action: action, Test }]).map((row) => JSON.stringify({ Package: 'server/internal/service', ...row })).join('\n') + '\n'
}
function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-contract-node-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
function write(root, name, content) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim()
}

test('RPC example evidence requires the documented child, rejects skips and does not infer a method from a parent pass', () => {
  assert.equal(rpcExampleExecutionMethods(EXAMPLES, events())[0].status, 'passed')
  assert.equal(rpcExampleExecutionMethods(EXAMPLES, events('pass', { documented: false }))[0].status, 'missing')
  assert.equal(rpcExampleExecutionMethods(EXAMPLES, events('skip'))[0].status, 'skipped')
  assert.equal(rpcExampleExecutionMethods(EXAMPLES, events('fail'))[0].status, 'failed')
  assert.equal(rpcExampleExecutionMethods(EXAMPLES, '')[0].status, 'missing')
})

test('RPC executable sample receipts bind raw events and source identity, and preserve failed results', async (t) => {
  const root = directory(t)
  write(root, 'server/cmd/public-contracts/testdata/rpc_examples.json', JSON.stringify(EXAMPLES))
  const run = (command, args) => {
    assert.equal(command, 'go')
    assert.deepEqual(args, ['test', '-json', './internal/service', '-run', '^(?:TestRPCDocumentedFixture)$', '-count=1'])
    return { status: 0, stdout: events(), stderr: '' }
  }
  const report = await verifyRPCDocumentedExamples(root, { run, readIdentity: async () => IDENTITY })
  assert.equal(report.status, 'passed')
  assert.equal(readRPCExampleReceipt(root, IDENTITY, EXAMPLES).current, true)
  const oldRegistration = readRPCExampleReceipt(root, IDENTITY, {})
  assert.equal(oldRegistration.current, false)
  assert.equal(oldRegistration.methods[0].status, 'passed')
  assert.equal(readRPCExampleReceipt(root, { ...IDENTITY, fingerprint: 'c'.repeat(64) }, EXAMPLES).current, false)
  fs.appendFileSync(path.join(root, 'output/dev-workbench/contracts/examples.go.jsonl'), '{}\n')
  assert.throws(() => readRPCExampleReceipt(root, IDENTITY, EXAMPLES), /原始报告已变化/u)
  const failed = await verifyRPCDocumentedExamples(root, { run: () => ({ status: 0, stdout: events('skip'), stderr: '' }), readIdentity: async () => IDENTITY })
  assert.equal(failed.status, 'failed')
  assert.equal(readRPCExampleReceipt(root, IDENTITY, EXAMPLES).methods[0].status, 'skipped')
})

test('RPC sample collection fails on source drift, invalid registration, zero execution and symlink evidence roots', async (t) => {
  const root = directory(t)
  write(root, 'server/cmd/public-contracts/testdata/rpc_examples.json', JSON.stringify(EXAMPLES))
  let reads = 0
  const drift = await verifyRPCDocumentedExamples(root, { run: () => ({ status: 0, stdout: events() }), readIdentity: async () => ({ ...IDENTITY, fingerprint: (++reads === 1 ? 'b' : 'c').repeat(64) }) })
  assert.equal(drift.status, 'failed')
  const empty = await verifyRPCDocumentedExamples(root, { run: () => ({ status: 0, stdout: '' }), readIdentity: async () => IDENTITY })
  assert.equal(empty.status, 'failed')
  write(root, 'server/cmd/public-contracts/testdata/rpc_examples.json', JSON.stringify({ 'orders.list': { verification: { test: '-run arbitrary', case: 'orders.list' } } }))
  await assert.rejects(verifyRPCDocumentedExamples(root), /登记缺失或无效/u)
  const linked = directory(t)
  write(linked, 'server/cmd/public-contracts/testdata/rpc_examples.json', JSON.stringify(EXAMPLES))
  fs.symlinkSync(path.join(root, 'output'), path.join(linked, 'output'))
  await assert.rejects(verifyRPCDocumentedExamples(linked, { run: () => ({ status: 0, stdout: events() }), readIdentity: async () => IDENTITY }), /证据目录无效/u)
})

test('RPC review compares HEAD and exact index without changing source, refs or the shared index', async (t) => {
  const root = directory(t)
  const table = (type) => `### 订单 \`orders\`\n\n| 方法 | 中文名称 | 用途 |\n| --- | --- | --- |\n| \`list\` | 查询订单 | 当前订单 |\n<!-- type:${type} -->\n`
  const paths = ['server/internal/biz', 'server/internal/core', 'server/internal/buildinfo', 'server/internal/projectmanuals', 'server/internal/server', 'server/api/jsonrpc', 'docs/product/ui-design', 'web/src/common/consts']
  for (const folder of paths) write(root, `${folder}/.keep`, '')
  write(root, 'server/internal/service/snapshot.json', JSON.stringify({ type: 'integer' }))
  write(root, 'server/cmd/public-contracts/testdata/rpc_examples.json', '{}')
  write(root, 'server/docs/api.md', table('integer'))
  write(root, 'docs/product/ui-design/index.html', '<!-- fixture -->')
  write(root, 'web/src/dev-workbench/config/rpcInspection.generated.mjs', 'export const fixture = true\n')
  git(root, 'init', '-q')
  git(root, 'add', '.')
  git(root, '-c', 'user.name=Contract Test', '-c', 'user.email=contract@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base')
  write(root, 'server/internal/service/snapshot.json', JSON.stringify({ type: 'string' }))
  git(root, 'add', 'server/internal/service/snapshot.json')
  write(root, 'server/docs/api.md', table('string'))
  const indexBefore = fs.readFileSync(path.join(root, '.git/index'))
  const headBefore = git(root, 'rev-parse', 'HEAD')
  const generators = {
    loadCatalog: (source) => ({ rpc: { orders: { LIST: 'list' } }, rpcCalls: { orders: { list: { dataType: 'object', parameters: [], response: [{ name: 'result.data.total', type: JSON.parse(fs.readFileSync(path.join(source, 'server/internal/service/snapshot.json'))).type }], example: { basis: 'backend-wire-shape' } } } }, rpcInspection: {} }),
    renderCatalog: (catalog) => catalog.rpcCalls.orders.list.response[0].type,
    syncOutputs: (type, { repositoryRoot }) => { if (!fs.readFileSync(path.join(repositoryRoot, 'server/docs/api.md'), 'utf8').includes(`type:${type}`)) throw new Error('staged generated document mismatch') },
    syncTaskDesignCatalog: () => {}, syncRPCDocumentation: () => {},
  }
  const report = await createRPCContractReview(root, { generators, readIdentity: async () => IDENTITY })
  assert.equal(report.changes[0].fields[0].path, 'response.result.data.total.type')
  assert.equal(report.checks.find((row) => row.key === 'generated').status, 'passed')
  assert.equal(report.checks.find((row) => row.key === 'staging').status, 'failed')
  assert.equal(report.files.find((row) => row.path === 'server/docs/api.md').staged, false)
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/index')), indexBefore)
  assert.equal(git(root, 'rev-parse', 'HEAD'), headBefore)
  assert.equal(fs.readFileSync(path.join(root, 'server/docs/api.md'), 'utf8'), table('string'))
  const staged = await createRPCContractReview(root, { generators, range: 'staged', readIdentity: async () => IDENTITY })
  assert.equal(staged.changes[0].fields[0].after, 'string')
  assert.equal(staged.checks.find((row) => row.key === 'generated').status, 'failed')
  git(root, 'restore', '--staged', 'server/internal/service/snapshot.json')
  const emptyIndex = await createRPCContractReview(root, { generators, range: 'staged', readIdentity: async () => IDENTITY })
  assert.equal(emptyIndex.changes.length, 0)
  assert.equal(emptyIndex.checks.find((row) => row.key === 'generated').status, 'missing')
  assert.equal(emptyIndex.checks.find((row) => row.key === 'staging').status, 'missing')
})
