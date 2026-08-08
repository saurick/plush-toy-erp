import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'

import {
  QUALITY_GATE_TIMEOUT_MS,
  buildDevQualityGateCommand,
  createDevQualityGateMiddleware,
  createDevQualityGatePlugin,
  createDevQualityGateService,
  validateDevQualityGateAction,
  validateDevQualityGateCancel,
} from './devQualityGatePlugin.mjs'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const ID_TWO = '123e4567-e89b-42d3-a456-426614174001'
const REPOSITORY = Object.freeze({
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const DATABASE_ENV = Object.freeze({
  PATH: '/usr/local/bin',
  DISPOSABLE_DATABASE_BASE_URL:
    'postgres://tester:local-fixture@127.0.0.1:55433/postgres?sslmode=disable',
})

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function middlewareResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = String(body)
    },
  }
}

function middlewareRequest({ body = '', headers = {}, method, url }) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.url = url
  request.headers = { host: '127.0.0.1:5175', ...headers }
  request.socket = { remoteAddress: '127.0.0.1' }
  return request
}

async function project(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-quality-plugin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function formalReceipt(profile = 'strict') {
  const stages = profile === 'strict' ? ['strict_profile', 'web'] : ['web']
  return {
    profile,
    gate: profile,
    status: 'passed',
    gitCommit: REPOSITORY.commit,
    treeState: 'dirty',
    startedAt: '2026-08-09T10:00:00.000Z',
    finishedAt: '2026-08-09T10:00:02.000Z',
    durationMs: 2000,
    executed: 12,
    passed: 12,
    failed: 0,
    skipped: 0,
    environmentFingerprint: 'c'.repeat(64),
    metrics: {
      stageTimings: stages.map((id, index) => ({
        id,
        label: id === 'web' ? 'Web 测试与构建' : '严格门禁配置',
        status: 'passed',
        durationMs: index + 1,
      })),
      bottleneckStageId: 'web',
    },
  }
}

test('quality gate action accepts only fixed full or strict intent', () => {
  const action = {
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  }
  assert.equal(validateDevQualityGateAction(action), action)
  assert.equal(
    validateDevQualityGateCancel({ action: 'cancel' }).action,
    'cancel'
  )
  assert.throws(() =>
    validateDevQualityGateAction({
      ...action,
      command: 'bash arbitrary.sh',
    })
  )
  for (const payload of [
    { ...action.payload, profile: 'shell' },
    { ...action.payload, path: '/tmp/run' },
    { ...action.payload, env: { TOKEN: 'value' } },
    { ...action.payload, gitRef: 'main' },
    { ...action.payload, dsn: 'database' },
  ]) {
    assert.throws(() =>
      validateDevQualityGateAction({ action: 'run', payload })
    )
  }
})

test('quality gate command uses only the formal receipt runner', () => {
  assert.deepEqual(
    buildDevQualityGateCommand({
      environment: DATABASE_ENV,
      nodeRuntime: '/pinned/node',
      profile: 'strict',
      projectRoot: '/repo',
    }).args,
    ['scripts/qa/run-gate-with-receipt.mjs', '--gate', 'strict']
  )
  assert.equal(QUALITY_GATE_TIMEOUT_MS.full, 90 * 60 * 1000)
  assert.equal(QUALITY_GATE_TIMEOUT_MS.strict, 180 * 60 * 1000)
})

test('quality gate service streams stages, persists formal proof and releases the lock', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let processSpec
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => formalReceipt('strict'),
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    launchProcess(spec) {
      processSpec = spec
      return {
        pid: 43210,
        completion: completion.promise,
        killGroup() {},
      }
    },
    now: () => new Date('2026-08-09T10:00:02.000Z'),
  })
  const started = await service.act({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })
  assert.equal(started.operation.status, 'running')
  const reused = await service.act({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })
  assert.equal(reused.reused, true)
  assert.equal(reused.operation.id, started.operation.id)
  processSpec.onLine('[qa:stage] gate=strict id=strict_profile status=running')
  processSpec.onLine(
    '[qa:stage] gate=strict id=strict_profile status=passed durationMs=10'
  )
  completion.resolve({ code: 0, signal: '' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  const finished = service.readOperation(ID)
  assert.equal(finished.status, 'passed')
  assert.equal(finished.receipt.executed, 12)
  assert.equal(finished.cleanup.status, 'complete')
  const summary = await service.summary()
  assert.equal(summary.busy.active, false)
  assert.deepEqual(summary.repository, REPOSITORY)
  assert.equal(summary.proofs.strict.current, true)
  assert.equal(summary.proofs.strict.releaseEligible, false)
  assert.match(summary.status.title, /未提交改动/u)
})

test('quality gate preserves the first failed fixed Web substep', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let processSpec
  const failedReceipt = {
    ...formalReceipt('strict'),
    status: 'failed',
    passed: 11,
    failed: 1,
  }
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => failedReceipt,
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    launchProcess(spec) {
      processSpec = spec
      return {
        pid: 43218,
        completion: completion.promise,
        killGroup() {},
      }
    },
    now: () => new Date('2026-08-09T10:00:02.000Z'),
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })
  processSpec.onLine('[qa:stage] gate=strict id=web status=running')
  processSpec.onLine(
    '[qa:substep] gate=strict stage=web id=production_build status=running'
  )
  processSpec.onLine(
    '[qa:substep] gate=strict stage=web id=production_build status=failed durationMs=9'
  )
  processSpec.onLine(
    '[qa:stage] gate=strict id=web status=failed durationMs=20'
  )
  completion.resolve({ code: 1, signal: '' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  const finished = service.readOperation(ID)
  assert.equal(finished.status, 'failed')
  assert.equal(
    finished.firstFailure,
    'Web 测试与生产构建：Web 生产构建未通过'
  )
  assert.doesNotMatch(finished.firstFailure, /\/|command|environment/iu)
  assert.equal(finished.cleanup.status, 'complete')
})

test('quality gate cancel waits for database and process cleanup readback', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let processSpec
  let killedWith = ''
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => null,
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    launchProcess(spec) {
      processSpec = spec
      return {
        pid: 43211,
        completion: completion.promise,
        killGroup(signal) {
          killedWith = signal
        },
      }
    },
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'full',
      idempotencyKey: `quality-gate:full:${ID}`,
    },
  })
  processSpec.onLine('[qa:stage] gate=full id=server status=running')
  processSpec.onLine(
    '[disposable-database] status=failed run=fixture cleanup=complete report=redacted'
  )
  const cancelling = await service.cancel(ID, { action: 'cancel' })
  assert.equal(cancelling.operation.status, 'cancelling')
  assert.equal(killedWith, 'SIGTERM')
  completion.resolve({ code: null, signal: 'SIGTERM' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  const cancelled = service.readOperation(ID)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.cleanup.status, 'complete')
})

test('quality gate never reports pass when database cleanup readback is missing', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let processSpec
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => formalReceipt('full'),
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    launchProcess(spec) {
      processSpec = spec
      return {
        pid: 43214,
        completion: completion.promise,
        killGroup() {},
      }
    },
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'full',
      idempotencyKey: `quality-gate:full:${ID}`,
    },
  })
  processSpec.onLine('[qa:stage] gate=full id=server status=running')
  processSpec.onLine(
    '[qa:stage] gate=full id=server status=passed durationMs=20'
  )
  completion.resolve({ code: 0, signal: '' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  const finished = service.readOperation(ID)
  assert.equal(finished.status, 'failed')
  assert.equal(finished.cleanup.status, 'failed')
  assert.match(finished.firstFailure, /清理读回/u)
  assert.doesNotMatch(
    finished.firstFailure,
    /隔离数据库、迁移与 Server 测试未通过/u
  )
})

test('quality gate keeps the lock until a partially started process group is cleaned', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let killedWith = ''
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    attachExecutionChild() {
      throw new Error('simulated lock persistence failure')
    },
    launchProcess: () => ({
      pid: 43215,
      completion: completion.promise,
      killGroup(signal) {
        killedWith = signal
      },
    }),
  })

  const started = await service.act({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })
  assert.equal(started.operation.status, 'running')
  assert.equal(killedWith, 'SIGTERM')
  assert.equal((await service.summary()).busy.active, true)

  completion.resolve({ code: null, signal: 'SIGTERM' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  const finished = service.readOperation(ID)
  assert.equal(finished.status, 'failed')
  assert.equal(finished.cleanup.status, 'complete')
  assert.equal((await service.summary()).busy.active, false)
})

test('quality gate cleans a residual process group and refuses a false pass', async (t) => {
  const root = await project(t)
  const completion = deferred()
  const killSignals = []
  let groupChecks = 0
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => formalReceipt('strict'),
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => {
      groupChecks += 1
      return groupChecks === 1
    },
    waitForProcessReadback: async () => {},
    launchProcess: () => ({
      pid: 43216,
      completion: completion.promise,
      killGroup(signal) {
        killSignals.push(signal)
      },
    }),
    now: () => new Date('2026-08-09T10:00:02.000Z'),
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })

  completion.resolve({ code: 0, signal: '' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  const finished = service.readOperation(ID)
  assert.equal(finished.status, 'failed')
  assert.equal(finished.cleanup.status, 'complete')
  assert.match(finished.firstFailure, /残留进程组/u)
  assert.deepEqual(killSignals, ['SIGTERM'])
  assert.equal((await service.summary()).busy.active, false)
})

test('quality gate timeout uses the fixed timer and remains a distinct terminal state', async (t) => {
  const root = await project(t)
  const completion = deferred()
  const timers = []
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    readReceipt: () => null,
    resolveNodeRuntime: () => '/pinned/node',
    processGroupAlive: () => false,
    launchProcess: () => ({
      pid: 43212,
      completion: completion.promise,
      killGroup() {},
    }),
    setTimer(callback, delay) {
      const timer = { callback, delay }
      timers.push(timer)
      return timer
    },
    clearTimer() {},
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'full',
      idempotencyKey: `quality-gate:full:${ID}`,
    },
  })
  assert.equal(timers[0].delay, QUALITY_GATE_TIMEOUT_MS.full)
  timers[0].callback()
  await new Promise((resolve) => setImmediate(resolve))
  completion.resolve({ code: null, signal: 'SIGTERM' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(service.readOperation(ID).status, 'timed_out')
})

test('quality gate service blocks missing database readiness and concurrent profiles', async (t) => {
  const root = await project(t)
  const blocked = createDevQualityGateService({
    projectRoot: root,
    env: {},
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
  })
  await assert.rejects(
    () =>
      blocked.act({
        action: 'run',
        payload: {
          profile: 'strict',
          idempotencyKey: `quality-gate:strict:${ID}`,
        },
      }),
    (error) => error?.code === 'DEV_QUALITY_GATE_ENVIRONMENT_BLOCKED'
  )

  const completion = deferred()
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    resolveNodeRuntime: () => '/pinned/node',
    launchProcess: () => ({
      pid: 43213,
      completion: completion.promise,
      killGroup() {},
    }),
    setTimer: () => null,
    clearTimer() {},
  })
  await service.act({
    action: 'run',
    payload: {
      profile: 'full',
      idempotencyKey: `quality-gate:full:${ID}`,
    },
  })
  await assert.rejects(
    () =>
      service.act({
        action: 'run',
        payload: {
          profile: 'strict',
          idempotencyKey: `quality-gate:strict:${ID_TWO}`,
        },
      }),
    (error) => error?.code === 'DEV_QA_EXECUTION_LOCKED'
  )
})

test('quality gate summary distinguishes a current failed receipt from an old result', async (t) => {
  const root = await project(t)
  const cleanRepository = {
    ...REPOSITORY,
    dirty: false,
    fingerprint: 'd'.repeat(64),
  }
  const failedReceipt = {
    ...formalReceipt('strict'),
    status: 'failed',
    treeState: 'clean',
    passed: 11,
    failed: 1,
  }
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    readRepositoryState: async () => cleanRepository,
    readReceipt: (profile) => (profile === 'strict' ? failedReceipt : null),
  })

  const summary = await service.summary()
  assert.equal(summary.proofs.strict.current, true)
  assert.equal(summary.proofs.strict.status, 'failed')
  assert.equal(summary.proofs.strict.releaseEligible, false)
  assert.equal(summary.proofs.strict.reused, false)
  assert.match(summary.status.title, /当前版本.*未通过/u)
  assert.doesNotMatch(summary.status.title, /旧版本/u)
})

test('quality gate summary reuses only a passed receipt for the current clean SHA', async (t) => {
  const root = await project(t)
  const cleanRepository = {
    ...REPOSITORY,
    dirty: false,
    fingerprint: 'd'.repeat(64),
  }
  const passedReceipt = {
    ...formalReceipt('strict'),
    treeState: 'clean',
  }
  const service = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    readRepositoryState: async () => cleanRepository,
    readReceipt: (profile) => (profile === 'strict' ? passedReceipt : null),
  })

  const summary = await service.summary()
  assert.equal(summary.proofs.strict.current, true)
  assert.equal(summary.proofs.strict.releaseEligible, true)
  assert.equal(summary.proofs.strict.reused, true)
  assert.equal(summary.status.tone, 'success')
})

test('quality gate recovery stops an orphaned process group and then fails closed', async (t) => {
  const root = await project(t)
  const completion = deferred()
  const original = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    processId: 9001,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    resolveNodeRuntime: () => '/pinned/node',
    launchProcess: () => ({
      pid: 43217,
      completion: completion.promise,
      killGroup() {},
    }),
    setTimer: () => null,
    clearTimer() {},
  })
  await original.act({
    action: 'run',
    payload: {
      profile: 'full',
      idempotencyKey: `quality-gate:full:${ID}`,
    },
  })

  let childAlive = true
  const killed = []
  let forceStop
  const recovered = createDevQualityGateService({
    projectRoot: root,
    env: DATABASE_ENV,
    readRepositoryState: async () => REPOSITORY,
    processAlive: (pid) => pid === 43217 && childAlive,
    killOrphanedProcessGroup(pid, signal) {
      killed.push([pid, signal])
      if (signal === 'SIGKILL') childAlive = false
    },
    setTimer(callback, delay) {
      forceStop = { callback, delay }
      return forceStop
    },
    clearTimer() {},
  })
  const stopping = await recovered.summary()
  assert.equal(stopping.currentOperation.status, 'cancelling')
  assert.deepEqual(killed, [[43217, 'SIGTERM']])
  assert.equal(forceStop.delay, 120_000)

  forceStop.callback()
  assert.deepEqual(killed, [
    [43217, 'SIGTERM'],
    [43217, 'SIGKILL'],
  ])

  const closed = await recovered.summary()
  assert.equal(closed.currentOperation, null)
  assert.equal(closed.operations[0].status, 'not_proven')
  assert.equal(closed.operations[0].cleanup.status, 'failed')
  assert.equal(closed.busy.active, false)
})

test('quality gate middleware is loopback-only and plugin remains serve-only', async () => {
  const middleware = createDevQualityGateMiddleware({
    service: { summary: async () => ({ status: 'ok' }) },
  })
  const response = middlewareResponse()
  await middleware(
    {
      method: 'GET',
      url: '/__dev/api/qa/quality-gates',
      headers: { host: '127.0.0.1:5175' },
      socket: { remoteAddress: '10.0.0.2' },
    },
    response,
    () => {}
  )
  assert.equal(response.statusCode, 403)
  assert.equal(createDevQualityGatePlugin().name, 'plush-dev-quality-gates')
  assert.equal(createDevQualityGatePlugin().apply, 'serve')
})

test('quality gate middleware enforces same-origin, CSRF, JSON and request size', async () => {
  const csrfToken = 'c'.repeat(48)
  let actions = 0
  const middleware = createDevQualityGateMiddleware({
    csrfToken,
    service: {
      async act(value) {
        actions += 1
        return { accepted: value.payload.profile }
      },
    },
  })
  const action = JSON.stringify({
    action: 'run',
    payload: {
      profile: 'strict',
      idempotencyKey: `quality-gate:strict:${ID}`,
    },
  })

  const forbidden = middlewareResponse()
  await middleware(
    middlewareRequest({
      method: 'POST',
      url: '/__dev/api/qa/quality-gates/actions',
      body: action,
      headers: { 'content-type': 'application/json' },
    }),
    forbidden,
    () => {}
  )
  assert.equal(forbidden.statusCode, 403)
  assert.equal(actions, 0)

  const accepted = middlewareResponse()
  await middleware(
    middlewareRequest({
      method: 'POST',
      url: '/__dev/api/qa/quality-gates/actions',
      body: action,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        origin: 'http://127.0.0.1:5175',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': csrfToken,
      },
    }),
    accepted,
    () => {}
  )
  assert.equal(accepted.statusCode, 202)
  assert.equal(actions, 1)

  const oversized = middlewareResponse()
  await middleware(
    middlewareRequest({
      method: 'POST',
      url: '/__dev/api/qa/quality-gates/actions',
      body: 'x'.repeat(4097),
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5175',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': csrfToken,
      },
    }),
    oversized,
    () => {}
  )
  assert.equal(oversized.statusCode, 400)
  assert.equal(actions, 1)
})

test('Vite development config registers the quality gate plugin', async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url))
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    path.join(webRoot, 'vite.config.mjs'),
    webRoot
  )
  assert(loaded)
  assert(
    loaded.config.plugins.some(
      (plugin) => plugin.name === 'plush-dev-quality-gates'
    )
  )
})
