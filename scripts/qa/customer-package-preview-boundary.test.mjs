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
