import test from 'node:test'
import assert from 'node:assert/strict'

import { yoyoosunCustomerPackage } from '../../config/customers/yoyoosun/customerPackage.mjs'

test('customer package businessFlows stay preview-only and do not write facts', () => {
  for (const flow of yoyoosunCustomerPackage.businessFlows) {
    assert.equal(flow.status, 'preview_only')
    assert.match(flow.guardrail, /真实|只有|才可|不等于|仍由|必须/)
    assert.doesNotMatch(flow.guardrail, /自动写|直接写|生成库存|生成财务/)
  }
})

test('yoyoosun production preview keeps sewing before handwork and points to the bounded WIP runtime', () => {
  const productionFlow = yoyoosunCustomerPackage.businessFlows.find(
    (flow) => flow.key === 'production_to_inventory'
  )

  assert(productionFlow)
  assert.equal(productionFlow.status, 'preview_only')
  assert.match(productionFlow.label, /车缝.*手工/u)
  assert.match(productionFlow.guardrail, /车缝.*手工/u)
  assert(
    productionFlow.guardrail.indexOf('车缝') <
      productionFlow.guardrail.indexOf('手工'),
    '客户生产流程预览必须先表达车缝，再表达手工'
  )
  assert.match(productionFlow.guardrail, /分别由生产经理决定本厂或外发/u)
  assert(productionFlow.modules.includes('production_orders'))
  assert(productionFlow.modules.includes('outsourcing_orders'))
  assert.match(
    productionFlow.guardrail,
    /正式 WIP 执行按生产订单冻结路线快照/u
  )
  assert.match(productionFlow.guardrail, /显式子批/u)
  assert.match(productionFlow.guardrail, /本厂车间移交或外发回仓/u)
  assert.match(productionFlow.guardrail, /条件性客户验货/u)
  assert.match(productionFlow.guardrail, /仍是客户流程预览，不替代生产、委外、质检或库存 usecase/u)
})

test('yoyoosun purchase preview keeps receipt draft and IQC before posted inventory', () => {
  const purchaseFlow = yoyoosunCustomerPackage.businessFlows.find(
    (flow) => flow.key === 'purchase_to_inventory'
  )

  assert(purchaseFlow)
  assert.equal(purchaseFlow.status, 'preview_only')
  assert.match(purchaseFlow.label, /采购、IQC 到库存/u)
  assert(purchaseFlow.modules.includes('quality_inspections'))
  assert.match(
    purchaseFlow.guardrail,
    /采购入库草稿和逐行待检，再由正式 IQC 判定；只有全部行合格或让步接收才允许 POSTED 入库/u
  )
})

test('customer package stateMachines do not override usecase lifecycle rules', () => {
  for (const machine of yoyoosunCustomerPackage.stateMachines) {
    assert.equal(machine.status, 'preview_only')
    assert.match(machine.guardrail, /不覆盖|不替代|不生成/)
  }
})

test('customer package processPolicies do not execute runtime commands', () => {
  for (const policy of yoyoosunCustomerPackage.processPolicies) {
    assert.equal(policy.status, 'preview_only')
    assert.match(policy.guardrail, /不能|不允许|不自动/)
  }
})
