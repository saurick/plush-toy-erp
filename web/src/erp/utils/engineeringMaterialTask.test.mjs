import assert from 'node:assert/strict'
import test from 'node:test'
import {
  engineeringMaterialTaskEntryPath,
  canReadEngineeringMaterial,
  canListEngineeringMaterial,
  getEngineeringMaterialOrderContext,
  getEngineeringMaterialPermissions,
  getEngineeringMaterialTaskContext,
} from './engineeringMaterialTask.mjs'
import { resolveWorkflowTaskEntryPath } from './dashboardTaskDisplay.mjs'
import {
  getWorkflowTaskStatusActionModes,
  isWorkflowApprovalTask,
} from './workflowTaskActionContract.mjs'
import { canViewWorkflowApprovalInbox } from './workflowApprovalInbox.mjs'

function fixture(stage = 'boss') {
  const group =
    stage === 'revision'
      ? 'engineering_material_revision'
      : `engineering_material_${stage}_review`
  const permission =
    stage === 'revision'
      ? 'engineering.material.submit'
      : `engineering.material.${stage}_approve`
  const task = {
    id: 7,
    version: 1,
    source_id: 3,
    source_type: 'engineering_material_request',
    task_group: group,
    task_code: `source-material-${stage}${stage === 'revision' ? '' : '-review'}-3`,
    owner_role_key: stage === 'revision' ? 'engineering' : stage,
    required_capability_key: permission,
    task_status_key: 'ready',
    payload: {
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'engineering_material_request.approval',
      source_task_intent_hash: 'a'.repeat(64),
      sales_order_id: 8,
      engineering_material_request_id: 3,
    },
  }
  const reads = [
    'engineering.material.read',
    'sales_order.read',
    'erp.workbench.read',
  ]
  const profile = {
    id: 12,
    permissions: [permission, ...reads],
    effective_session: {
      actions: [permission, ...reads],
      pages: ['global-dashboard'],
    },
  }
  return { task, profile }
}

test('each material stage opens its exact source; approval stages appear in the inbox', () => {
  for (const stage of ['boss', 'finance', 'revision']) {
    const { task, profile } = fixture(stage)
    assert.deepEqual(getEngineeringMaterialTaskContext(task), {
      orderID: 8,
      requestID: 3,
    })
    assert.equal(
      resolveWorkflowTaskEntryPath(task),
      '/erp/sales/project-orders/sales-orders?material_request_id=3&sales_order_id=8'
    )
    assert.equal(isWorkflowApprovalTask(task), stage !== 'revision')
    assert.equal(canViewWorkflowApprovalInbox(profile), stage !== 'revision')
    const permissions = getEngineeringMaterialPermissions(profile, task)
    assert.equal(permissions[stage === 'revision' ? 'submit' : stage], true)
    assert.deepEqual(getWorkflowTaskStatusActionModes(task), ['urge'])
  }
})

test('fixed entry and approval require effective source access without a pricing dependency', () => {
  const { profile, task } = fixture('finance')
  assert.equal(canListEngineeringMaterial(profile), true)
  assert.equal(
    canListEngineeringMaterial({
      ...profile,
      effective_session: { ...profile.effective_session, pages: [] },
    }),
    false
  )
  for (const missing of ['engineering.material.read', 'sales_order.read']) {
    const limited = {
      ...profile,
      permissions: profile.permissions.filter((value) => value !== missing),
    }
    assert.equal(
      getEngineeringMaterialPermissions(limited, task).finance,
      false
    )
  }
})

test('source identity cannot be supplied through an unrelated or altered task', () => {
  const { task } = fixture()
  for (const patch of [
    { source_id: 4 },
    { task_code: 'manual-task' },
    { owner_role_key: 'finance' },
    { required_capability_key: 'workflow.task.complete' },
    { payload: { ...task.payload, source_task_intent_hash: '' } },
  ]) {
    assert.equal(getEngineeringMaterialTaskContext({ ...task, ...patch }), null)
    assert.equal(engineeringMaterialTaskEntryPath({ ...task, ...patch }), '')
  }
})

test('engineering task summary reads its source order without gaining material approval actions', () => {
  const { profile } = fixture('revision')
  const task = {
    id: 9,
    source_type: 'sales_order',
    source_id: 8,
    task_group: 'engineering_data',
    task_status_key: 'ready',
    payload: { sales_order_id: 999, engineering_material_request_id: 999 },
  }
  assert.deepEqual(getEngineeringMaterialOrderContext(task), { orderID: 8 })
  assert.equal(getEngineeringMaterialTaskContext(task), null)
  assert.equal(canReadEngineeringMaterial(profile), true)
  assert.deepEqual(getEngineeringMaterialPermissions(profile, task), {
    submit: false,
    boss: false,
    finance: false,
    purchaseRead: false,
  })
  for (const patch of [
    { task_group: 'order_approval' },
    { source_type: 'purchase_order' },
    { source_id: null },
    { source_id: -1 },
    { source_id: 'invalid' },
  ]) {
    assert.equal(
      getEngineeringMaterialOrderContext({ ...task, ...patch }),
      null
    )
  }
  for (const missing of ['engineering.material.read', 'sales_order.read']) {
    assert.equal(
      canReadEngineeringMaterial({
        ...profile,
        permissions: profile.permissions.filter((value) => value !== missing),
      }),
      false
    )
  }
})

test('history, another assignee and missing effective permission cannot edit the source', () => {
  const { task, profile } = fixture()
  for (const status of ['done', 'rejected', 'withdrawn']) {
    const history = { ...task, task_status_key: status }
    assert.equal(
      getEngineeringMaterialPermissions(profile, history).boss,
      false
    )
    assert.deepEqual(getWorkflowTaskStatusActionModes(history), [])
    assert.ok(
      engineeringMaterialTaskEntryPath(history).includes(
        'material_request_id=3'
      )
    )
  }
  assert.equal(
    getEngineeringMaterialPermissions(profile, { ...task, assignee_id: 13 })
      .boss,
    false
  )
  assert.equal(
    getEngineeringMaterialPermissions(profile, { ...task, assignee_id: 12 })
      .boss,
    true
  )
  assert.equal(
    getEngineeringMaterialPermissions(
      { ...profile, effective_session: { actions: [] } },
      task
    ).boss,
    false
  )
})
