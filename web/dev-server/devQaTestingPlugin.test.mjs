import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'

import {
  acquireDevQaExecutionLock,
  releaseDevQaExecutionLock,
} from '../../scripts/qa/dev-qa-execution-lock.mjs'
import { resolveDevTestingOperationStore } from '../../scripts/qa/dev-testing-operation-store.mjs'
import {
  buildDevQaTestingCommand,
  createDevQaTestingMiddleware,
  createDevQaTestingPlugin,
  createDevQaTestingService,
  validateDevQaTestingAction,
} from './devQaTestingPlugin.mjs'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const ID_TWO = '123e4567-e89b-42d3-a456-426614174001'
const REPOSITORY = Object.freeze({
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const CHANGED_REPOSITORY = Object.freeze({
  ...REPOSITORY,
  fingerprint: 'c'.repeat(64),
})

async function project(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-testing-plugin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('testing action contract accepts only fixed allowlisted intent', () => {
  const value = {
    action: 'fast',
    payload: { idempotencyKey: `testing:fast:${ID}` },
  }
  assert.equal(validateDevQaTestingAction(value), value)
  assert.throws(
    () =>
      validateDevQaTestingAction({
        ...value,
        command: 'rm',
      }),
    /unsupported fields/u
  )
  assert.throws(
    () =>
      validateDevQaTestingAction({
        action: 'fast',
        payload: {
          idempotencyKey: `testing:role-access:${ID}`,
        },
      }),
    /payload is invalid/u
  )
})

test('testing command registry maps actions to fixed repository scripts', () => {
  const common = {
    nodeRuntime: '/pinned/node',
    operationId: ID,
    projectRoot: '/repo',
  }
  assert.deepEqual(
    buildDevQaTestingCommand({ ...common, action: 'fast' }).args,
    [
      'scripts/qa/run-gate-with-receipt.mjs',
      '--gate',
      'fast',
      '--out',
      `output/dev-workbench/receipts/fast-oneclick-${ID}.json`,
    ]
  )
  assert.deepEqual(
    buildDevQaTestingCommand({ ...common, action: 'role-access' }).args,
    [
      'scripts/qa/yoyoosun-role-jsonrpc-access.mjs',
      '--report',
      'output/qa/yoyoosun-role-jsonrpc-access/report.json',
    ]
  )
  assert.deepEqual(
    buildDevQaTestingCommand({ ...common, action: 'field-linkage' }).args,
    ['scripts/qa/erp-field-linkage.mjs']
  )
})

test('testing plan is read-only, relative and fails closed on identity drift', async (t) => {
  const root = await project(t)
  const affected = {
    changedFiles: ['web/src/example.mjs'],
    levels: ['T0', 'T3'],
    highestLevel: 'T3',
    requiresFull: false,
    commands: [
      {
        id: 'web',
        level: 'T3',
        label: 'Web test',
        bin: 'node',
        args: ['--test', 'web/src/example.test.mjs'],
        cwd: '.',
      },
    ],
    followUps: [{ level: 'T5', text: '运行真实浏览器回归' }],
    prePushGate: 'bash scripts/qa/prepare-push.sh',
  }
  const service = createDevQaTestingService({
    projectRoot: root,
    readRepositoryState: async () => REPOSITORY,
    collectPlan: async () => affected,
    now: () => new Date('2026-07-30T10:00:00.000Z'),
  })
  const plan = await service.plan()
  assert.equal(plan.changedCount, 1)
  assert.equal(plan.commands[0].command.includes(root), false)
  assert.deepEqual(plan.followUps, [
    { level: 'T5', text: '运行真实浏览器回归' },
  ])

  let reads = 0
  const drifting = createDevQaTestingService({
    projectRoot: root,
    operationStore: path.join(root, 'drifting-operations'),
    readRepositoryState: async () => {
      reads += 1
      return reads === 1 ? REPOSITORY : CHANGED_REPOSITORY
    },
    collectPlan: async () => affected,
  })
  await assert.rejects(
    () => drifting.plan(),
    (error) => error?.code === 'DEV_QA_REPOSITORY_CHANGED'
  )
})

test('testing service persists completion and role precondition blocking', async (t) => {
  const root = await project(t)
  const completion = deferred()
  let launchedSpec = null
  const service = createDevQaTestingService({
    projectRoot: root,
    randomOperationId: () => ID,
    readRepositoryState: async () => REPOSITORY,
    resolveNodeRuntime: () => '/pinned/node',
    launchProcess(spec) {
      launchedSpec = spec
      return { pid: 321, completion: completion.promise }
    },
  })
  const started = await service.act({
    action: 'fast',
    payload: { idempotencyKey: `testing:fast:${ID}` },
  })
  assert.equal(started.operation.status, 'running')
  assert.deepEqual(launchedSpec.args.slice(0, 3), [
    'scripts/qa/run-gate-with-receipt.mjs',
    '--gate',
    'fast',
  ])
  completion.resolve({ code: 0 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(service.readOperation(ID).status, 'completed')

  const roleCompletion = deferred()
  const roleService = createDevQaTestingService({
    projectRoot: root,
    operationStore: path.join(root, 'role-operations'),
    randomOperationId: () => ID_TWO,
    readRepositoryState: async () => REPOSITORY,
    resolveNodeRuntime: () => '/pinned/node',
    launchProcess: () => ({
      pid: 322,
      completion: roleCompletion.promise,
    }),
  })
  await roleService.act({
    action: 'role-access',
    payload: { idempotencyKey: `testing:role-access:${ID_TWO}` },
  })
  roleCompletion.resolve({ code: 2 })
  await new Promise((resolve) => setImmediate(resolve))
  const blocked = roleService.readOperation(ID_TWO)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.outcome, 'blocked')
})

test('testing service rejects overlap with coverage global lock', async (t) => {
  const root = await project(t)
  const store = resolveDevTestingOperationStore(root)
  acquireDevQaExecutionLock(store, {
    kind: 'coverage',
    profile: 'baseline',
    operationId: ID,
    ownerPid: process.pid,
  })
  t.after(() => {
    try {
      releaseDevQaExecutionLock(store, {
        kind: 'coverage',
        profile: 'baseline',
        operationId: ID,
      })
    } catch {
      // The fixture may already be released when the assertion fails early.
    }
  })
  const service = createDevQaTestingService({
    projectRoot: root,
    randomOperationId: () => ID_TWO,
    readRepositoryState: async () => REPOSITORY,
  })
  await assert.rejects(
    () =>
      service.act({
        action: 'field-linkage',
        payload: { idempotencyKey: `testing:field-linkage:${ID_TWO}` },
      }),
    (error) => error?.code === 'DEV_QA_EXECUTION_LOCKED'
  )
})

test('Vite development config bundles and registers the testing plugin', async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url))
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    path.join(webRoot, 'vite.config.mjs'),
    webRoot
  )
  assert(loaded)
  assert(
    loaded.config.plugins.some(
      (plugin) => plugin.name === 'plush-dev-qa-testing'
    )
  )
})

test('testing middleware is loopback-only and plugin is serve-only', async () => {
  const middleware = createDevQaTestingMiddleware({
    service: {
      summary: () => ({
        schemaVersion: 'plush.dev-qa-testing-summary/v1',
        busy: { active: false, kind: '', profile: '' },
        operations: {
          fast: null,
          'role-access': null,
          'field-linkage': null,
        },
      }),
    },
  })
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = String(body)
    },
  }
  await middleware(
    {
      method: 'GET',
      url: '/__dev/api/qa/testing',
      headers: { host: '127.0.0.1:5175' },
      socket: { remoteAddress: '10.0.0.2' },
    },
    response,
    () => {}
  )
  assert.equal(response.statusCode, 403)
  assert.equal(createDevQaTestingPlugin().name, 'plush-dev-qa-testing')
  assert.equal(createDevQaTestingPlugin().apply, 'serve')
})
