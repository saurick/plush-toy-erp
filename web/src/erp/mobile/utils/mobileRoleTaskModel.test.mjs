import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TERMINAL_TASK_STATUS_KEYS,
  buildTaskFactRows,
  canUrgeTask,
  getMobileTaskGroupLabel,
  isTaskBlockedProgress,
  resolveMobileActionLabel,
  resolveMobileTaskBusinessStatus,
  resolveTaskListMeta,
  supportsRejectedAction,
} from './mobileRoleTaskModel.mjs'

function task(overrides = {}) {
  return {
    id: 1,
    task_name: '移动端任务',
    task_group: 'order_approval',
    task_status_key: 'ready',
    business_status_key: 'project_pending',
    owner_role_key: 'boss',
    source_type: 'project-orders',
    source_id: 10,
    source_no: 'SO-001',
    priority: 0,
    alert_level: 'info',
    payload: {},
    ...overrides,
  }
}

test('mobileRoleTaskModel: 订单审批移动端完成后映射为已审批业务状态', () => {
  assert.equal(
    resolveMobileTaskBusinessStatus(task(), 'done'),
    'project_approved'
  )
  assert.equal(
    resolveMobileTaskBusinessStatus(task(), 'rejected'),
    'project_pending'
  )
})

test('mobileRoleTaskModel: 来料检验阻塞和完成按协同业务状态映射', () => {
  const iqcTask = task({
    task_group: 'purchase_iqc',
    business_status_key: 'iqc_pending',
    owner_role_key: 'quality',
    source_type: 'inbound',
  })

  assert.equal(
    resolveMobileTaskBusinessStatus(iqcTask, 'done'),
    'warehouse_inbound_pending'
  )
  assert.equal(resolveMobileTaskBusinessStatus(iqcTask, 'blocked'), 'qc_failed')
})

test('mobileRoleTaskModel: 催办权限区分终态、PMC 风险任务和财务任务', () => {
  assert.equal(
    canUrgeTask('pmc', task({ task_status_key: 'done', priority: 5 })),
    false
  )
  assert.equal(canUrgeTask('pmc', task({ task_status_key: 'blocked' })), true)
  assert.equal(canUrgeTask('pmc', task({ task_status_key: 'rejected' })), true)
  assert.equal(
    canUrgeTask(
      'finance',
      task({ owner_role_key: 'finance', source_type: 'receivables' })
    ),
    true
  )
})

test('mobileRoleTaskModel: blocked / rejected 保持待办风险状态而非已办终态', () => {
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('done'), true)
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('blocked'), false)
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('rejected'), false)
  assert.equal(
    isTaskBlockedProgress(task({ task_status_key: 'blocked' })),
    true
  )
  assert.equal(
    isTaskBlockedProgress(task({ task_status_key: 'rejected' })),
    true
  )
})

test('mobileRoleTaskModel: 退回动作只开放给匹配业务岗位', () => {
  assert.equal(
    supportsRejectedAction(
      'quality',
      task({
        task_group: 'purchase_iqc',
        business_status_key: 'iqc_pending',
        owner_role_key: 'quality',
        source_type: 'inbound',
      })
    ),
    true
  )
  assert.equal(supportsRejectedAction('purchase', task()), false)
})

test('mobileRoleTaskModel: 最近动态动作展示不透出技术 action key', () => {
  assert.equal(resolveMobileActionLabel('blocked'), '阻塞')
  assert.equal(resolveMobileActionLabel('done'), '完成')
  assert.equal(resolveMobileActionLabel('rejected'), '退回')
  assert.equal(resolveMobileActionLabel('urge'), '催办')
  assert.equal(resolveMobileActionLabel('unknown_action'), '移动处理')
})

test('mobileRoleTaskModel: 任务摘要和事实行不透出技术 task_group', () => {
  assert.equal(getMobileTaskGroupLabel('shipment_release'), '出货放行协同')
  assert.equal(getMobileTaskGroupLabel('unknown_task_group'), '业务协同')

  const unknownGroupTask = task({
    task_group: 'unknown_task_group',
    payload: {},
    priority: 2,
  })
  const listMeta = resolveTaskListMeta(unknownGroupTask)
  const factRows = buildTaskFactRows({
    ...unknownGroupTask,
    task_status_label: '可执行',
    updated_at: 1_800_000_000,
  })

  assert.equal(listMeta.includes('unknown_task_group'), false)
  assert.equal(listMeta.includes('任务：业务协同'), true)
  assert.equal(
    factRows.some(([label]) => label === '分组'),
    false
  )
  assert(
    factRows.some(
      ([label, value]) =>
        label === '任务类型' &&
        value.includes('业务协同') &&
        !value.includes('unknown_task_group')
    )
  )
})

test('mobileRoleTaskModel: 详情事实行保留财务金额字段', () => {
  const rows = buildTaskFactRows(
    task({
      task_status_label: '可执行',
      business_status_label: '待对账',
      task_group: 'payable_registration',
      updated_at: 1_800_000_000,
      payload: {
        supplier_name: '联调供应商',
        amount: '100.00',
        tax_rate: '13%',
        tax_amount: '13.00',
        amount_with_tax: '113.00',
        amount_without_tax: '100.00',
      },
    })
  )

  assert(
    rows.some(
      ([label, value]) => label === '金额/税率' && value.includes('113.00')
    )
  )
})
