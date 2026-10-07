import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  projectDevPressureReport,
  readDevPressureReports,
} from './devQaPressureReports.mjs'

import { PRESSURE_DATA_SCALES } from '../src/dev-workbench/config/devPressureData.mjs'
import { comparePressureScale } from '../src/dev-workbench/config/devPressure.mjs'

const commit = 'a'.repeat(40)
  const fingerprint = 'b'.repeat(64)
const source = {
  commit,
  build: fingerprint,
  data: fingerprint,
  verification: fingerprint,
  load: fingerprint,
  lifecycle: fingerprint,
}
function fixture() {
  const metric = {
    requests: 20,
    successes: 20,
    failures: 0,
    successfulRps: 2,
    successfulLatencyMs: { p95: 100, p99: 200 },
  }
  const levels = ['ramp', 'capacity', 'recovery'].map((key) => ({
    key,
    concurrency: 4,
    elapsedMs: 600000,
    targetDurationMs: 600000,
    pacingMs: 1000,
    acceptance: true,
    ...metric,
    rpc: { ...metric, requests: 36, successes: 36, successfulRps: 3.6 },
    businessFlows: { ...metric, requests: 2, successes: 2 },
    completedBusinessFlows: 2,
    methods: { 'sales_order.get_sales_order': metric },
    limits: {
      p95Ms: 1000,
      p99Ms: 2000,
      minSuccessfulRps: 1,
      minMethodSamples: 5,
    },
  }))
  const lifecycle = {
    schemaVersion: 'plush-pressure-lifecycle/v1',
    profile: 'capacity',
    passed: true,
    commit,
    treeState: 'dirty',
    migration: '20260927100348',
    binarySHA256: fingerprint,
    buildSourceFingerprint: fingerprint,
    lifecycleSourceFingerprint: fingerprint,
    databaseName: 'owned',
    startedAt: '2026-10-02T10:00:00Z',
    completedAt: '2026-10-02T10:10:00Z',
    steps: [{ key: 'build', passed: true, durationMs: 4000 }],
    cleanup: { passed: true },
    failure: {
      step: 'engineering-pressure',
      message: 'secret=private /tmp/evidence',
    },
    evidenceDirectory: '/tmp/private',
    environment: {
      containers: [
        {
          service: 'postgres',
          imageID: `sha256:${fingerprint}`,
          memoryLimitBytes: 536870912,
          nanoCPUs: 2000000000,
          id: 'private',
        },
      ],
      backend: { gomaxprocs: 4, maxOpenConnections: 20 },
    },
  }
  const engineering = {
    schemaVersion: 'plush-pressure-report/v2',
    scope: 'isolated-engineering-business-pressure',
    profile: 'capacity',
    databaseName: 'owned',
    runtimeIdentity: { before: { commit, migration: '20260927100348', databaseName: 'owned' },
      after: { commit, migration: '20260927100348', databaseName: 'owned' } },
    levels,
    passed: true,
    dataLogicFingerprint: fingerprint,
    verificationFingerprint: fingerprint,
    loadFingerprint: fingerprint,
    competition: {
      passed: true,
      concurrency: 20,
      staleVersionRejected: true,
      unauthorizedRejected: true,
      singleSupplierResult: true,
      unknownOutcome: { replaySameVersionAndPurchases: true },
    },
    database: {
      before: {},
      after: { purchaseOrders: 6, inventoryTxns: 0 },
      consistency: true,
      sampling: { sampleCount: 4, sampleErrors: 0 },
    },
    runtime: { sampling: { sampleCount: 4, sampleErrors: 0 } },
    fingerprintsUnchanged: true,
    recovery: { accepted: true },
  }
  const reads = {
    ...engineering,
    scope: 'manual-acceptance-isolated-capacity-pressure',
  }
  return { lifecycle, engineering, reads }
}
function project(t) {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'plush-pressure-report-test-')
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, 'output/qa/pressure/run-one')
  mkdirSync(directory, { recursive: true })
  const data = fixture()
  for (const [name, value] of [
    ['lifecycle', data.lifecycle],
    ['engineering-pressure', data.engineering],
    ['read-pressure', data.reads],
  ]) {
    writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value))
  }
  return { root, directory, data }
}
test('projection separates counters and strips all raw diagnostics and runtime locations', () => {
  const { lifecycle, engineering, reads } = fixture()
  const report = projectDevPressureReport(
    'run-one',
    lifecycle,
    engineering,
    reads,
    source
  )
  assert.equal(report.status, 'passed')
  assert.equal(report.freshness, 'matched')
  assert.equal(report.engineering.levels[1].operations.requests, 20)
  assert.equal(report.engineering.levels[1].rpc.requests, 36)
  assert.equal(report.engineering.levels[1].completedBusinessFlows, 2)
  assert.equal(report.database.after.inventoryTxns, 0)
  assert.equal(report.database.before.inventoryTxns, null)
  assert.doesNotMatch(
    JSON.stringify(report),
    /secret=|\/tmp\/|databaseName|evidenceDirectory|private/u
  )
})
test('historical passes retain their result but source drift and missing identity never become current proof', () => {
  const { lifecycle, engineering, reads } = fixture()
  let report = projectDevPressureReport(
    'run-one',
    lifecycle,
    engineering,
    reads,
    { ...source, build: 'c'.repeat(64) }
  )
  assert.equal(report.status, 'passed')
  assert.equal(report.freshness, 'changed')
  assert.deepEqual(report.changed, ['build'])
  delete lifecycle.lifecycleSourceFingerprint
  report = projectDevPressureReport(
    'run-one',
    lifecycle,
    engineering,
    reads,
    source
  )
  assert.equal(report.freshness, 'unknown')
  assert.deepEqual(report.unknown, ['lifecycle'])
})
test('missing business reports, failed cleanup and foreign runtime evidence cannot pass', () => {
  const { lifecycle, engineering, reads } = fixture()
  assert.equal(
    projectDevPressureReport('run-one', lifecycle, null, reads, source).status,
    'incomplete'
  )
  assert.equal(
    projectDevPressureReport(
      'run-one',
      { ...lifecycle, cleanup: { passed: false } },
      engineering,
      reads,
      source
    ).status,
    'incomplete'
  )
  assert.throws(
    () =>
      projectDevPressureReport(
        'run-one',
        lifecycle,
        { ...engineering, databaseName: 'foreign' },
        reads,
        source
      ),
    /identity/u
  )
  assert.throws(
    () =>
      projectDevPressureReport(
        'run-one',
        lifecycle,
        engineering,
        { ...reads, schemaVersion: 'old' },
        source
      ),
    /schema/u
  )
})
test('fixed report directory supports CLI evidence, malformed siblings and bounded id selection', (t) => {
  const { root, directory } = project(t)
  assert.equal(
    readDevPressureReports(root, { currentSource: source }).report.id,
    'run-one'
  )
  const malformed = path.join(path.dirname(directory), 'broken')
  mkdirSync(malformed)
  writeFileSync(path.join(malformed, 'lifecycle.json'), '{')
  const result = readDevPressureReports(root, {
    id: 'run-one',
    currentSource: source,
  })
  assert.equal(result.reports.length, 1)
  assert.equal(result.invalidCount, 1)
  assert.equal(
    readDevPressureReports(root, { id: 'not-created-yet' }).report,
    null
  )
  for (const id of ['../private', '/tmp/private', 'run.one', 'x'.repeat(101)])
    { assert.throws(() => readDevPressureReports(root, { id }), /id/u) }
})
test('symlink reports, symlink ancestors and oversized files fail closed', (t) => {
  const { root, directory } = project(t)
  rmSync(path.join(directory, 'lifecycle.json'))
  const outside = path.join(root, 'private.json')
  writeFileSync(outside, JSON.stringify(fixture().lifecycle))
  symlinkSync(outside, path.join(directory, 'lifecycle.json'))
  assert.equal(readDevPressureReports(root).invalidCount, 1)
  rmSync(path.join(directory, 'lifecycle.json'))
  writeFileSync(
    path.join(directory, 'lifecycle.json'),
    'x'.repeat(1024 * 1024 + 1)
  )
  assert.equal(readDevPressureReports(root).invalidCount, 1)
  const linked = path.join(root, 'linked')
  mkdirSync(linked)
  symlinkSync(path.join(root, 'output'), path.join(linked, 'output'))
  assert.throws(() => readDevPressureReports(linked), /directory/u)
})
test('progress exposes fixed stages and counts while unfinished runs do not fabricate reports', (t) => {
  const { root, directory } = project(t)
  writeFileSync(
    path.join(directory, 'progress.json'),
    JSON.stringify({
      schemaVersion: 'plush-pressure-progress/v1',
      phase: 'engineering-data',
      status: 'running',
      updatedAt: '2026-10-02T10:10:00Z',
      completedSteps: ['build', 'secret'],
      completed: 20,
      total: 42,
      command: 'secret=private',
    })
  )
  const value = readDevPressureReports(root, { id: 'run-one' })
  assert.equal(value.progress.total, 42)
  assert.deepEqual(value.progress.completedSteps, ['build'])
  assert.equal(value.progress.command, undefined)
})

function scaleFixture(dataScale = 'baseline') {
  const data = fixture(); const
scale = PRESSURE_DATA_SCALES[dataScale]
  const orderCounts = (orders) => {
    const complexOrders = Math.ceil(orders / 3); const
ordinaryOrders = orders - complexOrders
    return { orders, ordinaryOrders, complexOrders, orderItems: ordinaryOrders + complexOrders * 8, demandSources: ordinaryOrders * 4 + complexOrders * 192 }
  }
  data.engineering.execution = { hardwareFingerprint: fingerprint }
  data.lifecycle.dataScale = dataScale
  data.lifecycle.environment.hostFingerprint = fingerprint
  data.lifecycle.environment.containers.push({ ...data.lifecycle.environment.containers[0], service: 'storage' })
  const { workflowTasks, productionFacts, financeFacts, attachments } = scale
  const target = { workflowTasks, productionFacts, financeFacts, attachments }
  data.lifecycle.readDataset = { target, actual: target }
  data.engineering.database.backgroundUnchanged = true
  data.engineering.dataset = { dataScale,
totalOrders: 262 + scale.historyOrders,
    counts: orderCounts(262),
history: { ...orderCounts(scale.historyOrders),
requests: scale.historyOrders * 0.8,
      approvedRequests: scale.historyOrders * 0.4,
purchaseOrders: scale.historyOrders * 0.8,
purchaseItems: scale.historyOrders * 1.2,
      states: { PREVIEW: scale.historyOrders * 0.2, SUBMITTED: scale.historyOrders * 0.2, BOSS_APPROVED: scale.historyOrders * 0.2, APPROVED: scale.historyOrders * 0.4 } },
    complexity: { ordinary: { lines: 1, bomParts: 4, sources: 4 }, complex: { lines: 8, bomParts: 24, sources: 192 } } }
  return data
}
const projectScale = (data, id = 'scale-run') => projectDevPressureReport(id, data.lifecycle, data.engineering, data.reads, source)
test('scale evidence separates background, pool, actual read counts and storage without exposing IDs', () => {
  const report = projectScale(scaleFixture())
  assert.equal(report.dataset.history.orders, 20)
  assert.equal(report.dataset.working.orders, 262)
  assert.equal(report.dataset.reads.actual.workflowTasks, 5000)
  assert.equal(report.dataset.storage.databaseBytes, null)
  assert.equal(report.checks.backgroundUnchanged, true)
  assert.match(report.comparisonKey, /^[a-f0-9]{64}$/u)
  const broken = scaleFixture()
  broken.lifecycle.readDataset.actual = { ...broken.lifecycle.readDataset.actual, workflowTasks: 1 }
  assert.equal(projectScale(broken).status, 'incomplete')
  assert.equal(projectScale(broken).comparisonKey, null)
  const previousTargets = scaleFixture()
  previousTargets.lifecycle.readDataset = { target: { workflowTasks: 5100, productionFacts: 2100, financeFacts: 2100, attachments: 1000 }, actual: { workflowTasks: 5100, productionFacts: 2100, financeFacts: 2100, attachments: 1000 } }
  assert.equal(projectScale(previousTargets).status, 'passed', 'saved target counts stay authoritative when the current recipe changes')
  broken.lifecycle.readDataset.actual.workflowTasks = 5000
  broken.engineering.database.backgroundUnchanged = false
  assert.equal(projectScale(broken).status, 'incomplete')
})
test('scale comparisons require the same candidate, load, working pool and measured environment', () => {
  const reference = projectScale(scaleFixture(), 'baseline')
  const baseline = { ...reference, dataScale: 'baseline', historyOrders: 20, main: reference.engineering.levels[1] }
  const data = scaleFixture('growth')
  data.engineering.levels = structuredClone(data.engineering.levels)
  data.engineering.levels[1].successfulRps = 1
  data.engineering.levels[1].methods['sales_order.get_sales_order'].successfulLatencyMs.p95 = 200
  const growth = projectScale(data, 'growth')
  assert.equal(growth.comparisonKey, reference.comparisonKey)
  const comparison = comparePressureScale(growth, baseline)
  assert.equal(comparison.reason, null)
  assert.equal(comparison.throughput, -50)
  assert.equal(comparison.methods[0].p95, 100)
  for (const mutate of [
    (f) => f.lifecycle.environment.hostFingerprint = 'c'.repeat(64),
    (f) => f.engineering.execution.hardwareFingerprint = 'c'.repeat(64),
    (f) => f.lifecycle.environment.containers[0].memoryLimitBytes *= 2,
    (f) => f.lifecycle.environment.backend.maxOpenConnections++,
    (f) => f.lifecycle.buildSourceFingerprint = 'c'.repeat(64),
    (f) => f.engineering.levels[1].pacingMs++,
  ]) {
    const mismatch = scaleFixture('growth'); mutate(mismatch)
    assert.match(comparePressureScale(projectScale(mismatch), baseline).reason, /源码、负载或运行环境不同/u)
  }
  const missing = scaleFixture('growth'); delete missing.lifecycle.environment.hostFingerprint
  assert.equal(projectScale(missing).comparisonKey, null)
  assert.match(comparePressureScale({ ...growth, status: 'failed' }, baseline).reason, /完整通过/u)
  assert.match(comparePressureScale(reference, baseline).reason, /另一数据规模/u)
})
