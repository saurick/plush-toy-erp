import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PRESSURE_DATA_SCALES } from '../src/dev-workbench/config/devPressureData.mjs'
import {
  pressureBuildSourceFingerprint,
  PRESSURE_LIFECYCLE_FILES,
} from '../../scripts/qa/pressure-isolated-lifecycle.mjs'
import { ENGINEERING_DATA_FILES } from '../../scripts/qa/pressure-engineering-data.mjs'
import { ENGINEERING_VERIFICATION_FILES } from '../../scripts/qa/pressure-engineering-scenario.mjs'
import { LOAD_LOGIC_FILES } from '../../scripts/qa/engineering-pressure.mjs'
import { pressureLogicFingerprint } from '../../scripts/qa/pressure-runtime.mjs'

export const DEV_PRESSURE_REPORT_SCHEMA = 'plush.dev-pressure-reports/v1'
export const PRESSURE_REPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u
const HASH = /^[0-9a-f]{64}$/u
const COMMIT = /^[0-9a-f]{40,64}$/u
const PHASES = new Set([
  'build',
  'containers',
  'migration',
  'backend',
  'seed',
  'read-dataset-config',
  'read-pressure',
  'engineering-data',
  'engineering-pressure',
  'cleanup',
])
const LEVELS = new Set(['ramp', 'capacity', 'recovery'])
const number = (value) => (Number.isFinite(value) && value >= 0 ? value : null)
const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null
const hash = (value) => (HASH.test(String(value || '')) ? value : null)
const date = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null
const boolean = (value) => (typeof value === 'boolean' ? value : null)

function reportRoot(root) {
  let directory = root
  for (const part of ['output', 'qa', 'pressure']) {
    directory = path.join(directory, part)
    if (!existsSync(directory)) return null
    const stats = lstatSync(directory)
    if (!stats.isDirectory() || stats.isSymbolicLink())
      { throw new Error('pressure report directory is invalid') }
  }
  return directory
}

function readJson(directory, name) {
  const file = path.join(directory, name)
  if (!existsSync(file)) return null
  const stats = lstatSync(file)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024 * 1024)
    { throw new Error('pressure report file is invalid') }
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function readCurrentPressureSource(root, commit) {
  return {
    commit,
    build: pressureBuildSourceFingerprint(path.join(root, 'server')),
    data: pressureLogicFingerprint(ENGINEERING_DATA_FILES, root),
    verification: pressureLogicFingerprint(
      ENGINEERING_VERIFICATION_FILES,
      root
    ),
    load: pressureLogicFingerprint(LOAD_LOGIC_FILES, root),
    lifecycle: pressureLogicFingerprint(PRESSURE_LIFECYCLE_FILES, root),
  }
}

function projectLevel(level) {
  if (!LEVELS.has(level?.key)) throw new Error('pressure level is invalid')
  const metrics = (value) => ({
    requests: count(value?.requests),
    successes: count(value?.successes),
    failures: count(value?.failures),
    successfulRps: number(value?.successfulRps),
    p95Ms: number(value?.successfulLatencyMs?.p95),
    p99Ms: number(value?.successfulLatencyMs?.p99),
  })
  return {
    key: level.key,
    concurrency: count(level.concurrency),
    elapsedMs: number(level.elapsedMs),
    targetDurationMs: number(level.targetDurationMs),
    pacingMs: number(level.pacingMs),
    accepted: typeof level.acceptance === 'boolean' ? level.acceptance : null,
    operations: metrics(level),
    rpc: metrics(level.rpc),
    flows: metrics(level.businessFlows),
    completedBusinessFlows: count(level.completedBusinessFlows),
    methods: Object.entries(level.methods || {})
      .filter(([name]) => /^[a-z_]+\.[a-z_]+$/u.test(name))
      .slice(0, 40)
      .map(([name, value]) => ({ name, ...metrics(value) })),
    limits: {
      p95Ms: number(level.limits?.p95Ms),
      p99Ms: number(level.limits?.p99Ms),
      minSuccessfulRps: number(level.limits?.minSuccessfulRps),
      minMethodSamples: count(level.limits?.minMethodSamples),
    },
  }
}

function pressureDetail(report, lifecycle, scope) {
  if (!report) return null
  const identities = [report.runtimeIdentity?.before, report.runtimeIdentity?.after]
  const identityMatches = identities.every((identity) => identity && identity.commit === lifecycle.commit &&
    identity.migration === lifecycle.migration && identity.databaseName === lifecycle.databaseName)
  if (
    report.schemaVersion !== 'plush-pressure-report/v2' ||
    report.scope !== scope ||
    report.profile !==
      (scope === 'isolated-engineering-business-pressure'
        ? lifecycle.profile
        : 'capacity') ||
    report.databaseName !== lifecycle.databaseName ||
    report.runtimeIdentity?.before?.commit !== lifecycle.commit ||
    !Array.isArray(report.levels) ||
    report.levels.length > 3 ||
    typeof report.passed !== 'boolean'
  ) {
    throw new Error('pressure report identity or schema is invalid')
  }
  const levels = report.levels.map(projectLevel)
  if (new Set(levels.map(({ key }) => key)).size !== levels.length)
    { throw new Error('pressure report levels are duplicated') }
  const complete =
    levels.length === 3 &&
    levels.every(
      (level) =>
        level.accepted === true &&
        level.elapsedMs > 0 &&
        level.operations.requests > 0 &&
        level.operations.failures === 0 &&
        level.rpc.requests > 0 &&
        level.rpc.failures === 0 &&
        level.operations.successfulRps >= level.limits.minSuccessfulRps &&
        level.methods.length > 0 &&
        level.methods.every(
          (method) =>
            method.successes >= level.limits.minMethodSamples &&
            method.failures === 0 &&
            method.p95Ms !== null &&
            method.p99Ms !== null &&
            method.p95Ms <= level.limits.p95Ms &&
            method.p99Ms <= level.limits.p99Ms
        )
    ) &&
    (scope !== 'isolated-engineering-business-pressure' ||
      lifecycle.profile !== 'capacity' ||
      levels.find((level) => level.key === 'capacity')?.elapsedMs >= 600000)
  return { passed: report.passed && complete && identityMatches, levels }
}

function projectDataset(lifecycle, engineering) {
  const raw = engineering?.dataset
  if (!Object.hasOwn(PRESSURE_DATA_SCALES, raw?.dataScale) || lifecycle.dataScale !== raw.dataScale) return null
  const counts = (value, keys) => Object.fromEntries(keys.map((key) => [key, count(value?.[key])]))
  const orderKeys = ['orders', 'ordinaryOrders', 'complexOrders', 'orderItems', 'demandSources']
  const readKeys = ['workflowTasks', 'productionFacts', 'financeFacts', 'attachments']
  const dataset = {
    dataScale: raw.dataScale,
totalOrders: count(raw.totalOrders),
    working: counts(raw.counts, orderKeys),
    history: { ...counts(raw.history, [...orderKeys, 'requests', 'approvedRequests', 'purchaseOrders', 'purchaseItems']),
      states: counts(raw.history?.states, ['PREVIEW', 'SUBMITTED', 'BOSS_APPROVED', 'APPROVED']) },
    reads: { target: counts(lifecycle.readDataset?.target, readKeys), actual: counts(lifecycle.readDataset?.actual, readKeys) },
    complexity: Object.fromEntries(['ordinary', 'complex'].map((key) => [key, counts(raw.complexity?.[key], ['lines', 'bomParts', 'sources'])])),
    storage: counts(engineering?.database?.before?.storage, ['databaseBytes', 'businessTableBytes']),
  }
  const nonnegativeCounts = (values) => Object.values(values).every((value) => Number.isSafeInteger(value) && value >= 0)
  if (!nonnegativeCounts(dataset.working) || !nonnegativeCounts(counts(raw.history, [...orderKeys, 'requests', 'approvedRequests', 'purchaseOrders', 'purchaseItems'])) ||
      !nonnegativeCounts(dataset.history.states) || !nonnegativeCounts(dataset.reads.actual) || !nonnegativeCounts(dataset.reads.target) ||
      !Object.values(dataset.complexity).every(nonnegativeCounts) ||
      dataset.history.orders < 1 || dataset.working.orders < 10 ||
      dataset.totalOrders !== dataset.history.orders + dataset.working.orders ||
      dataset.history.ordinaryOrders + dataset.history.complexOrders !== dataset.history.orders ||
      dataset.working.ordinaryOrders + dataset.working.complexOrders !== dataset.working.orders ||
      Object.values(dataset.history.states).reduce((sum, value) => sum + value, 0) !== dataset.history.orders ||
      dataset.history.requests !== dataset.history.orders - dataset.history.states.PREVIEW ||
      dataset.history.approvedRequests !== dataset.history.states.APPROVED ||
      !['history', 'working'].every((key) => dataset[key].orderItems === dataset[key].ordinaryOrders * dataset.complexity.ordinary.lines + dataset[key].complexOrders * dataset.complexity.complex.lines &&
        dataset[key].demandSources === dataset[key].ordinaryOrders * dataset.complexity.ordinary.sources + dataset[key].complexOrders * dataset.complexity.complex.sources) ||
      !readKeys.every((key) => dataset.reads.target[key] > 0 && dataset.reads.actual[key] >= dataset.reads.target[key])) return null
  return dataset
}
function comparisonKey(lifecycle, engineering, candidate, dataset) {
  if (!dataset || !hash(lifecycle.environment?.hostFingerprint) || !hash(engineering?.execution?.hardwareFingerprint) || !candidate.commit || !candidate.migration ||
      Object.values(candidate.fingerprints).some((value) => !value) ||
      !engineering?.levels?.length || !lifecycle.environment?.containers?.length) return null
  const containers = lifecycle.environment.containers
    .map(({ service, imageID, memoryLimitBytes, nanoCPUs }) => ({ service, imageID, memoryLimitBytes, nanoCPUs }))
    .sort((a, b) => a.service.localeCompare(b.service))
  if (!['postgres', 'storage'].every((name) => containers.some((item) => item.service === name && /^sha256:[a-f0-9]{64}$/u.test(item.imageID) && item.memoryLimitBytes > 0 && item.nanoCPUs > 0))) return null
  const inputs = { candidate: { commit: candidate.commit, migration: candidate.migration, fingerprints: candidate.fingerprints },
    environment: { host: lifecycle.environment.hostFingerprint, loadRuntime: engineering.execution.hardwareFingerprint, containers, backend: lifecycle.environment.backend },
    profile: lifecycle.profile,
working: dataset.working,
complexity: dataset.complexity,
    load: engineering.levels.map(({ key, concurrency, pacingMs, targetDurationMs, requests, limits }) =>
      ({ key, concurrency, pacingMs, targetDurationMs, requestBudget: targetDurationMs ? null : requests, limits })) }
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

export function projectDevPressureReport(
  id,
  lifecycle,
  engineering,
  reads,
  currentSource
) {
  if (
    lifecycle?.schemaVersion !== 'plush-pressure-lifecycle/v1' ||
    !['quick', 'capacity'].includes(lifecycle.profile) ||
    typeof lifecycle.passed !== 'boolean' ||
    !Array.isArray(lifecycle.steps) ||
    !date(lifecycle.startedAt) ||
    !date(lifecycle.completedAt)
  )
    { throw new Error('pressure lifecycle is invalid') }
  const candidate = {
    commit: COMMIT.test(String(lifecycle.commit || ''))
      ? lifecycle.commit
      : null,
    treeState: ['dirty', 'clean'].includes(lifecycle.treeState)
      ? lifecycle.treeState
      : null,
    migration: /^\d{14}$/u.test(String(lifecycle.migration || ''))
      ? lifecycle.migration
      : null,
    binarySHA256: hash(lifecycle.binarySHA256),
    fingerprints: {
      build: hash(lifecycle.buildSourceFingerprint),
      data: hash(engineering?.dataLogicFingerprint),
      verification: hash(engineering?.verificationFingerprint),
      load: hash(engineering?.loadFingerprint),
      lifecycle: hash(lifecycle.lifecycleSourceFingerprint),
    },
  }
  const sourceKeys = ['build', 'data', 'verification', 'load', 'lifecycle']
  const unknown = sourceKeys.filter(
    (key) => !candidate.fingerprints[key] || !currentSource?.[key]
  )
  if (!candidate.commit || !currentSource?.commit) unknown.push('commit')
  const changed = sourceKeys.filter(
    (key) =>
      candidate.fingerprints[key] &&
      currentSource?.[key] &&
      candidate.fingerprints[key] !== currentSource[key]
  )
  if (
    candidate.commit &&
    currentSource?.commit &&
    candidate.commit !== currentSource.commit
  )
    { changed.push('commit') }
  const business = pressureDetail(
    engineering,
    lifecycle,
    'isolated-engineering-business-pressure'
  )
  const read = pressureDetail(
    reads,
    lifecycle,
    'manual-acceptance-isolated-capacity-pressure'
  )
  const dataset = projectDataset(lifecycle, engineering)
  const cleanup = lifecycle.cleanup?.passed === true
  const passed =
    lifecycle.passed &&
    (!lifecycle.dataScale || (dataset !== null && engineering?.database?.backgroundUnchanged === true)) &&
    business?.passed === true &&
    read?.passed === true &&
    cleanup &&
    engineering?.competition?.passed === true &&
    engineering?.database?.consistency === true &&
    engineering?.recovery?.accepted === true &&
    engineering?.fingerprintsUnchanged === true &&
    engineering?.database?.sampling?.sampleCount > 0 &&
    engineering?.database?.sampling?.sampleErrors === 0 &&
    engineering?.runtime?.sampling?.sampleCount > 0 &&
    engineering?.runtime?.sampling?.sampleErrors === 0
  const ledgerKeys = [
    'requests',
    'approvedRequests',
    'demandItems',
    'purchaseOrders',
    'purchaseItems',
    'duplicateSupplierResults',
    'partialSupplierResults',
    'invalidPurchaseLines',
    'inventoryTxns',
    'postedReceipts',
    'productionFacts',
    'financeFacts',
  ]
  const ledger = (value) =>
    Object.fromEntries(ledgerKeys.map((key) => [key, count(value?.[key])]))
  const competition = engineering?.competition
  const db = engineering?.database?.sampling
  const runtime = engineering?.runtime?.sampling
  return {
    id,
    dataset,
    comparisonKey: comparisonKey(lifecycle, engineering, candidate, dataset),
    profile: lifecycle.profile,
    startedAt: date(lifecycle.startedAt),
    completedAt: date(lifecycle.completedAt),
    status: passed ? 'passed' : lifecycle.passed ? 'incomplete' : 'failed',
    freshness: changed.length
      ? 'changed'
      : unknown.length
        ? 'unknown'
        : 'matched',
    changed,
    unknown,
    candidate,
    engineering: business,
    reads: read,
    failureStage: PHASES.has(lifecycle.failure?.step)
      ? lifecycle.failure.step
      : lifecycle.failure
        ? 'unknown'
        : null,
    steps: lifecycle.steps
      .filter((step) => PHASES.has(step?.key))
      .slice(0, 12)
      .map((step) => ({
        key: step.key,
        durationMs: number(step.durationMs),
        passed: step.passed === true,
      })),
    checks: {
      competition: boolean(competition?.passed),
      concurrency: count(competition?.concurrency),
      staleVersionRejected: boolean(competition?.staleVersionRejected),
      unauthorizedRejected: boolean(competition?.unauthorizedRejected),
      singleSupplierResult: boolean(competition?.singleSupplierResult),
      replyReplay: boolean(
        competition?.unknownOutcome?.replaySameVersionAndPurchases
      ),
      backgroundUnchanged: boolean(engineering?.database?.backgroundUnchanged),
      databaseConsistency: boolean(engineering?.database?.consistency),
      recovery: boolean(engineering?.recovery?.accepted),
      cleanup: boolean(lifecycle.cleanup?.passed),
    },
    database: {
      before: ledger(engineering?.database?.before),
      after: ledger(engineering?.database?.after),
      samples: count(db?.sampleCount),
      sampleErrors: count(db?.sampleErrors),
      deadlocks: count(db?.maxDeadlocks),
      conflicts: count(db?.maxConflicts),
      maxConnections: count(db?.maxBackends),
      maxLockWaiters: count(db?.maxLockWaiters),
      tempBytes: count(Number(db?.last?.temp_bytes) - Number(db?.first?.temp_bytes)),
      tempFiles: count(Number(db?.last?.temp_files) - Number(db?.first?.temp_files)),
    },
    runtime: {
      samples: count(runtime?.sampleCount),
      sampleErrors: count(runtime?.sampleErrors),
      maxHeapBytes: count(runtime?.maximum?.plush_erp_go_heap_alloc_bytes),
      maxConnections: count(runtime?.maximum?.plush_erp_db_connections_open),
      maxGoroutines: count(runtime?.maximum?.plush_erp_go_goroutines),
    },
    environment: {
      containers: (lifecycle.environment?.containers || [])
        .filter((item) => ['postgres', 'storage'].includes(item.service))
        .map((item) => ({
          service: item.service,
          memoryLimitBytes: count(item.memoryLimitBytes),
          nanoCPUs: count(item.nanoCPUs),
          imageID: /^sha256:[0-9a-f]{64}$/u.test(String(item.imageID || ''))
            ? item.imageID
            : null,
        })),
      backend: {
        gomaxprocs: count(lifecycle.environment?.backend?.gomaxprocs),
        maxOpenConnections: count(
          lifecycle.environment?.backend?.maxOpenConnections
        ),
      },
    },
  }
}

function publicProgress(value) {
  if (!value) return null
  if (
    value.schemaVersion !== 'plush-pressure-progress/v1' ||
    !PHASES.has(value.phase) ||
    !date(value.updatedAt) ||
    !['running', 'completed', 'failed'].includes(value.status)
  )
    { throw new Error('pressure progress is invalid') }
  return {
    phase: value.phase,
    status: value.status,
    updatedAt: date(value.updatedAt),
    stage: [
      'ramp',
      'capacity',
      'recovery',
      'competition',
      'orders',
      'samples',
      'history',
    ].includes(value.stage)
      ? value.stage
      : null,
    completedSteps: (value.completedSteps || [])
      .filter((key) => PHASES.has(key))
      .slice(0, 12),
    completed: count(value.completed),
    total: count(value.total),
    targetDurationMs: number(value.targetDurationMs),
  }
}

export function readDevPressureReports(
  root,
  { id = '', currentSource = null } = {}
) {
  if (id && !PRESSURE_REPORT_ID_PATTERN.test(id))
    { throw new Error('pressure report id is invalid') }
  const directory = reportRoot(path.resolve(root))
  const empty = {
    schemaVersion: DEV_PRESSURE_REPORT_SCHEMA,
    reports: [],
    report: null,
    progress: null,
    invalidCount: 0,
  }
  if (!directory) return empty
  // The browser chooses a bounded identifier. It never supplies a filesystem path.
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && PRESSURE_REPORT_ID_PATTERN.test(entry.name)
    )
    .map((entry) => ({
      id: entry.name,
      modified: lstatSync(path.join(directory, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.modified - a.modified)
    .slice(0, 60)
  if (id && !entries.some((entry) => entry.id === id))
    { entries.push({ id, modified: 0 }) }
  const valid = []
  let progress = null
    let invalidCount = 0
  for (const entry of entries) {
    const child = path.join(directory, entry.id)
    if (!existsSync(child)) continue
    const stats = lstatSync(child)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      invalidCount++
      continue
    }
    try {
      if (entry.id === id)
        { progress = publicProgress(readJson(child, 'progress.json')) }
      const lifecycle = readJson(child, 'lifecycle.json')
      if (!lifecycle) continue
      valid.push(
        projectDevPressureReport(
          entry.id,
          lifecycle,
          readJson(child, 'engineering-pressure.json'),
          readJson(child, 'read-pressure.json'),
          currentSource
        )
      )
    } catch {
      invalidCount++
    }
  }
  valid.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  return {
    ...empty,
    invalidCount,
    progress,
    reports: valid.map(
      ({
        id: reportId,
        profile,
        startedAt,
        completedAt,
        status,
        freshness,
        dataset,
        comparisonKey,
        engineering,
      }) => ({
        id: reportId,
        profile,
        startedAt,
        completedAt,
        status,
        freshness,
        dataScale: dataset?.dataScale || null,
        historyOrders: dataset?.history.orders ?? null,
        comparisonKey,
        main: engineering?.levels.find((level) => level.key === 'capacity') || null,
      })
    ),
    report: id
      ? valid.find((report) => report.id === id) || null
      : valid[0] || null,
  }
}
