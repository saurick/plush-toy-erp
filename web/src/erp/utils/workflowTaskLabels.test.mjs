import assert from 'node:assert/strict'
import test from 'node:test'

import { getWorkflowTaskGroupLabel } from './workflowTaskLabels.mjs'

test('workflow source task groups use岗位可读中文标签', () => {
  assert.equal(getWorkflowTaskGroupLabel('production_scheduling'), '生产排程')
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
