import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_TESTING_GIT_CLOSEOUT_STAGES,
  DEV_TESTING_GIT_HOOK_CHECKS,
  DEV_TESTING_GIT_HOOK_PATH_COMMAND,
  DEV_TESTING_OPERATION_ACTION_API_PATH,
  DEV_TESTING_OPERATION_API_PATH,
  DEV_TESTING_OPERATION_API_PREFIX,
  DEV_TESTING_OPERATION_PLAN_API_PATH,
  DEV_TESTING_OPERATION_SESSION_API_PATH,
  DEV_TESTING_PREPARE_PUSH_COMMAND,
  createDevTestingIdempotencyKey,
  createDevTestingOperationClient,
  getDevTestingGitHookStatusMeta,
  getDevTestingOperationPresentation,
  normalizeDevTestingPlan,
  normalizeDevTestingSummary,
} from './devTestingOperation.mjs'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const REPOSITORY = {
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
}
const HOOKS = {
  status: 'ready',
  expectedHooksPath: '.githooks',
  configuredHooksPath: '.githooks',
  checks: DEV_TESTING_GIT_HOOK_CHECKS.map(({ key }) => ({
    key,
    status: 'ready',
  })),
}

function operation(overrides = {}) {
  return {
    schemaVersion: 'plush.dev-qa-testing-operation-public/v1',
    id: ID,
    action: 'fast',
    repository: REPOSITORY,
    status: 'running',
    stage: 'running',
    outcome: null,
    exitCode: null,
    revision: 2,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:01.000Z',
    finishedAt: null,
    message: '正在运行开发门禁',
    ...overrides,
  }
}

function jsonResponse(payload, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return payload
    },
  }
}

test('testing summary keeps fixed results and Git Hook wiring independent', () => {
  const summary = normalizeDevTestingSummary({
    schemaVersion: 'plush.dev-qa-testing-summary/v2',
    busy: { active: true, kind: 'testing', profile: 'fast' },
    hooks: HOOKS,
    operations: {
      fast: operation(),
      'role-access': null,
      'field-linkage': null,
    },
  })
  assert.equal(summary.busy.profile, 'fast')
  assert.equal(summary.operations.fast.action, 'fast')
  assert.equal(summary.operations['role-access'], null)
  assert.equal(summary.hooks.status, 'ready')
  assert.equal(summary.hooks.checks[0].label, 'Git Hook 入口目录')
  assert.equal(
    summary.hooks.checks.at(-1).sourcePath,
    'scripts/qa/prepare-push.sh'
  )

  assert.throws(
    () =>
      normalizeDevTestingSummary({
        ...summary,
        hooks: {
          ...HOOKS,
          configuredHooksPath: '其他路径',
        },
      }),
    /inconsistent/u
  )
})

test('testing Git closeout copy stays fixed and explains the four boundaries', () => {
  assert.equal(
    DEV_TESTING_GIT_HOOK_PATH_COMMAND,
    'git config --get core.hooksPath'
  )
  assert.equal(
    DEV_TESTING_PREPARE_PUSH_COMMAND,
    'bash scripts/qa/prepare-push.sh'
  )
  assert.deepEqual(
    DEV_TESTING_GIT_CLOSEOUT_STAGES.map((stage) => stage.key),
    ['pre-commit', 'commit-msg', 'prepare-push', 'pre-push']
  )
  assert.match(DEV_TESTING_GIT_CLOSEOUT_STAGES[0].boundary, /不等于完整 full/)
  assert.match(DEV_TESTING_GIT_CLOSEOUT_STAGES[2].boundary, /不执行 push/)
  assert.equal(getDevTestingGitHookStatusMeta('ready').label, '接线完整')
  assert.equal(getDevTestingGitHookStatusMeta('missing').tone, 'danger')
})

test('testing plan accepts only relative commands and frozen identity', () => {
  const plan = normalizeDevTestingPlan({
    schemaVersion: 'plush.dev-qa-testing-plan/v1',
    generatedAt: '2026-07-30T10:00:00.000Z',
    repository: REPOSITORY,
    changedCount: 2,
    levels: ['T0', 'T3'],
    highestLevel: 'T3',
    requiresFull: false,
    commands: [
      {
        id: 'web',
        level: 'T3',
        label: 'Web test',
        cwd: '.',
        command: 'node --test web/src/example.test.mjs',
      },
    ],
    followUps: [{ level: 'T5', text: '运行真实浏览器回归' }],
    prePushGate: 'bash scripts/qa/prepare-push.sh',
  })
  assert.equal(plan.changedCount, 2)
  assert.throws(
    () =>
      normalizeDevTestingPlan({
        ...plan,
        commands: [{ ...plan.commands[0], cwd: '/Users/private/repo' }],
      }),
    /command is invalid/u
  )
})

test('testing client posts only action and idempotency key', async () => {
  const calls = []
  const client = createDevTestingOperationClient({
    async fetchImpl(url, options) {
      calls.push({ url, options })
      if (url === DEV_TESTING_OPERATION_SESSION_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-testing-session/v1',
          apiPath: DEV_TESTING_OPERATION_API_PATH,
          csrfToken: 's'.repeat(43),
        })
      }
      if (url === DEV_TESTING_OPERATION_ACTION_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-testing-action-result/v1',
          action: 'fast',
          reused: false,
          operation: operation(),
        })
      }
      if (url === DEV_TESTING_OPERATION_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-testing-summary/v2',
          busy: { active: false, kind: '', profile: '' },
          hooks: HOOKS,
          operations: {
            fast: operation(),
            'role-access': null,
            'field-linkage': null,
          },
        })
      }
      if (url === DEV_TESTING_OPERATION_PLAN_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-testing-plan/v1',
          generatedAt: '2026-07-30T10:00:00.000Z',
          repository: REPOSITORY,
          changedCount: 0,
          levels: ['T0'],
          highestLevel: 'T0',
          requiresFull: false,
          commands: [],
          followUps: [],
          prePushGate: 'bash scripts/qa/prepare-push.sh',
        })
      }
      return jsonResponse({
        schemaVersion: 'plush.dev-qa-testing-operation-result/v1',
        operation: operation(),
      })
    },
  })
  const key = createDevTestingIdempotencyKey('fast', {
    randomUUID: () => ID,
  })
  await client.summary()
  await client.plan()
  await client.start('fast', key)
  await client.read(ID)
  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      DEV_TESTING_OPERATION_API_PATH,
      DEV_TESTING_OPERATION_PLAN_API_PATH,
      DEV_TESTING_OPERATION_SESSION_API_PATH,
      DEV_TESTING_OPERATION_ACTION_API_PATH,
      `${DEV_TESTING_OPERATION_API_PREFIX}/${ID}`,
    ]
  )
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    action: 'fast',
    payload: { idempotencyKey: key },
  })
  const serialized = JSON.stringify(calls[3])
  assert.equal(serialized.includes('command'), false)
  assert.equal(serialized.includes('args'), false)
  assert.equal(serialized.includes('env'), false)
})

test('testing presentation keeps blocked and repository drift distinct', () => {
  assert.deepEqual(
    getDevTestingOperationPresentation(
      operation({
        action: 'role-access',
        status: 'blocked',
        stage: 'finished',
        outcome: 'blocked',
        exitCode: 2,
        finishedAt: '2026-07-30T10:00:02.000Z',
      })
    ),
    {
      active: false,
      terminal: true,
      label: '前置未就绪',
      tone: 'warning',
    }
  )
  assert.equal(
    getDevTestingOperationPresentation(
      operation({
        status: 'not_proven',
        stage: 'finished',
        finishedAt: '2026-07-30T10:00:02.000Z',
      })
    ).label,
    '结果无法证明'
  )
})
