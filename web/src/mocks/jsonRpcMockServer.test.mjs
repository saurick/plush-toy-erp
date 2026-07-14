import assert from 'node:assert/strict'
import test from 'node:test'

import { setupJsonRpcMockServer } from './jsonRpcMockServer.js'

async function workflowCall(method, params) {
  const response = await window.fetch('/rpc/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  })
  return response.json()
}

async function createTask(code) {
  const response = await workflowCall('create_task', {
    task_code: code,
    task_group: 'mock-cas',
    task_name: 'Mock CAS 合同测试',
    source_type: 'mock-cas',
    source_id: Date.now(),
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  assert.equal(response.result.code, 0)
  return response.result.data.task
}

test('workflow mock keeps the terminal and version CAS contract aligned with the backend', async () => {
  const originalWindow = globalThis.window
  const originalConsoleInfo = console.info
  const originalConsoleLog = console.log
  globalThis.window = {
    location: { origin: 'http://127.0.0.1' },
    fetch: async () => {
      throw new Error('unexpected passthrough fetch')
    },
  }
  console.info = () => {}
  console.log = () => {}
  setupJsonRpcMockServer()

  try {
    const metadata = await workflowCall('metadata', {})
    assert.deepEqual(
      metadata.result.data.task_states.map((item) => item.key),
      ['ready', 'blocked', 'done', 'rejected']
    )

    const taskBoard = await workflowCall('get_task_board', {
      owner_role_key: 'sales',
      lane_key: 'actionable',
      limit: 8,
      offset: 0,
    })
    assert.equal(taskBoard.result.code, 0)
    assert.equal(taskBoard.result.data.lanes.length, 1)
    assert.equal(taskBoard.result.data.lanes[0].key, 'actionable')
    assert.equal(taskBoard.result.data.lanes[0].tasks.length, 8)
    assert.equal(
      Object.values(taskBoard.result.data.counts).reduce(
        (sum, value) => sum + value,
        0
      ),
      taskBoard.result.data.total
    )

    const firstRoleTaskPage = await workflowCall('list_role_tasks', {
      view_key: 'todo',
      role_key: 'sales',
      limit: 20,
    })
    assert.equal(firstRoleTaskPage.result.code, 0)
    assert.equal(firstRoleTaskPage.result.data.items.length, 20)
    assert.equal(firstRoleTaskPage.result.data.has_more, true)
    assert(firstRoleTaskPage.result.data.next_cursor)
    assert(
      firstRoleTaskPage.result.data.items.every(
        (task) =>
          task.owner_role_key === 'sales' &&
          ['ready', 'blocked'].includes(task.task_status_key)
      )
    )
    const secondRoleTaskPage = await workflowCall('list_role_tasks', {
      view_key: 'todo',
      role_key: 'sales',
      limit: 20,
      cursor: firstRoleTaskPage.result.data.next_cursor,
    })
    assert.equal(secondRoleTaskPage.result.code, 0)
    assert.equal(
      secondRoleTaskPage.result.data.server_time,
      firstRoleTaskPage.result.data.server_time
    )
    const firstPageIDs = new Set(
      firstRoleTaskPage.result.data.items.map((task) => task.id)
    )
    assert(
      secondRoleTaskPage.result.data.items.every(
        (task) => !firstPageIDs.has(task.id)
      )
    )

    const validCreateParams = {
      task_code: 'MOCK-CREATE-REQUIRED',
      task_group: 'mock-cas',
      task_name: 'Mock create 必填测试',
      source_type: 'mock-cas',
      source_id: 101,
      owner_role_key: 'sales',
    }
    const beforeInvalidCreates = await workflowCall('list_tasks', {
      source_type: 'mock-cas',
    })
    const beforeInvalidCreateCount = beforeInvalidCreates.result.data.total
    for (const key of [
      'idempotency_key',
      'expected_version',
      'command_key',
      'intent_hash',
      'customer_key',
      'unexpected',
    ]) {
      const invalidCreate = await workflowCall('create_task', {
        task_code: `MOCK-CREATE-STRICT-${key}`,
        task_group: 'mock-cas',
        task_name: 'Mock create 合同测试',
        source_type: 'mock-cas',
        source_id: Date.now(),
        task_status_key: 'ready',
        owner_role_key: 'sales',
        [key]: 'non-contract-value',
      })
      assert.equal(invalidCreate.result.code, 40010)
      assert.match(invalidCreate.result.message, new RegExp(key, 'u'))
    }
    for (const params of [
      {},
      { task_code: 'ONLY-CODE' },
      {
        task_code: 'INVALID-SOURCE-ID',
        task_group: 'mock-cas',
        task_name: 'Mock create 合同测试',
        source_type: 'mock-cas',
        source_id: 0,
        owner_role_key: 'sales',
      },
      {
        task_code: 'INVALID-STATUS',
        task_group: 'mock-cas',
        task_name: 'Mock create 合同测试',
        source_type: 'mock-cas',
        source_id: 1,
        task_status_key: 'unknown',
        owner_role_key: 'sales',
      },
    ]) {
      const invalidCreate = await workflowCall('create_task', params)
      assert.equal(invalidCreate.result.code, 40010)
    }
    for (const requiredKey of [
      'task_code',
      'task_group',
      'task_name',
      'source_type',
      'source_id',
      'owner_role_key',
    ]) {
      const params = { ...validCreateParams }
      delete params[requiredKey]
      const invalidCreate = await workflowCall('create_task', params)
      assert.equal(invalidCreate.result.code, 40010)
    }
    for (const requiredStringKey of [
      'task_code',
      'task_group',
      'task_name',
      'source_type',
      'owner_role_key',
    ]) {
      const invalidCreate = await workflowCall('create_task', {
        ...validCreateParams,
        [requiredStringKey]: '   ',
      })
      assert.equal(invalidCreate.result.code, 40010)
    }
    for (const invalidSourceID of [0, -1, 1.5, '1']) {
      const invalidCreate = await workflowCall('create_task', {
        ...validCreateParams,
        source_id: invalidSourceID,
      })
      assert.equal(invalidCreate.result.code, 40010)
    }
    for (const invalidDueAt of [
      { not: 'unix' },
      '1800000000',
      1.5,
      0,
      -1,
      9_224_318_016_000,
    ]) {
      const invalidCreate = await workflowCall('create_task', {
        ...validCreateParams,
        due_at: invalidDueAt,
      })
      assert.equal(invalidCreate.result.code, 40010)
    }
    const afterInvalidCreates = await workflowCall('list_tasks', {
      source_type: 'mock-cas',
    })
    assert.equal(
      afterInvalidCreates.result.data.total,
      beforeInvalidCreateCount
    )

    const defaultStatusCreated = await workflowCall(
      'create_task',
      validCreateParams
    )
    assert.equal(defaultStatusCreated.result.code, 0)
    assert.equal(
      defaultStatusCreated.result.data.task.task_status_key,
      'ready'
    )

    const completedTask = await createTask('MOCK-CAS-DONE')
    const completed = await workflowCall('complete_task_action', {
      task_id: completedTask.id,
      expected_version: completedTask.version,
      idempotency_key: 'mock-complete-done',
      action_key: 'complete',
    })
    assert.equal(completed.result.code, 0)
    assert.equal(completed.result.data.task.task_status_key, 'done')
    assert.equal(completed.result.data.task.version, 2)

    const sameTerminalRetry = await workflowCall('complete_task_action', {
      task_id: completedTask.id,
      expected_version: 99,
      idempotency_key: 'mock-complete-done',
      action_key: 'complete',
    })
    assert.equal(sameTerminalRetry.result.code, 0)
    assert.equal(sameTerminalRetry.result.data.task.version, 2)

    const nonContractAliasRetry = await workflowCall('complete_task_action', {
      task_id: completedTask.id,
      expected_version: 99,
      idempotency_key: 'mock-complete-done',
      action_key: 'done',
    })
    assert.notEqual(nonContractAliasRetry.result.code, 0)

    const clientBusinessStatusRetry = await workflowCall(
      'complete_task_action',
      {
        task_id: completedTask.id,
        expected_version: 99,
        idempotency_key: 'mock-complete-done',
        action_key: 'complete',
        business_status_key: 'client_override',
      }
    )
    assert.notEqual(clientBusinessStatusRetry.result.code, 0)

    const differentTerminalAction = await workflowCall('reject_task_action', {
      task_id: completedTask.id,
      expected_version: 2,
      idempotency_key: 'mock-complete-reject-new-command',
      action_key: 'reject',
      reason: '不应覆盖终态',
    })
    assert.notEqual(differentTerminalAction.result.code, 0)
    assert.match(differentTerminalAction.result.message, /任务已结束/u)

    const terminalUrge = await workflowCall('urge_task', {
      task_id: completedTask.id,
      expected_version: 2,
      idempotency_key: 'mock-complete-terminal-urge',
      action: 'urge_task',
      reason: '不应催办终态',
    })
    assert.notEqual(terminalUrge.result.code, 0)
    assert.match(terminalUrge.result.message, /任务已结束/u)

    const staleTask = await createTask('MOCK-CAS-STALE')
    const stale = await workflowCall('block_task_action', {
      task_id: staleTask.id,
      expected_version: staleTask.version + 1,
      idempotency_key: 'mock-stale-block',
      action_key: 'block',
      reason: '陈旧版本',
    })
    assert.notEqual(stale.result.code, 0)
    assert.match(stale.result.message, /刷新后重试/u)

    const resumeTask = await createTask('MOCK-CAS-RESUME')
    const blockedForResume = await workflowCall('block_task_action', {
      task_id: resumeTask.id,
      expected_version: resumeTask.version,
      idempotency_key: 'mock-resume-precondition',
      action_key: 'block',
      reason: '等待客户补齐资料',
    })
    assert.equal(blockedForResume.result.code, 0)
    assert.equal(blockedForResume.result.data.task.task_status_key, 'blocked')
    assert.equal(
      blockedForResume.result.data.task.business_status_key,
      'blocked'
    )
    const blockedProjection = await workflowCall('list_business_states', {
      source_type: resumeTask.source_type,
      source_id: resumeTask.source_id,
    })
    assert.equal(blockedProjection.result.code, 0)
    assert.equal(blockedProjection.result.data.total, 1)
    const blockedBusinessState =
      blockedProjection.result.data.business_states[0]
    assert.equal(blockedBusinessState.business_status_key, 'blocked')
    assert.equal(blockedBusinessState.blocked_reason, '等待客户补齐资料')
    assert(Number.isSafeInteger(blockedBusinessState.status_changed_at))

    const resumeParams = {
      task_id: resumeTask.id,
      expected_version: blockedForResume.result.data.task.version,
      idempotency_key: 'mock-resume-task',
      action_key: 'resume',
      reason: '客户资料已经补齐',
    }
    const resumed = await workflowCall('resume_task_action', resumeParams)
    assert.equal(resumed.result.code, 0)
    assert.equal(resumed.result.data.task.task_status_key, 'ready')
    assert.equal(resumed.result.data.task.blocked_reason, '')
    assert.equal(resumed.result.data.task.business_status_key, 'blocked')
    const resumedProjection = await workflowCall('list_business_states', {
      source_type: resumeTask.source_type,
      source_id: resumeTask.source_id,
    })
    assert.equal(resumedProjection.result.code, 0)
    assert.equal(resumedProjection.result.data.total, 1)
    const resumedBusinessState =
      resumedProjection.result.data.business_states[0]
    assert.equal(resumedBusinessState.business_status_key, 'blocked')
    assert.equal(resumedBusinessState.blocked_reason, '等待客户补齐资料')
    assert.equal(
      resumedBusinessState.status_changed_at,
      blockedBusinessState.status_changed_at
    )

    const resumedReplay = await workflowCall('resume_task_action', {
      ...resumeParams,
      expected_version: 999,
    })
    assert.equal(resumedReplay.result.code, 0)
    assert.deepEqual(resumedReplay.result.data.task, resumed.result.data.task)

    const changedResumeIntent = await workflowCall('resume_task_action', {
      ...resumeParams,
      reason: '另一个解除说明',
    })
    assert.equal(changedResumeIntent.result.code, 40920)

    const newResumeIntentAfterReady = await workflowCall(
      'resume_task_action',
      {
        ...resumeParams,
        idempotency_key: 'mock-resume-new-intent',
      }
    )
    assert.equal(newResumeIntentAfterReady.result.code, 40010)

    const rejectedTask = await createTask('MOCK-CAS-REJECTED')
    const rejected = await workflowCall('reject_task_action', {
      task_id: rejectedTask.id,
      expected_version: rejectedTask.version,
      idempotency_key: 'mock-reject-task',
      action_key: 'reject',
      reason: '资料不完整',
    })
    assert.equal(rejected.result.code, 0)
    assert.equal(rejected.result.data.task.task_status_key, 'rejected')
    assert.equal(rejected.result.data.task.version, 2)

    const rejectedRetry = await workflowCall('reject_task_action', {
      task_id: rejectedTask.id,
      expected_version: 99,
      idempotency_key: 'mock-reject-task',
      action_key: 'reject',
      reason: '资料不完整',
    })
    assert.equal(rejectedRetry.result.code, 0)
    assert.equal(rejectedRetry.result.data.task.version, 2)
    assert.equal(
      rejectedRetry.result.data.task.payload.rejected_reason,
      '资料不完整'
    )

    const rejectedRetryWithClientLifecyclePayload = await workflowCall(
      'reject_task_action',
      {
        task_id: rejectedTask.id,
        expected_version: 99,
        idempotency_key: 'mock-reject-task',
        action_key: 'reject',
        reason: '资料不完整',
        payload: { workflow_page_scope: 'another-ui-entry' },
      }
    )
    assert.equal(rejectedRetryWithClientLifecyclePayload.result.code, 40010)

    const changedIntent = await workflowCall('reject_task_action', {
      task_id: rejectedTask.id,
      expected_version: 1,
      idempotency_key: 'mock-reject-task',
      action_key: 'reject',
      reason: '另一个退回原因',
    })
    assert.equal(changedIntent.result.code, 40920)

    const urgedTask = await createTask('MOCK-IDEMPOTENT-URGE')
    const urged = await workflowCall('urge_task', {
      task_id: urgedTask.id,
      expected_version: urgedTask.version,
      idempotency_key: 'mock-urge-task',
      action: 'urge_task',
      reason: '请今天确认',
    })
    const urgedRetry = await workflowCall('urge_task', {
      task_id: urgedTask.id,
      expected_version: 999,
      idempotency_key: 'mock-urge-task',
      action: 'urge_task',
      reason: '请今天确认',
    })
    assert.equal(urged.result.code, 0)
    assert.equal(urgedRetry.result.code, 0)
    assert.equal(urged.result.data.task.urge_count, 1)
    assert.equal(urgedRetry.result.data.task.urge_count, 1)
    assert(Number.isSafeInteger(urged.result.data.task.last_urged_at))
    assert.equal(urged.result.data.task.last_urged_by, 1)
    assert.equal(urged.result.data.task.last_urged_by_role_key, 'sales')
    assert.equal(urgedRetry.result.data.task.version, 2)

    const missingKeyTask = await createTask('MOCK-MISSING-KEY')
    const missingKey = await workflowCall('complete_task_action', {
      task_id: missingKeyTask.id,
      expected_version: missingKeyTask.version,
      action_key: 'complete',
    })
    assert.notEqual(missingKey.result.code, 0)
    assert.match(missingKey.result.message, /刷新/u)

    const strictTask = await createTask('MOCK-STRICT-PARAMS')
    const strictBase = {
      task_id: strictTask.id,
      expected_version: strictTask.version,
      idempotency_key: 'mock-strict-complete',
      action_key: 'complete',
    }
    for (const invalidParams of [
      { ...strictBase, task_id: String(strictTask.id) },
      { ...strictBase, task_id: 0 },
      { ...strictBase, expected_version: String(strictTask.version) },
      { ...strictBase, expected_version: 0 },
      { ...strictBase, id: strictTask.id },
      { ...strictBase, command: 'complete_task_action' },
      { ...strictBase, foo: 'bar' },
      { ...strictBase, action_key: ' complete ' },
      { ...strictBase, idempotency_key: '界'.repeat(129) },
      { ...strictBase, payload: { source_type: 'purchase_order' } },
      { ...strictBase, payload: { idempotency_key: 'nested-key' } },
    ]) {
      const invalid = await workflowCall('complete_task_action', invalidParams)
      assert.notEqual(invalid.result.code, 0)
    }

    const validAfterInvalid = await workflowCall(
      'complete_task_action',
      strictBase
    )
    assert.equal(validAfterInvalid.result.code, 0)
    assert.equal(validAfterInvalid.result.data.task.version, 2)

    const urgeStrictTask = await createTask('MOCK-STRICT-URGE')
    for (const invalidParams of [
      {
        task_id: urgeStrictTask.id,
        expected_version: urgeStrictTask.version,
        idempotency_key: 'mock-urge-missing-action',
        reason: '请尽快处理',
      },
      {
        task_id: urgeStrictTask.id,
        expected_version: urgeStrictTask.version,
        idempotency_key: 'mock-urge-action-alias',
        action_key: 'urge',
        reason: '请尽快处理',
      },
      {
        task_id: urgeStrictTask.id,
        expected_version: urgeStrictTask.version,
        idempotency_key: 'mock-urge-empty-reason',
        action: 'urge_task',
        reason: '   ',
      },
      {
        task_id: urgeStrictTask.id,
        expected_version: urgeStrictTask.version,
        idempotency_key: 'mock-urge-padded-action',
        action: ' urge_task ',
        reason: '请尽快处理',
      },
    ]) {
      const invalid = await workflowCall('urge_task', invalidParams)
      assert.notEqual(invalid.result.code, 0)
    }

    const validExplain = await workflowCall('explain_action_access', {
      task_id: urgeStrictTask.id,
      action_key: 'urge',
    })
    assert.equal(validExplain.result.code, 0)
    assert.equal(validExplain.result.data.action.action_key, 'urge')
    const allActionsExplain = await workflowCall('explain_action_access', {
      task_id: urgeStrictTask.id,
    })
    assert.equal(allActionsExplain.result.code, 0)
    assert.equal(allActionsExplain.result.data.task_id, urgeStrictTask.id)
    assert.deepEqual(
      allActionsExplain.result.data.actions.map((item) => item.action_key),
      ['complete', 'block', 'reject', 'resume', 'urge']
    )
    for (const invalidParams of [
      { id: urgeStrictTask.id, action_key: 'urge' },
      { task_id: urgeStrictTask.id, action: 'urge' },
      { task_id: urgeStrictTask.id, action_key: '' },
      { task_id: urgeStrictTask.id, action_key: '   ' },
      { task_id: urgeStrictTask.id, action_key: 1 },
      { task_id: urgeStrictTask.id, action_key: ' urge ' },
      { task_id: urgeStrictTask.id, action_key: 'done' },
      { task_id: urgeStrictTask.id, action_key: 'blocked' },
      { task_id: urgeStrictTask.id, action_key: 'rejected' },
      { task_id: urgeStrictTask.id, action_key: 'urge_task' },
      { task_id: urgeStrictTask.id, action_key: 'escalate' },
      {
        task_id: urgeStrictTask.id,
        action_key: 'urge',
        unknown: true,
      },
      { task_id: String(urgeStrictTask.id), action_key: 'urge' },
    ]) {
      const invalid = await workflowCall('explain_action_access', invalidParams)
      assert.notEqual(invalid.result.code, 0)
    }

    const retiredIDAssignment = await workflowCall('explain_task_assignment', {
      id: urgeStrictTask.id,
    })
    assert.notEqual(retiredIDAssignment.result.code, 0)
    const assignmentWithAction = await workflowCall('explain_task_assignment', {
      task_id: urgeStrictTask.id,
      action_key: 'urge',
    })
    assert.notEqual(assignmentWithAction.result.code, 0)
  } finally {
    console.info = originalConsoleInfo
    console.log = originalConsoleLog
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
