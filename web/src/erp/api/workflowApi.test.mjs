import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  createTaskMutationAttemptStore,
  requireWorkflowTaskMutationParams,
} from '../utils/workflowTaskMutation.mjs'
import { requireWorkflowTaskBoardResponse } from '../utils/workflowTaskBoardContract.mjs'

function read(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

async function loadWorkflowApi(call) {
  globalThis.__workflowApiTestCall = call
  globalThis.__workflowApiTestRequireParams = requireWorkflowTaskMutationParams
  globalThis.__workflowApiTestRequireTaskBoardResponse =
    requireWorkflowTaskBoardResponse
  const transformed = read('./workflowApi.mjs')
    .replace(
      "import { AUTH_SCOPE } from '@/common/auth/auth'",
      "const AUTH_SCOPE = 'workflow-api-test'"
    )
    .replace(
      "import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'",
      "const ADMIN_BASE_PATH = '/admin'"
    )
    .replace(
      "import { JsonRpc } from '@/common/utils/jsonRpc'",
      `class JsonRpc {
        async call(method, params) {
          return globalThis.__workflowApiTestCall(method, params)
        }
      }`
    )
    .replace(
      "import { requireWorkflowTaskMutationParams } from '../utils/workflowTaskMutation.mjs'",
      'const requireWorkflowTaskMutationParams = globalThis.__workflowApiTestRequireParams'
    )
    .replace(
      "import { requireWorkflowTaskBoardResponse } from '../utils/workflowTaskBoardContract.mjs'",
      'const requireWorkflowTaskBoardResponse = globalThis.__workflowApiTestRequireTaskBoardResponse'
    )
  const encoded = Buffer.from(transformed).toString('base64')
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`)
}

function validTask(overrides = {}) {
  return {
    id: 42,
    version: 8,
    task_status_key: 'done',
    ...overrides,
  }
}

const mutationCases = [
  {
    exportName: 'completeWorkflowTaskAction',
    method: 'complete_task_action',
    params: {
      task_id: 42,
      expected_version: 7,
      idempotency_key: 'workflow-complete-42',
      action_key: 'complete',
    },
  },
  {
    exportName: 'blockWorkflowTaskAction',
    method: 'block_task_action',
    params: {
      task_id: 42,
      expected_version: 7,
      idempotency_key: 'workflow-block-42',
      action_key: 'block',
      reason: '等待资料',
    },
  },
  {
    exportName: 'rejectWorkflowTaskAction',
    method: 'reject_task_action',
    params: {
      task_id: 42,
      expected_version: 7,
      idempotency_key: 'workflow-reject-42',
      action_key: 'reject',
      reason: '资料不完整',
    },
  },
  {
    exportName: 'urgeWorkflowTask',
    method: 'urge_task',
    params: {
      task_id: 42,
      expected_version: 7,
      idempotency_key: 'workflow-urge-42',
      action: 'urge_task',
      reason: '请尽快处理',
    },
  },
]

test('workflowApi: task board uses the dedicated server projection contract', async () => {
  const calls = []
  const response = {
    snapshot_at: 1_720_000_000,
    total: 478,
    counts: {
      actionable: 144,
      exception: 110,
      due: 143,
      finished: 81,
    },
    lanes: [
      {
        key: 'actionable',
        total: 144,
        limit: 20,
        offset: 20,
        tasks: [],
      },
    ],
    source_types: ['inbound', 'project-orders'],
  }
  const api = await loadWorkflowApi(async (method, params) => {
    calls.push({ method, params })
    return { data: response }
  })
  const params = {
    keyword: '包装',
    status: 'pending',
    owner_role_key: 'warehouse',
    due: 'dueSoon',
    source_type: 'inbound',
    lane_key: 'actionable',
    limit: 20,
    offset: 20,
  }

  assert.equal(await api.getWorkflowTaskBoard(params), response)
  assert.deepEqual(calls, [{ method: 'get_task_board', params }])
})

test('workflowApi: task board rejects malformed successful responses', async () => {
  const api = await loadWorkflowApi(async () => ({
    data: {
      snapshot_at: 1_720_000_000,
      total: 2,
      counts: { actionable: 1, exception: 0, due: 0, finished: 0 },
      lanes: [],
      source_types: [],
    },
  }))

  await assert.rejects(
    api.getWorkflowTaskBoard({ limit: 5, offset: 0 }),
    (error) => error.isInvalidResponse === true
  )
})

test('workflowApi: all public task mutations validate params before RPC', async () => {
  const calls = []
  const api = await loadWorkflowApi(async (method, params) => {
    calls.push({ method, params })
    const statusByMethod = {
      complete_task_action: 'done',
      block_task_action: 'blocked',
      reject_task_action: 'rejected',
      urge_task: 'ready',
    }
    return {
      data: { task: validTask({ task_status_key: statusByMethod[method] }) },
    }
  })

  for (const entry of mutationCases) {
    const callCount = calls.length
    await assert.rejects(
      api[entry.exportName]({ ...entry.params, task_id: '42' }),
      /页面已更新/u
    )
    await assert.rejects(
      api[entry.exportName]({ ...entry.params, expected_version: 0 }),
      /页面已更新/u
    )
    await assert.rejects(
      api[entry.exportName]({
        ...entry.params,
        idempotency_key: ' '.repeat(3),
      }),
      /页面已更新/u
    )
    await assert.rejects(
      api[entry.exportName]({ ...entry.params, id: 42 }),
      /页面已更新/u
    )
    assert.equal(calls.length, callCount)

    const task = await api[entry.exportName](entry.params)
    assert.equal(task.id, 42)
    assert.equal(calls.at(-1).method, entry.method)
  }
})

test('workflowApi: every public task mutation rejects malformed successful responses', async () => {
  let response = { data: { task: null } }
  const api = await loadWorkflowApi(async () => response)

  for (const entry of mutationCases) {
    await assert.rejects(api[entry.exportName](entry.params), (error) => {
      assert.equal(error.isInvalidResponse, true)
      return true
    })
  }

  const statusByMethod = {
    complete_task_action: 'done',
    block_task_action: 'blocked',
    reject_task_action: 'rejected',
    urge_task: 'ready',
  }
  for (const entry of mutationCases) {
    for (const task of [
      validTask({
        id: 43,
        task_status_key: statusByMethod[entry.method],
      }),
      validTask({
        task_status_key: entry.method === 'urge_task' ? 'done' : 'ready',
      }),
    ]) {
      response = { data: { task } }
      await assert.rejects(
        api[entry.exportName](entry.params),
        (error) => error.isInvalidResponse === true
      )
    }
  }

  for (const task of [
    [],
    validTask({ id: '42' }),
    validTask({ id: 0 }),
    validTask({ id: Number.MAX_SAFE_INTEGER + 1 }),
    validTask({ id: 43 }),
    validTask({ version: '8' }),
    validTask({ version: 0 }),
    validTask({ version: Number.MAX_SAFE_INTEGER + 1 }),
    validTask({ task_status_key: 'unknown' }),
    validTask({ task_status_key: ' done ' }),
    validTask({ task_status_key: 'blocked' }),
  ]) {
    response = { data: { task } }
    await assert.rejects(
      api.completeWorkflowTaskAction(mutationCases[0].params),
      (error) => error.isInvalidResponse === true
    )
  }

  response = { data: { task: validTask() } }
  assert.equal(
    (await api.completeWorkflowTaskAction(mutationCases[0].params)).version,
    8
  )

  response = {
    data: { task: validTask({ version: 2, task_status_key: 'ready' }) },
  }
  assert.equal(
    (
      await api.urgeWorkflowTask({
        ...mutationCases[3].params,
        expected_version: 999,
      })
    ).version,
    2
  )
  response = { data: { task: validTask({ version: 2 }) } }
  assert.equal(
    (
      await api.completeWorkflowTaskAction({
        ...mutationCases[0].params,
        expected_version: 999,
      })
    ).version,
    2
  )
})

test('workflowApi: invalid success responses retain one frozen retry key', async () => {
  const requests = []
  const api = await loadWorkflowApi(async (_method, params) => {
    requests.push(params)
    return { data: { task: { id: 42, version: 8 } } }
  })
  const store = createTaskMutationAttemptStore({
    createUUID: () => 'invalid-response',
  })
  const params = {
    task_id: 42,
    expected_version: 7,
    action_key: 'complete',
  }

  await assert.rejects(
    store.run({
      scope: '42:complete',
      operation: 'complete',
      params,
      mutate: api.completeWorkflowTaskAction,
    }),
    (error) => error.isInvalidResponse === true
  )
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  assert.equal(requests[0].idempotency_key, 'wf:42:complete:invalid-response')
  assert.equal(
    store.hasRetainedAttempt({
      scope: '42:complete',
      operation: 'complete',
      params,
    }),
    true
  )
})

test('workflow task callers own a frozen user-intent attempt store', () => {
  for (const path of [
    '../pages/DashboardPage.jsx',
    '../pages/WorkflowBusinessModulePage.jsx',
    '../mobile/hooks/useMobileRoleTaskActions.js',
    '../components/purchase-orders/usePurchaseOrderWorkflowActions.mjs',
    '../components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs',
  ]) {
    const source = read(path)
    assert.match(
      source,
      /createTaskMutationAttemptStore/u,
      `${path} must create a user-intent attempt store`
    )
    assert.match(
      source,
      /mutationAttemptsRef\.current\.run/u,
      `${path} must route task mutations through the frozen attempt`
    )
    assert.match(
      source,
      /verifyNewWorkflowTaskMutationAttempt/u,
      `${path} must bypass repeated preflight only for an exact retained attempt`
    )
  }
})

test('workflow task request IDs stay cryptographically strong on non-secure HTTP targets', () => {
  const source = read('../utils/workflowTaskMutation.mjs')
  assert.match(source, /cryptoProvider\?\.randomUUID/u)
  assert.match(source, /cryptoProvider\?\.getRandomValues/u)
  assert.doesNotMatch(source, /Math\.random/u)
})

test('workflow browser and simulated closure fixtures submit idempotency keys', () => {
  const styleScenario = read('../../../scripts/style-l1/scenarios.mjs')
  const simulatedClosure = read(
    '../../../../scripts/qa/mobile-workflow-simulated-closure.mjs'
  )
  assert.match(styleScenario, /style-l1-dashboard-conflict/u)
  assert.match(simulatedClosure, /mobile-workflow-closure:/u)
})

test('workflow mocks enforce the formal task mutation contract', () => {
  for (const path of [
    '../../mocks/jsonRpcMockServer.js',
    '../../../scripts/style-l1/factRpcMocks.mjs',
  ]) {
    const source = read(path)
    assert.match(source, /requireWorkflowTaskMutationParams/u)
    assert.doesNotMatch(source, /params\.task_id\s*\|\|\s*params\.id/u)
    assert.doesNotMatch(source, /params\.action_key\s*\|\|\s*params\.action/u)
    assert.doesNotMatch(source, /params\.action\s*\|\|\s*['"]urge_task/u)
  }
})
