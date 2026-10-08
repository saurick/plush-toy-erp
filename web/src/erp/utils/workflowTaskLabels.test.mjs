import assert from 'node:assert/strict'
import test from 'node:test'

import { formatWorkflowResponsibility, getWorkflowTaskGroupLabel } from './workflowTaskLabels.mjs'

test('workflow source task groups use岗位可读中文标签', () => {
  assert.equal(getWorkflowTaskGroupLabel('production_scheduling'), '排产确认')
  assert.equal(getWorkflowTaskGroupLabel('production_exception'), '生产异常')
  assert.equal(
    getWorkflowTaskGroupLabel('shipment_finance_approval'),
    '出货财务审批'
  )
})

test('trial role task groups use岗位可读中文标签', () => {
  assert.equal(getWorkflowTaskGroupLabel('trial_boss_work'), '老板协同')
  assert.equal(getWorkflowTaskGroupLabel('trial_sales_work'), '业务跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_purchase_work'), '采购跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_production_work'), '生产跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_warehouse_work'), '仓库跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_finance_work'), '财务跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_pmc_work'), '计划跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_quality_work'), '品质跟进')
  assert.equal(getWorkflowTaskGroupLabel('trial_engineering_work'), '工程跟进')
})

test('responsibility copy distinguishes pending work, approval and a named handler without implying every member must act', () => {
  assert.equal(formatWorkflowResponsibility({ roleKey: 'engineering', pending: true }), '岗位：工程 · 待处理')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'boss', pending: true, approval: true }), '岗位：老板 · 待审批')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'engineering', assigneeName: '张三', pending: true }), '岗位：工程 · 处理人：张三 · 待处理')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'finance', assigneeName: '李四', pending: true, approval: true }), '岗位：财务 · 处理人：李四 · 待审批')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'production', pending: true }), '岗位：生产经理 · 待处理')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'engineering' }), '岗位：工程')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'engineering', assigneeName: '张三' }), '岗位：工程 · 处理人：张三')
  assert.equal(formatWorkflowResponsibility({ roleKey: 'internal-unknown', pending: true }), '岗位：待确认')
})
