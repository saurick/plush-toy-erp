import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  readDevQaGitHookGovernance,
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

const HOOK_FILES = Object.freeze([
  '.githooks/pre-commit',
  '.githooks/commit-msg',
  '.githooks/pre-push',
  'scripts/git-hooks/pre-commit.sh',
  'scripts/git-hooks/commit-msg.sh',
  'scripts/git-hooks/pre-push.sh',
  'scripts/qa/prepare-push.sh',
])
const HOOK_CHECK_KEYS = Object.freeze([
  'hooks-path',
  'pre-commit-entry',
  'commit-msg-entry',
  'pre-push-entry',
  'pre-commit-runner',
  'commit-msg-runner',
  'pre-push-runner',
  'prepare-push',
])
const READY_HOOKS = Object.freeze({
  status: 'ready',
  expectedHooksPath: '.githooks',
  configuredHooksPath: '.githooks',
  checks: HOOK_CHECK_KEYS.map((key) => ({ key, status: 'ready' })),
})

async function writeExecutableHookFixture(root) {
  for (const sourcePath of HOOK_FILES) {
    const target = path.join(root, sourcePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, '#!/bin/sh\nexit 0\n', 'utf8')
    await chmod(target, 0o755)
  }
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

test('testing hook governance reports wiring only and fails closed', async (t) => {
  const root = await project(t)
  await writeExecutableHookFixture(root)

  const ready = readDevQaGitHookGovernance(root, {
    readConfiguredPath: () => '.githooks',
  })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.configuredHooksPath, '.githooks')
  assert.equal(ready.checks.length, 8)
  assert(ready.checks.every((check) => check.status === 'ready'))

  await chmod(path.join(root, 'scripts/qa/prepare-push.sh'), 0o644)
  const blocked = readDevQaGitHookGovernance(root, {
    readConfiguredPath: () => '/private/other-hooks',
  })
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.configuredHooksPath, '其他路径')
  assert.equal(blocked.checks[0].status, 'misconfigured')
  assert.equal(blocked.checks.at(-1).status, 'not_executable')
  assert.equal(JSON.stringify(blocked).includes('/private/other-hooks'), false)
})

test('testing plan is read-only, relative and fails closed on identity drift', async (t) => {
  const root = await project(t)
  const affected = {
    changedFiles: ['web/src/example.mjs'],
    affectedScopes: ['T0', 'T3'],
    maxAffectedScope: 'T3',
    localGate: 'focused',
    commands: [
      {
        id: 'web',
        scope: 'T3',
        label: 'Web test',
        bin: 'node',
        args: ['--test', 'web/src/example.test.mjs'],
        cwd: '.',
      },
    ],
    followUps: [{ scope: 'T5', text: '运行真实浏览器回归' }],
    prePushGate: 'bash scripts/qa/prepare-push.sh',
  }
  const service = createDevQaTestingService({
    projectRoot: root,
    readRepositoryState: async () => REPOSITORY,
    collectPlan: async () => affected,
    readHookGovernance: () => READY_HOOKS,
    now: () => new Date('2026-07-30T10:00:00.000Z'),
  })
  const plan = await service.plan()
  assert.equal(plan.schemaVersion, 'plush.dev-qa-testing-plan/v2')
  assert.equal(plan.changedCount, 1)
  assert.deepEqual(plan.affectedScopes, ['T0', 'T3'])
  assert.equal(plan.maxAffectedScope, 'T3')
  assert.equal(plan.localGate, 'focused')
  assert.equal(plan.commands[0].command.includes(root), false)
  assert.deepEqual(plan.followUps, [
    { scope: 'T5', text: '运行真实浏览器回归' },
  ])
  assert.deepEqual(service.summary().hooks, READY_HOOKS)

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
        schemaVersion: 'plush.dev-qa-testing-summary/v2',
        busy: { active: false, kind: '', profile: '' },
        hooks: {
          status: 'blocked',
          expectedHooksPath: '.githooks',
          configuredHooksPath: '未配置',
          checks: HOOK_CHECK_KEYS.map((key, index) => ({
            key,
            status: index === 0 ? 'misconfigured' : 'missing',
          })),
        },
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
