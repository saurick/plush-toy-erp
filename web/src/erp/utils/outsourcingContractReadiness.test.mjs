import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOutsourcingContractConfirmationSummary,
  inspectOutsourcingContractReadiness,
} from './outsourcingContractReadiness.mjs'

function completeOrder() {
  return {
    currency: 'CNY',
    expected_return_date: 1_786_320_000,
    contract_party_snapshot: {
      buyerCompany: '东莞市永绅玩具有限公司',
      buyerContact: '委外负责人',
      buyerPhone: '0769-123456',
      buyerAddress: '东莞茶山',
    },
    supplier_snapshot: {
      name: '示例加工厂',
      contact_name: '李厂长',
      contact_phone: '13900000000',
      address: '加工园 1 号',
    },
  }
}

test('outsourcingContractReadiness: complete contract returns confirmation summary', () => {
  const items = [
    {
      processing_item: '脸*1',
      outsourcing_quantity: '10',
      unit_price: '1.25',
      line_status: 'open',
    },
    {
      processing_item: '耳*2',
      outsourcing_quantity: '1',
      unit_price: '5.50',
      amount: '5.50',
      line_status: 'open',
    },
  ]
  const summary = buildOutsourcingContractConfirmationSummary(
    completeOrder(),
    items,
    3
  )
  assert.equal(summary.complete, true)
  assert.deepEqual(summary.missing, [])
  assert.equal(summary.buyerName, '东莞市永绅玩具有限公司')
  assert.equal(summary.supplierName, '示例加工厂')
  assert.equal(summary.lineCount, 2)
  assert.equal(summary.totalAmountText, '18.00 CNY')
  assert.equal(summary.attachmentCount, 3)
})

test('outsourcingContractReadiness: missing party B and processing item blocks confirmation', () => {
  const order = completeOrder()
  order.supplier_snapshot = { name: '示例加工厂' }
  const readiness = inspectOutsourcingContractReadiness(order, [
    { processing_item: ' ', line_status: 'open' },
    { processing_item: '已取消行可忽略', line_status: 'canceled' },
  ])
  assert.equal(readiness.complete, false)
  assert.deepEqual(readiness.missing, [
    '乙方联系人',
    '乙方联系电话',
    '乙方地址',
    '每条明细的加工项目',
    '每条明细的数量及单价',
  ])
})

test('business data consistency: outsourcing confirmation preserves exact money and unknown price', () => {
  const order = { ...completeOrder(), currency: 'USD' }
  const line = {
    processing_item: '裁片',
    outsourcing_quantity: '1',
    unit_price: '2.675',
  }
  const exact = inspectOutsourcingContractReadiness(order, [line])
  assert.equal(exact.totalAmount, '2.675')
  assert.equal(exact.totalAmountText, '2.675 USD')
  assert.equal(exact.complete, true)
  const missing = inspectOutsourcingContractReadiness(order, [
    { ...line, unit_price: '', amount: '2.675' },
  ])
  assert.equal(missing.complete, false)
  assert.equal(missing.totalAmount, '')
  assert.equal(missing.totalAmountText, '待补齐金额')
  const zero = inspectOutsourcingContractReadiness(order, [
    { ...line, unit_price: '0' },
  ])
  assert.equal(zero.totalAmountText, '0.00 USD')
})
