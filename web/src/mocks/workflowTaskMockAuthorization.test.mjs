import assert from 'node:assert/strict'
import test from 'node:test'

import {
  workflowMockActionDecision,
  workflowMockCanCreateTask,
  workflowMockCanViewTask,
} from './workflowTaskMockAuthorization.mjs'

function profile({
  actions = [],
  disabled = false,
  id = 7,
  permissions = actions,
  roles = ['warehouse'],
  superAdmin = false,
} = {}) {
  return {
    id,
    disabled,
    is_super_admin: superAdmin,
    roles: roles.map((roleKey) => ({ role_key: roleKey })),
    permissions,
    effective_session: {
      actions,
      roles,
      workflow_visible_owner_role_keys_by_capability: Object.fromEntries(
        actions.map((action) => [action, roles])
      ),
    },
  }
}

function task(overrides = {}) {
  return {
    id: 42,
    task_group: 'warehouse_inbound',
    source_type: 'inbound',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    assignee_id: null,
    ...overrides,
  }
}

test('workflow mock authorization keeps view and assignee-exclusive action boundaries separate', () => {
  const admin = profile({
    actions: ['workflow.task.read', 'workflow.task.complete'],
  })
  const assignedToOther = task({ assignee_id: 99 })
  assert.equal(
    workflowMockCanViewTask(admin, admin.effective_session, assignedToOther),
    true
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: assignedToOther,
    }).allowed,
    false
  )

  const assignedToSelf = task({ assignee_id: admin.id })
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: assignedToSelf,
    }).allowed,
    true
  )
})

test('workflow mock authorization constrains super admin and keeps urge diagnostic privilege narrow', () => {
  const noEntitlement = profile({
    actions: [],
    permissions: [],
    roles: [],
    superAdmin: true,
  })
  for (const actionKey of ['complete', 'block', 'reject', 'resume', 'urge']) {
    assert.equal(
      workflowMockActionDecision({
        actionKey,
        adminProfile: noEntitlement,
        effectiveSession: noEntitlement.effective_session,
        task: task(),
      }).allowed,
      false
    )
  }

  const entitledSuperAdmin = profile({
    actions: ['workflow.task.complete', 'workflow.task.update'],
    roles: [],
    superAdmin: true,
  })
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: entitledSuperAdmin,
      effectiveSession: entitledSuperAdmin.effective_session,
      task: task(),
    }).allowed,
    false
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'urge',
      adminProfile: entitledSuperAdmin,
      effectiveSession: entitledSuperAdmin.effective_session,
      task: task(),
    }).allowed,
    true
  )
})

test('workflow mock authorization uses approve for boss order approval completion', () => {
  const approvalTask = task({
    task_group: 'order_approval',
    source_type: 'project-orders',
    owner_role_key: 'boss',
    required_capability_key: 'workflow.task.approve',
  })
  const approveOnly = profile({
    actions: ['workflow.task.approve'],
    roles: ['boss'],
  })
  const approveDecision = workflowMockActionDecision({
    actionKey: 'complete',
    adminProfile: approveOnly,
    effectiveSession: approveOnly.effective_session,
    task: approvalTask,
  })
  assert.equal(approveDecision.requiredPermission, 'workflow.task.approve')
  assert.equal(approveDecision.allowed, true)

  const completeOnly = profile({
    actions: ['workflow.task.complete'],
    roles: ['boss'],
  })
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: completeOnly,
      effectiveSession: completeOnly.effective_session,
      task: approvalTask,
    }).allowed,
    false
  )
})

test('workflow mock authorization rejects terminal, disabled and missing create entitlement', () => {
  const admin = profile({
    actions: ['workflow.task.create', 'workflow.task.complete'],
  })
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ task_status_key: 'done' }),
    }).reasonCode,
    'terminal_task'
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ task_status_key: 'rejected' }),
    }).reasonCode,
    'terminal_task'
  )
  assert.equal(workflowMockCanCreateTask(admin, admin.effective_session), true)
  const disabled = profile({
    actions: ['workflow.task.create'],
    disabled: true,
  })
  assert.equal(
    workflowMockCanCreateTask(disabled, disabled.effective_session),
    false
  )
  const noCreate = profile({ actions: ['workflow.task.read'] })
  assert.equal(
    workflowMockCanCreateTask(noCreate, noCreate.effective_session),
    false
  )
})

test('workflow mock authorization follows the backend status action matrix', () => {
  const admin = profile({
    actions: [
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
  })
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ task_status_key: 'blocked' }),
    }).reasonCode,
    'status_transition_not_allowed'
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'resume',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ task_status_key: 'blocked' }),
    }).allowed,
    true
  )
  for (const removedStatusKey of [
    'pending',
    'processing',
    'cancelled',
    'closed',
  ]) {
    const decision = workflowMockActionDecision({
      actionKey: 'block',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ task_status_key: removedStatusKey }),
    })
    assert.equal(decision.allowed, false)
    assert.equal(decision.reasonCode, 'status_transition_not_allowed')
  }
})

test('workflow mock authorization scopes each capability to effective owner roles', () => {
  const admin = profile({
    actions: ['workflow.task.read', 'workflow.task.complete'],
    permissions: ['workflow.task.read', 'workflow.task.complete'],
    roles: ['sales', 'finance'],
  })
  admin.effective_session.roles = ['finance']
  admin.effective_session.workflow_visible_owner_role_keys_by_capability = {
    'workflow.task.read': ['finance'],
    'workflow.task.complete': ['finance'],
  }

  assert.equal(
    workflowMockCanViewTask(
      admin,
      admin.effective_session,
      task({ owner_role_key: 'sales' })
    ),
    false
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ owner_role_key: 'sales' }),
    }).allowed,
    false
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: admin,
      effectiveSession: admin.effective_session,
      task: task({ owner_role_key: 'finance' }),
    }).allowed,
    true
  )
})

test('workflow mock mutation capability does not require workflow.task.read', () => {
  const actionOnly = profile({
    actions: ['workflow.task.complete'],
    permissions: ['workflow.task.complete'],
  })
  assert.equal(
    workflowMockCanViewTask(actionOnly, actionOnly.effective_session, task()),
    false
  )
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: actionOnly,
      effectiveSession: actionOnly.effective_session,
      task: task(),
    }).allowed,
    true
  )
})

test('workflow mock authorization fails closed when capability scope is absent', () => {
  const ambiguous = profile({
    actions: ['workflow.task.complete'],
    permissions: ['workflow.task.complete'],
    roles: ['sales', 'finance'],
  })
  delete ambiguous.effective_session
    .workflow_visible_owner_role_keys_by_capability
  assert.equal(
    workflowMockActionDecision({
      actionKey: 'complete',
      adminProfile: ambiguous,
      effectiveSession: ambiguous.effective_session,
      task: task({ owner_role_key: 'sales' }),
    }).allowed,
    false
  )
})
