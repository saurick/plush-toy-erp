import assert from 'node:assert/strict'
import test from 'node:test'

import { installFactRpcMocks } from './factRpcMocks.mjs'

function workflowScopes(roleKey, actions) {
  return Object.fromEntries(actions.map((action) => [action, [roleKey]]))
}

async function workflowMockHarness(
  adminProfile = {
    id: 1,
    is_super_admin: true,
    roles: [{ role_key: 'sales' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ]),
    },
  }
) {
  const handlers = new Map()
  const page = {
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installFactRpcMocks(page, {
    adminProfile,
    effectiveSession: adminProfile?.effective_session || null,
    nowUnix: () => 1_750_000_000,
    resolveDelayFromReferer: () => 0,
  })
  const handler = handlers.get('**/rpc/workflow')
  assert.equal(typeof handler, 'function')

  return async function call(method, params = {}) {
    let responseBody = null
    const request = {
      postDataJSON: () => ({
        jsonrpc: '2.0',
        id: method,
        method,
        params,
      }),
    }
    await handler({
      request: () => request,
      fulfill: async ({ body }) => {
        responseBody = JSON.parse(body)
      },
    })
    return responseBody
  }
}

test('style-l1 workflow mock keeps explain_action_access params canonical', async () => {
  const call = await workflowMockHarness()
  const unknownMethod = await call('unknown_workflow_method')
  assert.equal(unknownMethod.result.code, 40010)
  assert.match(unknownMethod.result.message, /unknown_workflow_method/u)
  const validCreateParams = {
    task_code: 'STYLE-L1-CREATE-REQUIRED',
    task_group: 'workflow-contract',
    task_name: '创建合同必填测试',
    source_type: 'workflow-contract',
    source_id: 10,
    owner_role_key: 'sales',
  }
  const beforeInvalidCreates = await call('list_tasks', {
    source_type: 'workflow-contract',
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
    const invalidCreate = await call('create_task', {
      task_code: `STYLE-L1-CREATE-STRICT-${key}`,
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 1,
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
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 0,
      owner_role_key: 'sales',
    },
    {
      task_code: 'INVALID-STATUS',
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 1,
      task_status_key: 'unknown',
      owner_role_key: 'sales',
    },
  ]) {
    const invalidCreate = await call('create_task', params)
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
    const invalidCreate = await call('create_task', params)
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const requiredStringKey of [
    'task_code',
    'task_group',
    'task_name',
    'source_type',
    'owner_role_key',
  ]) {
    const invalidCreate = await call('create_task', {
      ...validCreateParams,
      [requiredStringKey]: '   ',
    })
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const invalidSourceID of [0, -1, 1.5, '1']) {
    const invalidCreate = await call('create_task', {
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
    const invalidCreate = await call('create_task', {
      ...validCreateParams,
      due_at: invalidDueAt,
    })
    assert.equal(invalidCreate.result.code, 40010)
  }
  const afterInvalidCreates = await call('list_tasks', {
    source_type: 'workflow-contract',
  })
  assert.equal(afterInvalidCreates.result.data.total, beforeInvalidCreateCount)

  const defaultStatusCreated = await call('create_task', validCreateParams)
  assert.equal(defaultStatusCreated.result.code, 0)
  assert.equal(defaultStatusCreated.result.data.task.task_status_key, 'pending')

  const created = await call('create_task', {
    task_code: 'STYLE-L1-EXPLAIN-CONTRACT',
    task_group: 'workflow-contract',
    task_name: '动作权限合同测试',
    source_type: 'workflow-contract',
    source_id: 1,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  assert.equal(created.result.code, 0)
  const taskID = created.result.data.task.id

  const paddedStatusAction = await call('complete_task_action', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-padded-complete',
    action_key: ' complete ',
  })
  assert.equal(paddedStatusAction.result.code, 40010)
  const paddedUrgeAction = await call('urge_task', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-padded-urge',
    action: ' urge_task ',
    reason: '请尽快处理',
  })
  assert.equal(paddedUrgeAction.result.code, 40010)

  const allActions = await call('explain_action_access', { task_id: taskID })
  assert.equal(allActions.result.code, 0)
  assert.deepEqual(
    allActions.result.data.actions.map((item) => item.action_key),
    ['complete', 'block', 'reject', 'urge']
  )
  assert.equal(
    allActions.result.data.actions.find((item) => item.action_key === 'reject')
      .required_permission,
    'workflow.task.reject'
  )
  assert.equal(
    allActions.result.data.actions.find((item) => item.action_key === 'urge')
      .status_key,
    ''
  )

  for (const actionKey of ['complete', 'block', 'reject', 'urge']) {
    const exact = await call('explain_action_access', {
      task_id: taskID,
      action_key: actionKey,
    })
    assert.equal(exact.result.code, 0)
    assert.equal(exact.result.data.action.action_key, actionKey)
  }

  for (const params of [
    { id: taskID },
    { task_id: taskID, action: 'complete' },
    { task_id: taskID, action_key: '' },
    { task_id: taskID, action_key: '   ' },
    { task_id: taskID, action_key: 1 },
    { task_id: taskID, action_key: ' complete ' },
    { task_id: taskID, action_key: 'done' },
    { task_id: taskID, action_key: 'blocked' },
    { task_id: taskID, action_key: 'rejected' },
    { task_id: taskID, action_key: 'urge_task' },
    { task_id: taskID, action_key: 'escalate' },
    { task_id: taskID, action_key: 'complete', unknown: true },
  ]) {
    const invalid = await call('explain_action_access', params)
    assert.equal(invalid.result.code, 40010)
  }

  const completed = await call('complete_task_action', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-terminal-explain',
    action_key: 'complete',
    payload: {},
  })
  assert.equal(completed.result.code, 0)

  const terminalActions = await call('explain_action_access', {
    task_id: taskID,
  })
  assert.equal(terminalActions.result.code, 0)
  for (const action of terminalActions.result.data.actions) {
    assert.equal(action.allowed, false)
    assert.equal(action.reason_code, 'terminal_task')
    assert.equal(action.reason, '该任务已结束，只能查看上下文。')
  }
})

test('style-l1 workflow mock serves the dedicated task board projection', async () => {
  const call = await workflowMockHarness()
  for (let index = 1; index <= 10; index += 1) {
    const created = await call('create_task', {
      task_code: `STYLE-L1-BOARD-${index}`,
      task_group: 'shipment_release',
      task_name: `任务看板分页 ${index}`,
      source_type: 'shipping-release',
      source_id: index,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    })
    assert.equal(created.result.code, 0)
  }

  const overview = await call('get_task_board', { limit: 5, offset: 0 })
  assert.equal(overview.result.code, 0)
  assert.equal(overview.result.data.total, 10)
  assert.deepEqual(overview.result.data.counts, {
    actionable: 10,
    exception: 0,
    due: 0,
    finished: 0,
  })
  assert.equal(overview.result.data.lanes.length, 4)
  assert.equal(overview.result.data.lanes[0].tasks.length, 5)

  const focused = await call('get_task_board', {
    lane_key: 'actionable',
    limit: 8,
    offset: 8,
  })
  assert.equal(focused.result.code, 0)
  assert.equal(focused.result.data.lanes.length, 1)
  assert.equal(focused.result.data.lanes[0].total, 10)
  assert.equal(focused.result.data.lanes[0].tasks.length, 2)
})

test('style-l1 workflow explain mock fails closed on permission and owner mismatch', async () => {
  const missingPermissionCall = await workflowMockHarness({
    id: 2,
    is_super_admin: false,
    roles: [{ role_key: 'sales' }],
    permissions: ['workflow.task.read', 'workflow.task.create'],
    effective_session: {
      actions: ['workflow.task.read', 'workflow.task.create'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
      ]),
    },
  })
  const missingPermissionTask = await missingPermissionCall('create_task', {
    task_code: 'STYLE-L1-MISSING-PERMISSION',
    task_group: 'workflow-contract',
    task_name: '权限缺失测试',
    source_type: 'workflow-contract',
    source_id: 2,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const deniedByPermission = await missingPermissionCall(
    'explain_action_access',
    { task_id: missingPermissionTask.result.data.task.id }
  )
  assert.equal(
    deniedByPermission.result.data.actions.find(
      (item) => item.action_key === 'complete'
    ).reason_code,
    'missing_permission'
  )
  assert.equal(
    deniedByPermission.result.data.actions.some((item) => item.allowed),
    false
  )

  const wrongOwnerCall = await workflowMockHarness({
    id: 3,
    is_super_admin: false,
    roles: [{ role_key: 'purchase' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ],
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['sales'],
        'workflow.task.create': ['purchase'],
        'workflow.task.complete': ['purchase'],
        'workflow.task.update': ['purchase'],
        'workflow.task.reject': ['purchase'],
      },
    },
  })
  const wrongOwnerTask = await wrongOwnerCall('create_task', {
    task_code: 'STYLE-L1-WRONG-OWNER',
    task_group: 'workflow-contract',
    task_name: '责任角色不匹配测试',
    source_type: 'workflow-contract',
    source_id: 3,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const deniedByOwner = await wrongOwnerCall('explain_action_access', {
    task_id: wrongOwnerTask.result.data.task.id,
  })
  assert.equal(
    deniedByOwner.result.data.actions.find(
      (item) => item.action_key === 'complete'
    ).reason_code,
    'not_owner_or_assignee'
  )
  assert.equal(
    deniedByOwner.result.data.actions.some((item) => item.allowed),
    false
  )
  for (const action of deniedByOwner.result.data.actions) {
    assert.equal(action.owner_role_matched, false)
    assert.equal(action.work_pool_role_matched, false)
    assert.equal(action.work_pool_entitlement_matched, false)
    assert.equal(action.work_pool_entitlement_scope_matched, false)
  }

  const missingEffectiveActionCall = await workflowMockHarness({
    id: 4,
    is_super_admin: false,
    roles: [{ role_key: 'sales' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: ['workflow.task.read', 'workflow.task.create'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
      ]),
    },
  })
  const missingEffectiveActionTask = await missingEffectiveActionCall(
    'create_task',
    {
      task_code: 'STYLE-L1-MISSING-EFFECTIVE-SESSION',
      task_group: 'workflow-contract',
      task_name: '生效权限缺失测试',
      source_type: 'workflow-contract',
      source_id: 4,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    }
  )
  const deniedByEffectiveSession = await missingEffectiveActionCall(
    'explain_action_access',
    { task_id: missingEffectiveActionTask.result.data.task.id }
  )
  assert.equal(
    deniedByEffectiveSession.result.data.actions.some((item) => item.allowed),
    false
  )
  assert.equal(
    deniedByEffectiveSession.result.data.actions.every(
      (item) => item.reason_code === 'missing_permission'
    ),
    true
  )
})

test('style-l1 workflow mutation routes enforce the same permission, owner and assignee decisions', async () => {
  const ownerCall = await workflowMockHarness({
    id: 7,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'warehouse',
        ['workflow.task.read', 'workflow.task.create', 'workflow.task.complete']
      ),
    },
  })
  const assignedOther = await ownerCall('create_task', {
    task_code: 'STYLE-L1-ASSIGNED-OTHER',
    task_group: 'workflow-contract',
    task_name: '已指派给其他人',
    source_type: 'workflow-contract',
    source_id: 71,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    assignee_id: 99,
  })
  const visibleAssignedOther = await ownerCall('list_tasks', {
    source_id: 71,
  })
  assert.equal(visibleAssignedOther.result.data.total, 1)
  const deniedAssignedOther = await ownerCall('complete_task_action', {
    task_id: assignedOther.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-assigned-other-complete',
    action_key: 'complete',
  })
  assert.equal(deniedAssignedOther.result.code, 40010)

  const assignedSelf = await ownerCall('create_task', {
    task_code: 'STYLE-L1-ASSIGNED-SELF',
    task_group: 'workflow-contract',
    task_name: '已指派给当前处理人',
    source_type: 'workflow-contract',
    source_id: 72,
    task_status_key: 'ready',
    owner_role_key: 'sales',
    assignee_id: 7,
  })
  const allowedAssignedSelf = await ownerCall('complete_task_action', {
    task_id: assignedSelf.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-assigned-self-complete',
    action_key: 'complete',
  })
  assert.equal(allowedAssignedSelf.result.code, 0)

  const superCall = await workflowMockHarness({
    id: 8,
    is_super_admin: true,
    roles: [{ role_key: 'finance' }],
    permissions: [],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'finance',
        [
          'workflow.task.read',
          'workflow.task.create',
          'workflow.task.complete',
          'workflow.task.update',
        ]
      ),
    },
  })
  const warehouseTask = await superCall('create_task', {
    task_code: 'STYLE-L1-SUPER-NON-OWNER',
    task_group: 'workflow-contract',
    task_name: 'super admin 非责任岗位',
    source_type: 'workflow-contract',
    source_id: 73,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
  })
  const deniedSuperComplete = await superCall('complete_task_action', {
    task_id: warehouseTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-super-non-owner-complete',
    action_key: 'complete',
  })
  assert.equal(deniedSuperComplete.result.code, 40010)
  const allowedSuperUrge = await superCall('urge_task', {
    task_id: warehouseTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-super-urge',
    action: 'urge_task',
    reason: '请尽快处理',
  })
  assert.equal(allowedSuperUrge.result.code, 0)
})

test('style-l1 workflow boss approval completion uses approve entitlement', async () => {
  const createBossApproval = async (call, suffix) =>
    call('create_task', {
      task_code: `STYLE-L1-BOSS-APPROVAL-${suffix}`,
      task_group: 'order_approval',
      task_name: '老板订单审批',
      source_type: 'project-orders',
      source_id: suffix === 'ALLOW' ? 81 : 82,
      task_status_key: 'ready',
      owner_role_key: 'boss',
    })
  const approveOnlyCall = await workflowMockHarness({
    id: 9,
    is_super_admin: false,
    roles: [{ role_key: 'boss' }],
    permissions: ['workflow.task.create', 'workflow.task.approve'],
    effective_session: {
      actions: ['workflow.task.create', 'workflow.task.approve'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('boss', [
        'workflow.task.create',
        'workflow.task.approve',
      ]),
    },
  })
  const allowedTask = await createBossApproval(approveOnlyCall, 'ALLOW')
  const allowed = await approveOnlyCall('complete_task_action', {
    task_id: allowedTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-boss-approve-only',
    action_key: 'complete',
  })
  assert.equal(allowed.result.code, 0)

  const completeOnlyCall = await workflowMockHarness({
    id: 10,
    is_super_admin: false,
    roles: [{ role_key: 'boss' }],
    permissions: ['workflow.task.create', 'workflow.task.complete'],
    effective_session: {
      actions: ['workflow.task.create', 'workflow.task.complete'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('boss', [
        'workflow.task.create',
        'workflow.task.complete',
      ]),
    },
  })
  const deniedTask = await createBossApproval(completeOnlyCall, 'DENY')
  const denied = await completeOnlyCall('complete_task_action', {
    task_id: deniedTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-boss-complete-only',
    action_key: 'complete',
  })
  assert.equal(denied.result.code, 40010)
})

test('style-l1 workflow mutations replay exact receipts before terminal and CAS checks', async () => {
  const cases = [
    {
      method: 'complete_task_action',
      actionKey: 'complete',
      extra: {},
    },
    {
      method: 'block_task_action',
      actionKey: 'block',
      extra: { reason: '等待资料' },
    },
    {
      method: 'reject_task_action',
      actionKey: 'reject',
      extra: { reason: '资料不完整' },
    },
    {
      method: 'urge_task',
      actionKey: null,
      extra: { action: 'urge_task', reason: '请尽快处理' },
    },
  ]

  for (const [index, item] of cases.entries()) {
    const call = await workflowMockHarness()
    const created = await call('create_task', {
      task_code: `STYLE-L1-REPLAY-${index}`,
      task_group: 'workflow-contract',
      task_name: `精确重放 ${item.method}`,
      source_type: 'workflow-contract',
      source_id: 900 + index,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    })
    const params = {
      task_id: created.result.data.task.id,
      expected_version: 1,
      idempotency_key: `style-l1-replay-${item.method}`,
      ...(item.actionKey ? { action_key: item.actionKey } : {}),
      ...item.extra,
    }
    const first = await call(item.method, params)
    assert.equal(first.result.code, 0, item.method)
    const replay = await call(item.method, {
      ...params,
      expected_version: 999,
    })
    assert.equal(replay.result.code, 0, item.method)
    assert.deepEqual(
      replay.result.data.task,
      first.result.data.task,
      item.method
    )
  }
})

test('style-l1 workflow mutation accepts action capability without read capability', async () => {
  const admin = {
    id: 12,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.create', 'workflow.task.complete'],
    effective_session: {
      actions: ['workflow.task.create', 'workflow.task.complete'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'warehouse',
        ['workflow.task.create', 'workflow.task.complete']
      ),
    },
  }
  const call = await workflowMockHarness(admin)
  const created = await call('create_task', {
    task_code: 'STYLE-L1-ACTION-ONLY',
    task_group: 'workflow-contract',
    task_name: '动作权限独立于读取权限',
    source_type: 'workflow-contract',
    source_id: 990,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
  })
  admin.permissions = ['workflow.task.complete']
  admin.effective_session.actions = ['workflow.task.complete']
  admin.effective_session.workflow_visible_owner_role_keys_by_capability =
    workflowScopes('warehouse', ['workflow.task.complete'])

  const hidden = await call('list_tasks', { source_id: 990 })
  assert.equal(hidden.result.code, 40010)
  const completed = await call('complete_task_action', {
    task_id: created.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-action-only-complete',
    action_key: 'complete',
  })
  assert.equal(completed.result.code, 0)
})
