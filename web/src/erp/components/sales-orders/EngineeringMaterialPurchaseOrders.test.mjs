import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { MaterialRequestStatus } from '../../../common/consts/statuses.generated.mjs'

test('generated purchase orders remain readable on the phone without document or print entries', async (t) => {
  const { render: renderTree, container } = await createReactTestHarness(t)
  const [{ default: Orders }, { MemoryRouter }] = await Promise.all([
    import('./EngineeringMaterialPurchaseOrders.jsx'),
    import('react-router-dom'),
  ])
  const request = { status: MaterialRequestStatus.APPROVED, purchase_orders: [{ id: 8, purchase_order_no: 'PO-008', supplier_name: '模拟供应商' }] }
  const render = (path) => renderTree(createElement(MemoryRouter, { key: path, initialEntries: [path], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Orders, { request, canOpen: true })))
  await render('/m/engineering/tasks')
  assert.match(container.textContent, /PO-008.*模拟供应商/u)
  assert.equal(container.querySelectorAll('a, button').length, 0)
  await render('/erp/task-board')
  assert.equal(container.querySelector('a').getAttribute('href'), '/erp/purchase/accessories?purchase_order_id=8')
  assert.equal(container.querySelectorAll('button').length, 1)
  assert.match(container.querySelector('button').textContent, /打印本次采购合同/u)
})
