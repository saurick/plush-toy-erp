import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkflowActionAccessFallback,
  buildWorkflowActionAccessState,
  normalizeWorkflowActionExplainData,
  normalizeWorkflowActionMode,
  resolveWorkflowActionAccessRequestOutcome,
} from './workflowTaskActionAccess.mjs'

function admin(overrides = {}) {
  return {
    id: 7,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.update',
      'workflow.task.complete',
    ],
    effective_session: {
      actions: ['workflow.task.complete', 'workflow.task.update'],
    },
    ...overrides,
  }
}

function task(overrides = {}) {
  return {
    id: 42,
    task_group: 'warehouse_inbound',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    payload: {},
    ...overrides,
  }
}

test('workflowTaskActionAccess: normalizes backend explain actions', () => {
  const normalized = normalizeWorkflowActionExplainData({
    actions: [
      {
        action_key: 'done',
        allowed: true,
        reason: '可完成',
        required_permission: 'workflow.task.complete',
        owner_role_key: 'warehouse',
        visible_owner_role_keys: ['sales', 'warehouse'],
        candidate_owner_role_keys: ['warehouse'],
        owner_role_matched: false,
        work_pool_role_matched: true,
        work_pool_entitlement_matched: true,
        work_pool_entitlement_scope_matched: true,
        domain_command_entry: {
          enabled: false,
          will_write_fact: false,
          source: 'guarded_no_domain_command_contract',
          command_key: '',
          blocked_reasons: [
            'domain_command_contract_not_configured',
            'workflow_payload_command_key_ignored',
          ],
          required_contract: ['domain_command_key', 'idempotency_key'],
        },
        actor_role_key: 'warehouse',
      },
      {
        action_key: 'blocked',
        allowed: false,
        reason_code: 'missing_permission',
        reason: '缺少权限',
      },
      {
        action_key: 'rejected',
        allowed: true,
        reason: '可退回',
      },
      {
        action_key: 'urge_task',
        allowed: true,
        reason: '可催办',
      },
      {
        action_key: 'custom_backend_action_key',
        allowed: true,
        reason: '自定义动作',
      },
    ],
  })

  assert.equal(normalized.complete.allowed, true)
  assert.equal(normalized.complete.requiredPermission, 'workflow.task.complete')
  assert.equal(normalized.complete.ownerRoleKey, 'warehouse')
  assert.deepEqual(normalized.complete.visibleOwnerRoleKeys, [
    'sales',
    'warehouse',
  ])
  assert.deepEqual(normalized.complete.candidateOwnerRoleKeys, ['warehouse'])
  assert.equal(normalized.complete.ownerRoleMatched, false)
  assert.equal(normalized.complete.workPoolRoleMatched, true)
  assert.equal(normalized.complete.workPoolEntitlementMatched, true)
  assert.equal(normalized.complete.workPoolEntitlementScopeMatched, true)
  assert.equal(normalized.complete.domainCommandEntry.enabled, false)
  assert.equal(normalized.complete.domainCommandEntry.willWriteFact, false)
  assert.equal(
    normalized.complete.domainCommandEntry.source,
    'guarded_no_domain_command_contract'
  )
  assert.deepEqual(normalized.complete.domainCommandEntry.blockedReasons, [
    'domain_command_contract_not_configured',
    'workflow_payload_command_key_ignored',
  ])
  assert.deepEqual(normalized.complete.domainCommandEntry.requiredContract, [
    'domain_command_key',
    'idempotency_key',
  ])
  assert.equal(normalized.complete.actorRoleKey, 'warehouse')
  assert.equal(normalized.block.allowed, false)
  assert.equal(normalized.block.reasonCode, 'missing_permission')
  assert.equal(normalized.reject.allowed, true)
  assert.equal(normalized.urge.allowed, true)
  assert.equal(normalized.custom_backend_action_key, undefined)
})

test('workflowTaskActionAccess: normalizes action mode aliases for submit guards', () => {
  assert.equal(normalizeWorkflowActionMode('done'), 'complete')
  assert.equal(normalizeWorkflowActionMode('blocked'), 'block')
  assert.equal(normalizeWorkflowActionMode('rejected'), 'reject')
  assert.equal(normalizeWorkflowActionMode('urge_task'), 'urge')
  assert.equal(normalizeWorkflowActionMode('custom_backend_action_key'), '')
})

test('workflowTaskActionAccess: backend explain overrides local fallback', () => {
  const access = buildWorkflowActionAccessState({
    adminProfile: admin(),
    task: task(),
    explainData: {
      actions: [
        {
          action_key: 'complete',
          allowed: false,
          reason_code: 'not_owner_or_assignee',
          reason: '后端判定不可完成',
        },
        { action_key: 'block', allowed: true, reason: '可阻塞' },
      ],
    },
  })

  assert.equal(access.source, 'backend')
  assert.equal(access.canRun('complete'), false)
  assert.equal(access.canRun('block'), true)
  assert.equal(access.canRun('reject'), false)
  assert.equal(access.canRun('urge'), false)
  assert.deepEqual(access.allowedModes, ['block'])
  assert.equal(access.getReason('complete'), '后端判定不可完成')
  assert.equal(
    access.getReason('reject'),
    '后端未返回该动作权限，请刷新后重试。'
  )
  assert.equal(access.getReason('urge'), '后端未返回该动作权限，请刷新后重试。')
  assert.equal(
    access.byAction.reject.reasonCode,
    'action_access_missing_from_backend'
  )
  assert.equal(
    access.byAction.urge.reasonCode,
    'action_access_missing_from_backend'
  )
})

test('workflowTaskActionAccess: fallback keeps local owner and terminal reasons', () => {
  const fallback = buildWorkflowActionAccessFallback({
    adminProfile: admin({ permissions: ['workflow.task.read'] }),
    task: task(),
  })

  assert.equal(fallback.allowedModes.length, 0)
  assert.match(fallback.readonlyReason, /只有查看任务权限/u)
  assert.equal(fallback.byAction.complete.domainCommandEntry.enabled, false)
  assert.equal(
    fallback.byAction.complete.domainCommandEntry.willWriteFact,
    false
  )
  assert.equal(
    fallback.byAction.complete.domainCommandEntry.source,
    'fallback_no_domain_command_contract'
  )

  const terminal = buildWorkflowActionAccessState({
    adminProfile: admin(),
    task: task({ task_status_key: 'done' }),
  })
  assert.equal(terminal.canRun('complete'), false)
  assert.equal(terminal.readonlyReason, '该任务已结束，只能查看上下文。')
})

test('workflowTaskActionAccess: missing backend explain does not expose local fallback actions', () => {
  const access = buildWorkflowActionAccessState({
    adminProfile: admin(),
    task: task(),
  })

  assert.equal(access.source, 'fallback_checking')
  assert.equal(access.loading, false)
  assert.deepEqual(access.allowedModes, [])
  assert.equal(access.canRun('complete'), false)
  assert.equal(access.canRun('block'), false)
  assert.equal(access.canRun('reject'), false)
  assert.equal(access.canRun('urge'), false)
  assert.equal(
    access.readonlyReason,
    '正在核对后端任务动作权限，请稍后再提交。'
  )
  assert.equal(access.byAction.complete.reasonCode, 'action_access_checking')
})

test('workflowTaskActionAccess: failed backend explain disables local fallback actions', () => {
  const access = buildWorkflowActionAccessState({
    adminProfile: admin(),
    task: task(),
    failed: true,
  })

  assert.equal(access.source, 'fallback_failed')
  assert.deepEqual(access.allowedModes, [])
  assert.equal(access.canRun('complete'), false)
  assert.equal(access.canRun('block'), false)
  assert.equal(access.canRun('reject'), false)
  assert.equal(access.canRun('urge'), false)
  assert.equal(
    access.readonlyReason,
    '无法核对后端任务动作权限，请刷新后重试。'
  )
  assert.equal(
    access.getReason('complete'),
    '无法核对后端任务动作权限，请刷新后重试。'
  )
  assert.equal(
    access.byAction.complete.reasonCode,
    'action_access_check_failed'
  )
})

test('workflowTaskActionAccess: loading backend explain does not expose fallback submit actions', () => {
  const access = buildWorkflowActionAccessState({
    adminProfile: admin(),
    task: task(),
    loading: true,
  })

  assert.equal(access.source, 'fallback_checking')
  assert.equal(access.loading, true)
  assert.deepEqual(access.allowedModes, [])
  assert.equal(access.canRun('complete'), false)
  assert.equal(access.canRun('block'), false)
  assert.equal(access.canRun('reject'), false)
  assert.equal(access.canRun('urge'), false)
  assert.equal(
    access.readonlyReason,
    '正在核对后端任务动作权限，请稍后再提交。'
  )
  assert.equal(access.byAction.complete.reasonCode, 'action_access_checking')
})

test('workflowTaskActionAccess: request outcome ignores stale and aborted responses', () => {
  const staleSuccess = resolveWorkflowActionAccessRequestOutcome({
    currentRequestID: 2,
    requestID: 1,
    taskKey: '42',
    data: { actions: [{ action_key: 'complete', allowed: false }] },
  })
  assert.equal(staleSuccess, null)

  const abortedFailure = resolveWorkflowActionAccessRequestOutcome({
    currentRequestID: 2,
    requestID: 2,
    taskKey: '42',
    error: new Error('aborted'),
    isAbortError: () => true,
  })
  assert.equal(abortedFailure, null)
})

test('workflowTaskActionAccess: current request outcome can update success or failure state', () => {
  const success = resolveWorkflowActionAccessRequestOutcome({
    currentRequestID: 3,
    requestID: 3,
    taskKey: '42',
    data: { actions: [{ action_key: 'complete', allowed: true }] },
  })
  assert.deepEqual(success, {
    taskKey: '42',
    data: { actions: [{ action_key: 'complete', allowed: true }] },
    loading: false,
    failed: false,
  })

  const failure = resolveWorkflowActionAccessRequestOutcome({
    currentRequestID: 3,
    requestID: 3,
    taskKey: '42',
    error: new Error('network failed'),
    isAbortError: () => false,
  })
  assert.deepEqual(failure, {
    taskKey: '42',
    data: null,
    loading: false,
    failed: true,
  })
})
