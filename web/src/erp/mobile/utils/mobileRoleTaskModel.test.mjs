import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TERMINAL_TASK_STATUS_KEYS,
  buildTaskFactRows,
  canOpenMobileTaskDetailAction,
  canUrgeTask,
  getMobileTaskActionReasonDraftKey,
  getMobileRoleLabel,
  getMobileTaskGroupLabel,
  getTaskQueueTone,
  isTaskBlockedProgress,
  normalizeMobileTaskActionKey,
  requiresMobileActionFeedback,
  resolveDetailActionLabel,
  resolveMobileActionDisplayLabel,
  resolveMobileActionLabel,
  resolveMobileTaskDueLabel,
  resolveMobileTaskActionReason,
  resolveMobileTaskBusinessStatus,
  resolveMobileTaskStatusLabel,
  resolveTaskReason,
  resolveTaskReasonLabel,
  resolveTaskBusinessChip,
  resolveTaskBusinessStatusLabel,
  resolveTaskRelatedSourceLabel,
  resolveTaskListMeta,
  resolveTaskSourceLabel,
  supportsRejectedAction,
} from './mobileRoleTaskModel.mjs'

const VISIBLE_TECHNICAL_TASK_PATTERN =
  /owner_role_key|task_status_key|task_group|source_type|source_id|payload|unknown_task_group|unknown_source|unknown_payable|payable_type|#987|TASK-|987/u

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
  assert.equal(canUrgeTask('pmc', task({ task_status_key: 'rejected' })), false)
  assert.equal(
    canUrgeTask(
      'finance',
      task({ owner_role_key: 'finance', source_type: 'receivables' })
    ),
    true
  )
})

test('mobileRoleTaskModel: rejected 是已办终态且 blocked 保持待办风险态', () => {
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('done'), true)
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('blocked'), false)
  assert.equal(TERMINAL_TASK_STATUS_KEYS.has('rejected'), true)
  assert.equal(
    isTaskBlockedProgress(task({ task_status_key: 'blocked' })),
    true
  )
  assert.equal(
    isTaskBlockedProgress(task({ task_status_key: 'rejected' })),
    false
  )
  const rejectedTask = task({
    task_status_key: 'rejected',
    blocked_reason: '旧阻塞原因',
    payload: { rejected_reason: '资料不完整' },
  })
  assert.equal(resolveTaskReason(rejectedTask), '资料不完整')
  assert.equal(resolveTaskReasonLabel(rejectedTask), '退回原因')
})

test('mobileRoleTaskModel: 移动端动作原因按动作隔离，退回不复用阻塞原因', () => {
  const blockedTask = task({
    task_status_key: 'blocked',
    blocked_reason: '旧阻塞原因',
    payload: { blocked_reason: '旧阻塞原因' },
  })
  const rejectedTask = task({
    task_status_key: 'rejected',
    blocked_reason: '旧阻塞原因',
    payload: { rejected_reason: '资料不完整' },
  })
  const blockedDraftKey = getMobileTaskActionReasonDraftKey(
    blockedTask,
    'blocked'
  )
  const rejectedDraftKey = getMobileTaskActionReasonDraftKey(
    rejectedTask,
    'rejected'
  )

  assert.equal(normalizeMobileTaskActionKey('block'), 'blocked')
  assert.equal(normalizeMobileTaskActionKey('reject'), 'rejected')
  assert.equal(blockedDraftKey, '1:blocked')
  assert.equal(rejectedDraftKey, '1:rejected')
  assert.equal(
    resolveMobileTaskActionReason({
      task: blockedTask,
      action: 'blocked',
      reasonDrafts: { [blockedDraftKey]: '本次阻塞草稿' },
    }),
    '本次阻塞草稿'
  )
  assert.equal(
    resolveMobileTaskActionReason({
      task: blockedTask,
      action: 'rejected',
      reasonDrafts: { [blockedDraftKey]: '本次阻塞草稿' },
    }),
    ''
  )
  assert.equal(
    resolveMobileTaskActionReason({
      task: rejectedTask,
      action: 'rejected',
      reasonDrafts: { [blockedDraftKey]: '本次阻塞草稿' },
    }),
    '资料不完整'
  )
  assert.equal(
    resolveMobileTaskActionReason({
      task: rejectedTask,
      action: 'rejected',
      reasonDrafts: { [rejectedDraftKey]: '本次退回草稿' },
    }),
    '本次退回草稿'
  )
})

test('mobileRoleTaskModel: 退回动作只开放给匹配业务岗位', () => {
  const qualityIqcTask = task({
    task_group: 'purchase_iqc',
    business_status_key: 'iqc_pending',
    owner_role_key: 'quality',
    source_type: 'inbound',
  })
  const purchaseTask = task({
    task_group: 'purchase_follow_up',
    owner_role_key: 'purchase',
    source_type: 'accessories-purchase',
  })

  assert.equal(supportsRejectedAction('quality', qualityIqcTask), true)
  assert.equal(supportsRejectedAction('purchase', task()), false)
  assert.equal(
    canOpenMobileTaskDetailAction('quality', qualityIqcTask, 'rejected'),
    true
  )
  assert.equal(
    canOpenMobileTaskDetailAction('purchase', purchaseTask, 'done'),
    true
  )
  assert.equal(
    canOpenMobileTaskDetailAction('purchase', purchaseTask, 'blocked'),
    true
  )
  assert.equal(
    canOpenMobileTaskDetailAction('purchase', purchaseTask, 'rejected'),
    false
  )
  assert.equal(
    canOpenMobileTaskDetailAction(
      'pmc',
      task({ task_status_key: 'blocked', owner_role_key: 'quality' }),
      'urge'
    ),
    true
  )
  assert.equal(
    canOpenMobileTaskDetailAction(
      'pmc',
      task({ task_status_key: 'done', owner_role_key: 'quality' }),
      'urge'
    ),
    false
  )
})

test('mobileRoleTaskModel: 最近动态动作展示不透出技术 action key', () => {
  assert.equal(resolveDetailActionLabel('done'), '完成说明（可选）')
  assert.equal(requiresMobileActionFeedback('done'), true)
  assert.equal(requiresMobileActionFeedback('blocked'), false)
  assert.equal(resolveMobileActionLabel('blocked'), '阻塞')
  assert.equal(resolveMobileActionLabel('block'), '阻塞')
  assert.equal(resolveMobileActionLabel('done'), '完成')
  assert.equal(resolveMobileActionLabel('complete'), '完成')
  assert.equal(resolveMobileActionLabel('rejected'), '退回')
  assert.equal(resolveMobileActionLabel('reject'), '退回')
  assert.equal(resolveMobileActionLabel('urge'), '催办')
  assert.equal(resolveMobileActionLabel('unknown_action'), '移动处理')
  assert.equal(
    resolveMobileActionDisplayLabel({
      action_key: 'done',
      action_label: 'unknown_action_key',
    }),
    '完成'
  )
  assert.equal(
    resolveMobileActionDisplayLabel({
      action_key: 'unknown_action',
      action_label: 'unknown_action_key',
    }),
    '移动处理'
  )
  assert.equal(
    resolveMobileActionDisplayLabel({
      action_key: '',
      action_label: '人工复核',
    }),
    '人工复核'
  )
  assert.doesNotMatch(
    resolveMobileActionDisplayLabel({
      action_key: 'unknown_action',
      action_label: 'unknown_action_key',
    }),
    /unknown_action_key/u
  )
})

test('mobileRoleTaskModel: 缺少状态 label 时移动端仍展示中文状态', () => {
  const readyTask = task({
    task_status_key: 'ready',
    task_status_label: '',
    updated_at: 1_800_000_000,
  })
  const unknownTask = task({
    task_status_key: 'unknown_task_status_key',
    task_status_label: '',
    updated_at: 1_800_000_000,
  })
  const factRowsText = buildTaskFactRows(readyTask)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')
  const unknownFactRowsText = buildTaskFactRows(unknownTask)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')

  assert.equal(resolveMobileTaskStatusLabel(readyTask), '可执行')
  assert.equal(resolveMobileTaskStatusLabel(unknownTask), '未知状态')
  assert.match(factRowsText, /状态：可执行/u)
  assert.match(unknownFactRowsText, /状态：未知状态/u)
  assert.doesNotMatch(unknownFactRowsText, /unknown_task_status_key/u)
})

test('mobileRoleTaskModel: 业务状态详情不信任 raw label 并按 key 回补中文', () => {
  const missingLabelTask = task({
    business_status_key: 'warehouse_inbound_pending',
    business_status_label: '',
    task_status_label: '可执行',
    updated_at: 1_800_000_000,
  })
  const rawLabelTask = task({
    business_status_key: 'unknown_business_status_key',
    business_status_label: 'unknown_business_status_key',
    task_status_label: '可执行',
    updated_at: 1_800_000_000,
  })
  const rawFactRowsText = buildTaskFactRows(rawLabelTask)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')

  assert.equal(resolveTaskBusinessStatusLabel(missingLabelTask), '待确认入库')
  assert.equal(resolveTaskBusinessChip(missingLabelTask), '待确认入库')
  assert(
    buildTaskFactRows(missingLabelTask).some(
      ([label, value]) => label === '业务' && value === '待确认入库'
    )
  )
  assert.equal(resolveTaskBusinessStatusLabel(rawLabelTask), '未知业务状态')
  assert.equal(resolveTaskBusinessChip(rawLabelTask), '未知业务状态')
  assert.doesNotMatch(rawFactRowsText, /unknown_business_status_key/u)
  assert.equal(VISIBLE_TECHNICAL_TASK_PATTERN.test(rawFactRowsText), false)
})

test('mobileRoleTaskModel: 到期状态不透出 raw due status label', () => {
  const rawDueTask = task({
    alert_level: 'warning',
    due_status: '',
    due_status_label: 'unknown_due_status_key',
    due_at_label: '',
  })
  const knownDueTask = task({
    due_status: 'due_soon',
    due_status_label: 'unknown_due_status_key',
    due_at_label: '',
  })
  const dueAtTask = task({
    due_status: 'overdue',
    due_status_label: 'unknown_due_status_key',
    due_at_label: '今天 18:00',
  })

  assert.equal(resolveMobileTaskDueLabel(rawDueTask), '-')
  assert.equal(resolveMobileTaskDueLabel(knownDueTask), '即将到期')
  assert.equal(resolveMobileTaskDueLabel(dueAtTask), '今天 18:00')
  assert.equal(getTaskQueueTone(rawDueTask), '-')
  assert.doesNotMatch(
    resolveMobileTaskDueLabel(rawDueTask),
    /unknown_due_status_key/u
  )
  assert.doesNotMatch(getTaskQueueTone(rawDueTask), /unknown_due_status_key/u)
})

test('mobileRoleTaskModel: 岗位标签复用共享角色显示口径', () => {
  assert.equal(getMobileRoleLabel('warehouse'), '仓库')
  assert.equal(getMobileRoleLabel('quality'), '品质')
  assert.equal(getMobileRoleLabel('production'), '生产经理')
  assert.equal(getMobileRoleLabel('business'), '业务')
  assert.equal(getMobileRoleLabel('unknown_role'), '岗位')
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

test('mobileRoleTaskModel: 来源和应付类型不透出内部 key 或 source_id', () => {
  const technicalTask = task({
    task_group: 'unknown_task_group',
    source_type: 'unknown_source',
    source_id: 987,
    source_no: '',
    task_status_label: '可执行',
    business_status_label: '待登记',
    updated_at: 1_800_000_000,
    payload: {
      supplier_name: '联调供应商',
      payable_type: 'unknown_payable',
    },
  })

  const sourceLabel = resolveTaskSourceLabel(technicalTask)
  const listMeta = resolveTaskListMeta(technicalTask)
  const factRowsText = buildTaskFactRows(technicalTask)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')
  const visibleText = [sourceLabel, listMeta, factRowsText].join('\n')

  assert.equal(sourceLabel, '已关联业务来源')
  assert.equal(listMeta.includes('类型：应付事项'), true)
  assert.equal(factRowsText.includes('应付类型：应付事项'), true)
  assert.equal(VISIBLE_TECHNICAL_TASK_PATTERN.test(visibleText), false)
})

test('mobileRoleTaskModel: 详情关联来源不把非订单任务误写成订单', () => {
  const inboundTask = task({
    task_group: 'warehouse_inbound',
    source_type: 'inbound',
    source_no: 'IN-001',
  })
  const unknownSourceTask = task({
    source_type: 'unknown_source',
    source_id: 987,
    source_no: '',
  })

  assert.equal(resolveTaskRelatedSourceLabel(inboundTask), '来源：IN-001')
  assert.equal(
    resolveTaskRelatedSourceLabel(unknownSourceTask),
    '来源：已关联业务来源'
  )
  assert.doesNotMatch(resolveTaskRelatedSourceLabel(inboundTask), /^订单：/u)
  assert.equal(
    VISIBLE_TECHNICAL_TASK_PATTERN.test(
      resolveTaskRelatedSourceLabel(unknownSourceTask)
    ),
    false
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

test('mobileRoleTaskModel: 移动端任务数量和金额保留显式 0 值', () => {
  const quantityTask = task({
    task_group: 'purchase_iqc',
    payload: {
      material_name: '填充棉',
      quantity: 0,
      unit: 'kg',
    },
  })
  const financeRows = buildTaskFactRows(
    task({
      task_group: 'payable_registration',
      payload: {
        amount: 0,
        tax_rate: '0%',
        tax_amount: 0,
        amount_with_tax: 0,
        amount_without_tax: 0,
      },
    })
  )
  const amountRow = financeRows.find(([label]) => label === '金额/税率')

  assert.equal(
    resolveTaskListMeta(quantityTask),
    '物料：填充棉 ｜ 规格：- ｜ 数量：0kg'
  )
  assert(
    buildTaskFactRows(quantityTask).some(
      ([label, value]) => label === '供应/物料/数量' && value.endsWith('/ 0kg')
    )
  )
  assert.equal(amountRow?.[1], '0 / 0% / 税额 0 / 含税 0 / 不含税 0')
})

test('mobileRoleTaskModel: IQC 结果事实行不透出 raw qc result key', () => {
  const rows = buildTaskFactRows(
    task({
      task_status_label: '可执行',
      business_status_label: '待检',
      task_group: 'purchase_iqc',
      owner_role_key: 'quality',
      source_type: 'inbound',
      updated_at: 1_800_000_000,
      payload: {
        qc_result: 'pass',
      },
    })
  )
  const visibleText = rows
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')

  assert.match(visibleText, /IQC 结果：合格/u)
  assert.doesNotMatch(visibleText, /\bpass\b/u)
  assert.equal(VISIBLE_TECHNICAL_TASK_PATTERN.test(visibleText), false)

  const unknownRows = buildTaskFactRows(
    task({
      task_status_label: '可执行',
      business_status_label: '待检',
      task_group: 'purchase_iqc',
      owner_role_key: 'quality',
      source_type: 'inbound',
      updated_at: 1_800_000_000,
      payload: {
        qc_result: 'custom_qc_result_key',
      },
    })
  )
  const unknownVisibleText = unknownRows
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')

  assert.match(unknownVisibleText, /IQC 结果：质检已记录/u)
  assert.doesNotMatch(unknownVisibleText, /custom_qc_result_key/u)
})
