import assert from 'node:assert/strict'
import test from 'node:test'
import { engineeringBOMReturnState, getEngineeringBOMAction, readBOMPreparation, readEngineeringBOMReturn } from './bomPreparationNavigation.mjs'

const boms = [{ id: 8, product_id: 3, status: 'DRAFT' }, { id: 9, product_id: 3, status: 'ACTIVE' }]
const permissions = { canRead: true, canCreate: true, canUpdate: true }
const preparation = { adminID: 1, orderID: 2, itemID: 5, productID: 3, bomID: 8, mode: 'edit', orderNo: 'SO-TEST', quantityText: '100', returnPath: '/erp/sales/project-orders/sales-orders?keyword=SO-TEST' }

test('BOM 编制动作区分未关联、草稿和启用版本，尊重编辑权限与产品关联', () => {
  const action = (options = {}) => getEngineeringBOMAction({ productID: 3, boms, ...permissions, ...options })
  assert.equal(action().label, '编制 BOM')
  assert.equal(action({ bomID: 8 }).label, '继续编制')
  assert.equal(action({ bomID: 9 }).mode, 'view')
  assert.equal(action({ bomID: 8, canUpdate: false }).mode, 'view')
  assert.equal(action({ canRead: false }), null)
  assert.ok(action({ productID: null }).disabledReason)
  assert.ok(action({ productID: 4, bomID: 8 }).disabledReason)
  assert.ok(action({ canCreate: false, canUpdate: false }).disabledReason)
})

test('BOM 跳转与返回只接受当前账号、明确订单行及本地销售页面', () => {
  assert.deepEqual(readBOMPreparation({ bomPreparation: preparation }, 1), preparation)
  assert.equal(readBOMPreparation({ bomPreparation: preparation }, 2), null)
  for (const overrides of [{ productID: -1 }, { itemID: '5' }, { mode: 'create' }, { returnPath: 'https://example.com' }, { returnPath: '/erp/other' }, { returnPath: '/erp/sales/project-orders/sales-orders?x=<script>' }]) {
    assert.equal(readBOMPreparation({ bomPreparation: { ...preparation, ...overrides } }, 1), null)
  }
  const mobile = { ...preparation, returnPath: '/m/engineering/handle/sales/project-orders/sales-orders' }
  assert.deepEqual(readBOMPreparation({ bomPreparation: mobile }, 1), mobile)
  const state = engineeringBOMReturnState(preparation, 12)
  assert.deepEqual(readEngineeringBOMReturn(state, 1), { adminID: 1, orderID: 2, itemID: 5, productID: 3, bomID: 12 })
  assert.equal(readEngineeringBOMReturn(state, 2), null)
  assert.equal(readEngineeringBOMReturn({ engineeringBOMReturn: { ...state.engineeringBOMReturn, adminID: undefined } }, undefined), null)
  assert.equal(readEngineeringBOMReturn({ engineeringBOMReturn: { ...state.engineeringBOMReturn, bomID: '12' } }, 1), null)
})
