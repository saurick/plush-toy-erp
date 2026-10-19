import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readIntegrationRunEvidence } from './devIntegrationEvidence.mjs'
import { DISPOSABLE_DATABASE_RUN_SCHEMA } from '../../scripts/qa/disposable-database-runner.mjs'

const identity = {
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
}
const name = 'ci-20261018-example.json'
const relative = `output/dev-workbench/database/${name}`
const scenario = 'TestSourceDocumentPostgresIntegrationSupplierDelivery'
const api = `## 模拟消费者与接入验证\n\n| 场景 | 入口 | 核对 | 回归 |\n| --- | --- | --- | --- |\n| 上游闭环 | \`purchase.get / post\` | 核对库存 | \`${scenario}\` |\n`

async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'plush-integration-evidence-')
  )
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'server/docs'), { recursive: true })
  await writeFile(path.join(root, 'server/docs/api.md'), api)
  return root
}
async function report(
  root,
  {
    actions = ['run', 'pass'],
    before = identity,
    after = identity,
    digest = '',
    status = 'passed',
    content,
  } = {}
) {
  const json = content ?? `${actions
    .map((Action) =>
      JSON.stringify({
        Action,
        Package: 'server/internal/data',
        Test: scenario,
      })
    )
    .join('\n')}\n`
  const lifecycle = {
    schemaVersion: DISPOSABLE_DATABASE_RUN_SCHEMA,
    workflow: 'critical-postgres',
    status,
    generatedAt: '2026-10-18T01:00:00Z',
    finishedAt: '2026-10-18T01:00:01Z',
    repository: before,
    repositoryAfter: after,
    databaseRunIdentity: 'ci:20261018-example',
    cleanup: { attempted: true, residualDatabase: '' },
    testReport: {
      path: relative.replace('.json', '.go.jsonl'),
      digest: digest || createHash('sha256').update(json).digest('hex'),
    },
  }
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await writeFile(path.join(root, relative), JSON.stringify(lifecycle))
  await writeFile(path.join(root, lifecycle.testReport.path), json)
}
const read = (root, current = identity) =>
  readIntegrationRunEvidence(root, { readIdentity: async () => current })

test('integration evidence uses formal associations and original bound Go results', async (t) => {
  const root = await fixture(t)
  assert.equal((await read(root)).scenarios[0].status, 'missing')
  await report(root)
  const value = await read(root)
  assert.equal(value.current, true)
  assert.equal(value.run.cleanupComplete, true)
  assert.equal(value.scenarios[0].status, 'passed')
  assert.deepEqual(value.scenarios[0].methods, [
    'purchase.get',
    'purchase.post',
  ])
  assert.equal(
    (await read(root, { ...identity, fingerprint: 'c'.repeat(64) })).current,
    false
  )
  await report(root, { after: { ...identity, commit: 'd'.repeat(40) } })
  assert.equal((await read(root)).current, false)
  await report(root, { after: null })
  const unfinishedIdentity = await read(root)
  assert.equal(unfinishedIdentity.current, false)
  assert.equal(unfinishedIdentity.scenarios[0].status, 'passed')
})

test('failure, skip, zero execution and incomplete results cannot become passed', async (t) => {
  const root = await fixture(t)
  for (const [actions, expected] of [
    [['run', 'fail'], 'failed'],
    [['run', 'skip'], 'skipped'],
    [[], 'missing'],
    [['pass'], 'missing'],
    [['run'], 'missing'],
  ]) {
    await report(root, { actions, status: 'failed' })
    assert.equal((await read(root)).scenarios[0].status, expected)
  }
})

test('changed artifacts, malformed events and symlinks fail closed', async (t) => {
  const root = await fixture(t)
  await report(root, { digest: '0'.repeat(64) })
  await assert.rejects(read(root), /已变化/u)
  await report(root, { content: '{invalid JSON}\n' })
  await assert.rejects(read(root), SyntaxError)
  await report(root)
  await rm(path.join(root, relative.replace('.json', '.go.jsonl')))
  await symlink(
    path.join(root, 'server/docs/api.md'),
    path.join(root, relative.replace('.json', '.go.jsonl'))
  )
  await assert.rejects(read(root), /无效/u)
})

test('a child result cannot hide an incomplete or failed scenario', async (t) => {
  const root = await fixture(t)
  for (const [parentAction, childAction, expected] of [
    ['', 'pass', 'missing'],
    ['fail', 'pass', 'failed'],
    ['pass', 'skip', 'skipped'],
    ['pass', 'fail', 'failed'],
  ]) {
    const content = [
      { Test: scenario, Action: 'run' },
      { Test: `${scenario}/replay`, Action: 'run' },
      { Test: `${scenario}/replay`, Action: childAction },
      ...(parentAction ? [{ Test: scenario, Action: parentAction }] : []),
    ].map((event) => JSON.stringify({ Package: 'server/internal/data', ...event })).join('\n') + '\n'
    await report(root, { content })
    assert.equal((await read(root)).scenarios[0].status, expected)
  }
})

test('latest incomplete run stays visible instead of borrowing an older green result', async (t) => {
  const root = await fixture(t)
  await report(root)
  await writeFile(
    path.join(root, 'output/dev-workbench/database/ci-later.json'),
    JSON.stringify({
      schemaVersion: DISPOSABLE_DATABASE_RUN_SCHEMA,
      workflow: 'critical-postgres',
      status: 'failed',
      generatedAt: '2026-10-18T02:00:00Z',
    })
  )
  const value = await read(root)
  assert.equal(value.current, false)
  assert.equal(value.run.status, 'failed')
  assert.equal(value.scenarios[0].status, 'missing')
})
