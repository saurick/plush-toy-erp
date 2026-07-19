import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createTaskMutationInFlightGuard,
  createTaskMutationAttemptStore,
  isWorkflowTaskMutationResultUnknown,
  requireWorkflowTaskIdempotencyKey,
  requireWorkflowTaskMutationParams,
  runWorkflowTaskMutationWithFailureRefresh,
  verifyNewWorkflowTaskMutationAttempt,
  workflowTaskMutationUUID,
  workflowTaskMutationSignature,
} from './workflowTaskMutation.mjs'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const workflowTaskMutationIntentVectors = JSON.parse(
  read('../../../../scripts/qa/workflow-task-mutation-intent-v1.vectors.json')
)

test('workflow task mutation UUID uses secure random bytes when randomUUID is unavailable', () => {
  const uuid = workflowTaskMutationUUID({
    getRandomValues(bytes) {
      bytes.set([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb,
        0xcc, 0xdd, 0xee, 0xff,
      ])
      return bytes
    },
  })

  assert.equal(uuid, '00112233-4455-4677-8899-aabbccddeeff')
})

test('workflow task mutation in-flight guard acquires synchronously and releases by lease identity', () => {
  const guard = createTaskMutationInFlightGuard()
  const first = guard.acquire('task:42')
  assert(first)
  assert.equal(guard.isInFlight('task:42'), true)
  assert.equal(guard.acquire('task:42'), null)

  const other = guard.acquire('task:43')
  assert(other)
  assert.equal(guard.release({ scope: 'task:42' }), false)
  assert.equal(guard.isInFlight('task:42'), true)
  assert.equal(guard.release(first), true)

  const replacement = guard.acquire('task:42')
  assert(replacement)
  assert.notEqual(replacement, first)
  assert.equal(guard.release(first), false)
  assert.equal(guard.acquire('task:42'), null)
  assert.equal(guard.release(replacement), true)
  assert.equal(guard.release(other), true)
})

test('workflow task mutation 408 keeps one retry key for a later exact retry', async () => {
  const store = createTaskMutationAttemptStore({
    createUUID: () => 'timeout-408',
  })
  const timeout = Object.assign(new Error('request timeout'), {
    httpStatus: 408,
  })
  const params = {
    task_id: 42,
    expected_version: 7,
    action_key: 'complete',
  }
  const requests = []
  const mutate = async (request) => {
    requests.push(request)
    throw timeout
  }

  await assert.rejects(
    store.run({
      scope: '42:complete',
      operation: 'complete',
      params,
      mutate,
    }),
    (error) => error === timeout
  )
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.equal(requests[0].idempotency_key, 'wf:42:complete:timeout-408')
  assert.equal(
    store.hasRetainedAttempt({
      scope: '42:complete',
      operation: 'complete',
      params,
    }),
    true
  )
  const resolved = await store.run({
    scope: '42:complete',
    operation: 'complete',
    params,
    mutate: async (request) => {
      requests.push(request)
      return 'resolved'
    },
  })
  assert.equal(resolved, 'resolved')
  assert.equal(requests.length, 3)
  assert.equal(requests[2], requests[0])
  assert.equal(
    store.hasRetainedAttempt({
      scope: '42:complete',
      operation: 'complete',
      params,
    }),
    false
  )
  assert.equal(isWorkflowTaskMutationResultUnknown({ httpStatus: 409 }), false)
})

test('formal workflow action surfaces use a synchronous task-level in-flight guard', () => {
  const surfaces = [
    '../pages/DashboardPage.jsx',
    '../pages/WorkflowBusinessModulePage.jsx',
    '../mobile/hooks/useMobileRoleTaskActions.js',
    '../components/purchase-orders/usePurchaseOrderWorkflowActions.mjs',
    '../components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs',
  ]

  for (const path of surfaces) {
    const source = read(path)
    assert.match(
      source,
      /createTaskMutationInFlightGuard/u,
      `${path} must initialize the shared synchronous guard`
    )
    assert.match(source, /\.acquire\(/u, `${path} must acquire before submit`)
    assert.match(source, /\.release\(/u, `${path} must release in finally`)
    assert.match(
      source,
      /task:\$\{/u,
      `${path} must lock all actions for the same task`
    )
    assert.match(
      source,
      /const\s+\w*[Ll]ease\s*=[\s\S]*?\.acquire\([\s\S]*?if\s*\(!\w*[Ll]ease\)\s*return[\s\S]*?finally\s*\{[\s\S]*?\.release\(\w*[Ll]ease\)/u,
      `${path} must acquire before awaiting and release the same lease in finally`
    )
  }

  assert.doesNotMatch(
    read('../mobile/hooks/useMobileRoleTaskActions.js'),
    /actionInFlightTaskIDsRef/u
  )
})

test('formal workflow action surfaces submit only canonical payload fields', () => {
  const dashboard = read('../pages/DashboardPage.jsx')
  const workflowPage = read('../pages/WorkflowBusinessModulePage.jsx')
  const mobile = read('../mobile/hooks/useMobileRoleTaskActions.js')
  const purchase = read(
    '../components/purchase-orders/usePurchaseOrderWorkflowActions.mjs'
  )
  const outsourcing = read(
    '../components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs'
  )

  assert.match(dashboard, /surface_key:\s*'desktop_task_board'/u)
  assert.doesNotMatch(dashboard, /desktop_task_board_action/u)
  assert.match(workflowPage, /surface_key:\s*'workflow_business_module'/u)
  assert.doesNotMatch(workflowPage, /workflow_page_(?:action|scope)/u)
  assert.match(mobile, /buildMobileTaskActionPayload/u)
  assert.doesNotMatch(mobile, /evidenceText|updateEvidenceText/u)
  assert.doesNotMatch(
    mobile,
    /mobile_role_key|mobile_action_(?:key|recorded_at|role_key)|(?:approval|qc|shipment_release|receivable|invoice|payable|reconciliation)_result/u
  )
  assert.match(purchase, /surface_key:\s*'purchase_orders'/u)
  assert.doesNotMatch(purchase, /purchase_order_page_action/u)
  assert.match(outsourcing, /surface_key:\s*'outsourcing_orders'/u)
  assert.doesNotMatch(outsourcing, /outsourcing_order_page_action/u)
})

test('workflow task mutation params require the exact versioned command contract', () => {
  const valid = requireWorkflowTaskMutationParams(
    'complete',
    {
      task_id: 42,
      expected_version: 7,
      idempotency_key: '  workflow-complete-42  ',
      action_key: 'complete',
      reason: '  已核对  ',
      payload: {
        feedback: '  已复核  ',
        evidence_refs: [' proof-b ', 'proof-a', 'proof-a'],
        surface_key: '  desktop_task_board  ',
        entry_path: '  /erp/task-board  ',
      },
    },
    { requireIdempotencyKey: true }
  )
  assert.equal(valid.task_id, 42)
  assert.equal(valid.expected_version, 7)
  assert.equal(valid.idempotency_key, 'workflow-complete-42')
  assert.equal(valid.action_key, 'complete')
  assert.equal(valid.reason, '已核对')
  assert.deepEqual(valid.payload, {
    feedback: '已复核',
    evidence_refs: ['proof-a', 'proof-b'],
    surface_key: 'desktop_task_board',
    entry_path: '/erp/task-board',
  })

  const base = {
    task_id: 42,
    expected_version: 7,
    idempotency_key: 'workflow-complete-42',
    action_key: 'complete',
    payload: {},
  }
  for (const invalid of [
    { ...base, task_id: '42' },
    { ...base, task_id: 0 },
    { ...base, task_id: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, expected_version: '7' },
    { ...base, expected_version: 0 },
    { ...base, expected_version: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, id: 42 },
    { ...base, action_key: 'done' },
    { ...base, action_key: ' complete ' },
    { ...base, action: 'complete' },
    { ...base, command: 'complete_task_action' },
    { ...base, foo: 'bar' },
    { ...base, business_status_key: 'done' },
    { ...base, payload: { source_type: 'purchase_order' } },
    { ...base, payload: { command_key: 'inventory.post' } },
    { ...base, payload: { idempotency_key: 'nested-key' } },
    { ...base, payload: { blocked_reason: '等待资料' } },
    { ...base, payload: { rejected_reason: '资料不全' } },
    { ...base, payload: { mobile_role_key: 'quality' } },
    { ...base, payload: { mobile_action_recorded_at: 100 } },
    { ...base, payload: { qc_result: 'pass' } },
    { ...base, payload: { urge_count: 99 } },
    { ...base, payload: { notification_type: 'qc_pending' } },
    { ...base, payload: { feedback: 42 } },
    { ...base, payload: { evidence_refs: 'proof-a' } },
    { ...base, payload: { evidence_refs: ['proof-a', 42] } },
    { ...base, payload: { surface_key: 42 } },
    { ...base, payload: { entry_path: [] } },
    { ...base, payload: { ' surface_key ': 'desktop_task_board' } },
  ]) {
    assert.throws(
      () =>
        requireWorkflowTaskMutationParams('complete', invalid, {
          requireIdempotencyKey: true,
        }),
      /页面已更新/u
    )
  }

  for (const [operation, actionParams] of [
    ['block', { action_key: 'block', reason: '等待资料' }],
    ['reject', { action_key: 'reject', reason: '资料不完整' }],
    ['resume', { action_key: 'resume', reason: '阻塞已解除' }],
    ['urge', { action: 'urge_task', reason: '请尽快处理' }],
  ]) {
    assert.throws(
      () =>
        requireWorkflowTaskMutationParams(operation, {
          task_id: 42,
          expected_version: 7,
          idempotency_key: `workflow-${operation}-42`,
          ...actionParams,
          payload: { feedback: '只允许完成动作提交反馈' },
        }),
      /页面已更新/u
    )
  }

  const breakGlass = requireWorkflowTaskMutationParams(
    'complete',
    {
      ...base,
      break_glass: true,
      break_glass_reason: '  紧急补录  ',
      break_glass_expires_at: 1_800_000_000,
    },
    { requireIdempotencyKey: true }
  )
  assert.equal(breakGlass.break_glass_reason, '紧急补录')
  for (const invalid of [
    { ...base, break_glass: false, break_glass_reason: '孤立原因' },
    { ...base, break_glass_expires_at: 1_800_000_000 },
    {
      ...base,
      break_glass: true,
      break_glass_reason: '   ',
      break_glass_expires_at: 1_800_000_000,
    },
    {
      ...base,
      break_glass: true,
      break_glass_reason: '紧急补录',
      break_glass_expires_at: '1800000000',
    },
  ]) {
    assert.throws(
      () =>
        requireWorkflowTaskMutationParams('complete', invalid, {
          requireIdempotencyKey: true,
        }),
      /页面已更新/u
    )
  }
})

test('workflow task mutation keys and urge actions fail closed', () => {
  assert.equal(
    requireWorkflowTaskIdempotencyKey(` ${'界'.repeat(128)} `),
    '界'.repeat(128)
  )
  for (const invalidKey of ['', '   ', '界'.repeat(129), 42]) {
    assert.throws(
      () => requireWorkflowTaskIdempotencyKey(invalidKey),
      /页面已更新/u
    )
  }

  const base = {
    task_id: 9,
    expected_version: 3,
    idempotency_key: 'workflow-urge-9',
    reason: '请尽快处理',
  }
  assert.equal(
    requireWorkflowTaskMutationParams(
      'urge',
      { ...base, action: 'urge_task' },
      { requireIdempotencyKey: true }
    ).action,
    'urge_task'
  )
  for (const invalid of [
    base,
    { ...base, action: 'urge' },
    { ...base, action: ' urge_task ' },
    { ...base, action: '' },
    { ...base, action: 'urge_task', action_key: 'urge' },
    { ...base, action: 'urge_task', reason: '   ' },
  ]) {
    assert.throws(
      () =>
        requireWorkflowTaskMutationParams('urge', invalid, {
          requireIdempotencyKey: true,
        }),
      /页面已更新/u
    )
  }
})

test('workflow task resume requires the versioned action contract and an unblock reason', () => {
  const base = {
    task_id: 42,
    expected_version: 7,
    idempotency_key: 'workflow-resume-42',
    action_key: 'resume',
    reason: '  物料已补齐  ',
    payload: { surface_key: 'desktop_task_board' },
  }
  const normalized = requireWorkflowTaskMutationParams('resume', base, {
    requireIdempotencyKey: true,
  })
  assert.equal(normalized.reason, '物料已补齐')
  assert.equal(normalized.action_key, 'resume')

  assert.throws(
    () =>
      requireWorkflowTaskMutationParams(
        'resume',
        { ...base, reason: '   ' },
        { requireIdempotencyKey: true }
      ),
    /页面已更新/u
  )
})

test('workflow task mutation attempt rejects invalid identity before creating a key or calling mutate', async () => {
  let uuidCalls = 0
  let mutateCalls = 0
  const store = createTaskMutationAttemptStore({
    createUUID: () => {
      uuidCalls += 1
      return 'uuid-never-created'
    },
  })

  await assert.rejects(
    store.run({
      scope: 'invalid:complete',
      operation: 'complete',
      params: {
        task_id: '42',
        expected_version: 1,
        action_key: 'complete',
      },
      mutate: async () => {
        mutateCalls += 1
      },
    }),
    /页面已更新/u
  )
  assert.equal(uuidCalls, 0)
  assert.equal(mutateCalls, 0)
})

test('workflow task mutation refreshes stale state after an action failure', async () => {
  const actionError = new Error('任务已被其他人更新，请刷新后重试')
  let refreshCount = 0

  await assert.rejects(
    runWorkflowTaskMutationWithFailureRefresh(
      async () => {
        throw actionError
      },
      async () => {
        refreshCount += 1
      }
    ),
    (error) => error === actionError
  )
  assert.equal(refreshCount, 1)
})

test('workflow task mutation keeps the original action error when refresh also fails', async () => {
  const actionError = new Error('任务动作失败')

  await assert.rejects(
    runWorkflowTaskMutationWithFailureRefresh(
      async () => {
        throw actionError
      },
      async () => {
        throw new Error('刷新失败')
      }
    ),
    (error) => error === actionError
  )
})

test('workflow task mutation leaves the success refresh to the caller', async () => {
  let refreshCount = 0
  const result = await runWorkflowTaskMutationWithFailureRefresh(
    async () => 'updated',
    async () => {
      refreshCount += 1
    }
  )

  assert.equal(result, 'updated')
  assert.equal(refreshCount, 0)
})

test('workflow task mutation attempt reuses one frozen request across unknown-result retries', async () => {
  const store = createTaskMutationAttemptStore({
    createUUID: () => 'uuid-1',
  })
  const requests = []
  const networkError = Object.assign(new Error('network result unknown'), {
    isNetworkError: true,
  })
  const firstParams = {
    task_id: 42,
    expected_version: 5,
    action_key: 'complete',
    reason: '',
    payload: {
      feedback: '已完成检验',
      evidence_refs: ['photo-b', 'photo-a'],
      surface_key: 'mobile_role_tasks',
    },
  }
  const mutate = async (params) => {
    requests.push(params)
    if (requests.length <= 2) throw networkError
    return 'done'
  }

  await assert.rejects(
    store.run({
      scope: '42:complete',
      operation: 'complete',
      params: firstParams,
      mutate,
    }),
    (error) => error === networkError
  )
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.equal(requests[0].idempotency_key, 'wf:42:complete:uuid-1')
  assert.equal(
    store.hasRetainedAttempt({
      scope: '42:complete',
      operation: 'complete',
      params: firstParams,
    }),
    true
  )

  const result = await store.run({
    scope: '42:complete',
    operation: 'complete',
    params: {
      ...firstParams,
      expected_version: 99,
      payload: {
        feedback: '已完成检验',
        evidence_refs: ['photo-a', 'photo-b'],
        surface_key: 'desktop_task_board',
      },
    },
    mutate,
  })
  assert.equal(result, 'done')
  assert.equal(requests.length, 3)
  assert.equal(requests[0], requests[2])
  assert.equal(requests[2].expected_version, 5)
  assert.equal(requests[2].payload.surface_key, 'mobile_role_tasks')
  assert.deepEqual(requests[2].payload.evidence_refs, ['photo-a', 'photo-b'])
  assert.equal(
    store.hasRetainedAttempt({
      scope: '42:complete',
      operation: 'complete',
      params: firstParams,
    }),
    false
  )
})

test('workflow task mutation retained attempt bypasses a terminal preflight and resolves its receipt', async () => {
  const store = createTaskMutationAttemptStore({
    createUUID: () => 'uuid-receipt',
  })
  const params = {
    task_id: 9,
    expected_version: 3,
    action_key: 'complete',
    reason: '',
    payload: { feedback: '已同意' },
  }
  const receipt = { task: { id: 9, task_status_key: 'done', version: 4 } }
  let mutationCalls = 0
  const mutate = async () => {
    mutationCalls += 1
    if (mutationCalls <= 2) {
      throw Object.assign(new Error('response lost'), { isNetworkError: true })
    }
    return receipt
  }

  await assert.rejects(
    store.run({
      scope: '9:complete',
      operation: 'complete',
      params,
      mutate,
    })
  )
  let preflightCalls = 0
  const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
    attemptStore: store,
    scope: '9:complete',
    operation: 'complete',
    params,
    verify: async () => {
      preflightCalls += 1
      return false
    },
  })
  assert.equal(accessVerified, true)
  const result = await store.run({
    scope: '9:complete',
    operation: 'complete',
    params: { ...params, expected_version: 4 },
    mutate,
  })

  assert.equal(preflightCalls, 0)
  assert.equal(result, receipt)
  assert.equal(mutationCalls, 3)
})

test('workflow task mutation verifies a changed intent before creating a new attempt', async () => {
  const store = createTaskMutationAttemptStore({
    createUUID: () => 'uuid-new-intent',
  })
  let preflightCalls = 0
  const params = {
    task_id: 9,
    expected_version: 4,
    action_key: 'block',
    reason: '等待资料',
  }
  const verified = await verifyNewWorkflowTaskMutationAttempt({
    attemptStore: store,
    scope: '9:block',
    operation: 'block',
    params,
    verify: async () => {
      preflightCalls += 1
      return false
    },
  })

  assert.equal(verified, false)
  assert.equal(preflightCalls, 1)
  assert.equal(
    store.hasRetainedAttempt({
      scope: '9:block',
      operation: 'block',
      params,
    }),
    false
  )
})

test('workflow task mutation attempt creates a new key when meaningful intent changes', async () => {
  const uuids = ['uuid-a', 'uuid-b']
  const store = createTaskMutationAttemptStore({
    createUUID: () => uuids.shift(),
  })
  const requests = []
  const networkError = Object.assign(new Error('network result unknown'), {
    httpStatus: 503,
  })
  const mutateUnknown = async (params) => {
    requests.push(params)
    throw networkError
  }
  const base = {
    task_id: 7,
    expected_version: 1,
    action_key: 'block',
    reason: '等待资料',
    payload: { surface_key: 'desktop_task_board' },
  }
  await assert.rejects(
    store.run({
      scope: '7:block',
      operation: 'block',
      params: base,
      mutate: mutateUnknown,
    })
  )

  const result = await store.run({
    scope: '7:block',
    operation: 'block',
    params: { ...base, reason: '等待客户确认' },
    mutate: async (params) => {
      requests.push(params)
      return 'changed'
    },
  })
  assert.equal(result, 'changed')
  assert.equal(requests[0].idempotency_key, 'wf:7:block:uuid-a')
  assert.equal(requests.at(-1).idempotency_key, 'wf:7:block:uuid-b')
})

test('workflow task mutation attempt completion cannot delete a newer same-scope intent', async (t) => {
  for (const firstOutcome of ['success', 'determinate_failure']) {
    await t.test(firstOutcome, async () => {
      const uuids = ['uuid-a', 'uuid-b']
      const store = createTaskMutationAttemptStore({
        createUUID: () => uuids.shift(),
      })
      let releaseFirst
      let markFirstStarted
      const firstStarted = new Promise((resolve) => {
        markFirstStarted = resolve
      })
      const releaseFirstPromise = new Promise((resolve) => {
        releaseFirst = resolve
      })
      const firstParams = {
        task_id: 7,
        expected_version: 1,
        action_key: 'complete',
        payload: { feedback: '第一份反馈' },
      }
      const firstRun = store.run({
        scope: '7:complete',
        operation: 'complete',
        params: firstParams,
        mutate: async () => {
          markFirstStarted()
          await releaseFirstPromise
          if (firstOutcome === 'determinate_failure') {
            throw new Error('permission denied')
          }
          return 'first done'
        },
      })
      await firstStarted

      let releaseSecond
      let markSecondStarted
      const secondStarted = new Promise((resolve) => {
        markSecondStarted = resolve
      })
      const releaseSecondPromise = new Promise((resolve) => {
        releaseSecond = resolve
      })
      const secondParams = {
        ...firstParams,
        payload: { feedback: '第二份反馈' },
      }
      let secondCalls = 0
      const unknownError = Object.assign(new Error('response lost'), {
        isNetworkError: true,
      })
      const secondRun = store.run({
        scope: '7:complete',
        operation: 'complete',
        params: secondParams,
        mutate: async () => {
          secondCalls += 1
          if (secondCalls === 1) {
            markSecondStarted()
            await releaseSecondPromise
          }
          throw unknownError
        },
      })
      await secondStarted

      releaseFirst()
      if (firstOutcome === 'determinate_failure') {
        await assert.rejects(firstRun, /permission denied/u)
      } else {
        assert.equal(await firstRun, 'first done')
      }
      releaseSecond()
      await assert.rejects(secondRun, (error) => error === unknownError)

      assert.equal(secondCalls, 2)
      assert.equal(
        store.hasRetainedAttempt({
          scope: '7:complete',
          operation: 'complete',
          params: secondParams,
        }),
        true
      )
      assert.equal(
        store.hasRetainedAttempt({
          scope: '7:complete',
          operation: 'complete',
          params: firstParams,
        }),
        false
      )
    })
  }
})

test('workflow task semantic signature ignores transport copies but keeps business decisions', () => {
  const first = workflowTaskMutationSignature('complete', {
    task_id: 5,
    expected_version: 1,
    action_key: 'complete',
    payload: {
      feedback: '已通过',
      evidence_refs: ['proof-b', 'proof-a'],
      surface_key: 'mobile_role_tasks',
    },
  })
  const same = workflowTaskMutationSignature('complete', {
    task_id: 5,
    expected_version: 999,
    action_key: 'complete',
    payload: {
      feedback: '已通过',
      evidence_refs: ['proof-a', 'proof-b'],
      surface_key: 'desktop_task_board',
      entry_path: '/erp/task-board',
    },
  })
  const changed = workflowTaskMutationSignature('complete', {
    task_id: 5,
    expected_version: 1,
    action_key: 'complete',
    payload: { feedback: '需要复检', evidence_refs: ['proof-a'] },
  })
  assert.equal(first, same)
  assert.notEqual(first, changed)
})

test('workflow task semantic signature matches the shared v1 intent vectors', () => {
  assert.equal(
    workflowTaskMutationIntentVectors.contract,
    'workflow.task-mutation/v1'
  )
  const signatures = new Map()

  for (const vector of workflowTaskMutationIntentVectors.vectors) {
    const signature = workflowTaskMutationSignature(
      vector.operation,
      vector.params
    )
    const intent = JSON.parse(signature)
    assert.deepEqual(intent.payload, vector.expected_payload, vector.name)
    signatures.set(vector.name, signature)
  }

  for (const relation of workflowTaskMutationIntentVectors.relations) {
    assert.equal(
      signatures.get(relation.left) === signatures.get(relation.right),
      relation.equal,
      relation.name
    )
  }
})

test('workflow task failure refresh skips refresh while the result is unknown', async () => {
  let refreshCount = 0
  const error = Object.assign(new Error('invalid response'), {
    isInvalidResponse: true,
  })
  await assert.rejects(
    runWorkflowTaskMutationWithFailureRefresh(
      async () => {
        throw error
      },
      async () => {
        refreshCount += 1
      }
    ),
    (caught) => caught === error
  )
  assert.equal(refreshCount, 0)
})

test('workflow task result uncertainty uses transport and server signals only', () => {
  assert.equal(
    isWorkflowTaskMutationResultUnknown(
      new Error('关联流程状态冲突，请刷新后重试')
    ),
    false
  )
  assert.equal(
    isWorkflowTaskMutationResultUnknown({
      code: 50000,
      message: '服务内部错误',
    }),
    true
  )
  assert.equal(
    isWorkflowTaskMutationResultUnknown({
      code: 40920,
      message: '重复请求内容与首次提交不一致，请刷新后重试',
    }),
    false
  )
})
