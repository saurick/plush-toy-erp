import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_COVERAGE_ACTION_API_PATH,
  DEV_COVERAGE_OPERATION_API_PREFIX,
  DEV_COVERAGE_OPERATION_SCHEMA,
  DEV_COVERAGE_SESSION_API_PATH,
  createDevCoverageIdempotencyKey,
  createDevCoverageOperationClient,
  getDevCoverageOperationPresentation,
  normalizeDevCoverageOperation,
  normalizeOptionalDevCoverageOperation,
} from './devCoverageOperation.mjs'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const NOW = '2026-07-29T08:00:00.000Z'

function operation(overrides = {}) {
  const status = overrides.status || 'running'
  const stage = overrides.stage || 'go'
  const terminal = ['completed', 'failed', 'not_proven'].includes(status)
  const message = overrides.message || '正在采集 Go 测试与代码覆盖'
  return {
    schemaVersion: DEV_COVERAGE_OPERATION_SCHEMA,
    id: ID,
    profile: 'baseline',
    repository: {
      commit: 'a'.repeat(40),
      dirty: true,
      fingerprint: 'b'.repeat(64),
    },
    status,
    stage,
    outcome:
      overrides.outcome ?? (status === 'completed' ? 'passed' : null),
    exitCode: overrides.exitCode ?? (status === 'completed' ? 0 : null),
    revision: 2,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: terminal ? NOW : null,
    message,
    events: [{ at: NOW, status, stage, message }],
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

test('coverage operation validator accepts only the exact public contract', () => {
  assert.deepEqual(normalizeDevCoverageOperation(operation()).id, ID)
  assert.throws(
    () => normalizeDevCoverageOperation({ ...operation(), command: 'pwd' }),
    /unsupported fields/u
  )
  const inconsistent = operation({
    status: 'completed',
    stage: 'finished',
  })
  inconsistent.outcome = null
  assert.throws(
    () => normalizeDevCoverageOperation(inconsistent),
    /inconsistent/u
  )
  assert.equal(
    normalizeOptionalDevCoverageOperation({ ...operation(), token: 'x' }),
    null
  )
})

test('coverage operation presentation reports bounded baseline progress', () => {
  assert.deepEqual(getDevCoverageOperationPresentation(operation()), {
    active: true,
    terminal: false,
    label: '正在采集',
    tone: 'primary',
    stageLabel: '第 3/10 阶段 · Go 测试与代码覆盖',
    step: 3,
    totalSteps: 10,
    percentage: 30,
  })
  const issues = getDevCoverageOperationPresentation(
    operation({
      status: 'completed',
      stage: 'finished',
      outcome: 'issues',
      exitCode: 2,
    })
  )
  assert.equal(issues.label, '采集完成，有失败或缺失项')
  assert.equal(issues.tone, 'warning')
  assert.equal(issues.percentage, 100)
})

test('coverage client posts only the fixed intent and polls only its operation id', async () => {
  const calls = []
  const client = createDevCoverageOperationClient({
    async fetchImpl(url, options) {
      calls.push({ url, options })
      if (url === DEV_COVERAGE_SESSION_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-coverage-session/v1',
          apiPath: '/__dev/api/qa/coverage',
          csrfToken: 's'.repeat(43),
        })
      }
      if (url === DEV_COVERAGE_ACTION_API_PATH) {
        return jsonResponse({
          schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
          action: 'collect',
          reused: false,
          operation: operation(),
        })
      }
      return jsonResponse({
        schemaVersion: 'plush.dev-qa-coverage-operation-result/v1',
        operation: operation({ stage: 'web' }),
      })
    },
  })
  const key = createDevCoverageIdempotencyKey({ randomUUID: () => ID })
  assert.equal(key, `coverage:collect:baseline:${ID}`)
  await client.start(key)
  await client.read(ID)

  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      DEV_COVERAGE_SESSION_API_PATH,
      DEV_COVERAGE_ACTION_API_PATH,
      `${DEV_COVERAGE_OPERATION_API_PREFIX}/${ID}`,
    ]
  )
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: 'collect',
    payload: { idempotencyKey: key },
  })
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 's'.repeat(43))
  assert.equal(JSON.stringify(calls).includes('command'), false)
})

test('coverage client rejects invalid ids and malformed response contracts', async () => {
  const client = createDevCoverageOperationClient({
    fetchImpl: async () =>
      jsonResponse({
        schemaVersion: 'plush.dev-qa-coverage-operation-result/v1',
        operation: { ...operation(), args: ['--strict'] },
      }),
  })
  await assert.rejects(() => client.read('../private'), /任务标识无效/u)
  await assert.rejects(() => client.read(ID), /unsupported fields/u)
})
