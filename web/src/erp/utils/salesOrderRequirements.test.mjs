import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSalesOrderItemParams } from './sourceOrderParams.mjs'
import { deriveSalesOrderItemAmount } from './sourceOrderAmounts.mjs'
import {
  salesOrderProductionQuantity,
  salesOrderRequirementName,
  salesOrderEngineeringLabel,
} from './salesOrderRequirements.mjs'

test('new demand is saved without fabricating a product or SKU', () => {
  const params = buildSalesOrderItemParams({
    requested_product_name: ' 新款玩偶 ',
    customer_product_no: 'C-01',
    ordered_quantity: '1000',
    pre_shipment_sample_quantity: '12',
    unit_id: 1,
    unit_price: '15',
    order_category: 'NEW',
    process_requirement: '刺绣',
  })
  assert.equal(params.requested_product_name, '新款玩偶')
  assert.equal(params.product_id, undefined)
  assert.equal(params.product_sku_id, undefined)
  assert.equal(params.pre_shipment_sample_quantity, '12')
  assert.equal(params.process_requirement, '刺绣')
  assert.equal(salesOrderProductionQuantity(params), '1012')
  assert.equal(Number(deriveSalesOrderItemAmount(params)), 15000)
})

test('production quantity preserves precision, zero and missing quantity', () => {
  assert.equal(
    salesOrderProductionQuantity({
      ordered_quantity: '0.1',
      pre_shipment_sample_quantity: '0.2',
    }),
    '0.3'
  )
  assert.equal(
    salesOrderProductionQuantity({
      ordered_quantity: '100',
      pre_shipment_sample_quantity: '0',
    }),
    '100'
  )
  assert.equal(
    salesOrderProductionQuantity({ pre_shipment_sample_quantity: '12' }),
    ''
  )
  assert.equal(
    salesOrderProductionQuantity({
      ordered_quantity: '2',
      pre_shipment_sample_quantity: '-1',
    }),
    ''
  )
})

test('customer demand remains visible after engineering associates a product', () => {
  const item = {
    product_id: 5,
    requested_product_name: '客户约定名称',
    product_name_snapshot: '工程产品名称',
    engineering_status: 'SAMPLING',
  }
  assert.equal(salesOrderRequirementName(item), '客户约定名称')
  assert.equal(salesOrderEngineeringLabel(item), '打样中')
  assert.equal(
    salesOrderEngineeringLabel({ ...item, product_id: null }),
    '待工程建档'
  )
  assert.equal(
    salesOrderRequirementName({ product_name_snapshot: '已有产品' }),
    '已有产品'
  )
})
