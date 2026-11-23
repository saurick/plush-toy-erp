import assert from 'node:assert/strict'
import { createElement } from 'react'
import test from 'node:test'
import { createReactTestHarness, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

const base = { order_no: 'SO-001', status: 'draft', customer: '示例客户' }

test('empty progress association clears stale product text and keeps business identity', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  await render(createElement(ProgressIdentity, { row: { ...base, product: '旧产品', product_id: 0, product_count: 0 } }))
  assert.match(container.textContent, /未关联产品／物料.*SO-001.*示例客户/u)
  assert.doesNotMatch(container.textContent, /旧产品/u)
  assert.equal(container.querySelectorAll('img').length, 0)
  assert.deepEqual(Array.from(container.querySelectorAll('button'), (button) => button.getAttribute('aria-label')), ['复制订单号'])
  assert.ok(container.querySelector('.erp-progress-product--empty'))
})

test('clearing progress core fields preserves labeled positions without stale values', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  const row = { ...base, product: '小熊', product_id: 7, product_count: 1 }
  await render(createElement(ProgressIdentity, { row }))
  assert.ok(container.querySelector('button[aria-label="复制订单号"]'))
  await render(createElement(ProgressIdentity, { row: { ...row, product: '', order_no: '', customer: '' } }))
  assert.match(container.textContent, /产品名称未填写.*单据编号未提供.*客户未填写/u)
  assert.doesNotMatch(container.textContent, /小熊|SO-001|示例客户/u)
  assert.equal(container.querySelectorAll('button[aria-label="复制订单号"]').length, 0)
})

test('progress without image access preserves product and order instead of suggesting no upload', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  await render(createElement(ProgressIdentity, { row: { ...base, product: '小熊', product_id: 7, product_count: 1 } }))
  assert.match(container.textContent, /无权限.*小熊.*SO-001/u)
  assert.doesNotMatch(container.textContent, /暂无图|未关联产品/u)
  assert.deepEqual(Array.from(container.querySelectorAll('button'), (button) => button.getAttribute('aria-label')), ['复制订单号'])
})

test('a known multi-product snapshot remains associated even without a representative image reference', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  await render(createElement(ProgressIdentity, { row: { ...base, product: '小熊', product_id: 0, product_count: 3 } }))
  assert.match(container.textContent, /暂无图.*小熊 等 3 项/u)
  assert.doesNotMatch(container.textContent, /未关联产品/u)
})

test('progress stacks only distinct linked products with gallery access', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  const { BusinessPageContext } = await import('../../hooks/useBusinessPageContext.js')
  const permissions = ['product.read', 'sales_order.read', 'sales_order_item.read']
  const profile = { id: 1, permissions, effective_session: { actions: permissions } }
  const row = { ...base, id: 1, view: 'orders', product: '待建档款式', product_id: 0, product_count: 3, linked_product_count: 2 }
  const show = (record, adminProfile = profile) => render(createElement(BusinessPageContext.Provider, { value: { adminProfile } }, createElement(ProgressIdentity, { row: record })))
  await show(row)
  assert.ok(container.querySelector('.erp-product-gallery__stack .erp-task-product-image--placeholder'))
  assert.match(container.textContent, /待建档款式 等 3 项/u)
  await show({ ...row, linked_product_count: 1 })
  assert.equal(container.querySelectorAll('.erp-product-gallery__stack').length, 0)
  await show(row, { ...profile, permissions: ['product.read'] })
  assert.equal(container.querySelectorAll('.erp-product-gallery__stack').length, 0)
})

test('mixed-unit delivery shows completed lines and clears the bar when the link is unknown', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressOrderDelivery } = await import('./ProgressCompactContent.jsx')
  const row = { ...base,
view: 'orders',
ordered_quantity: null,
shipped_quantity: null,
delivery_known: true,
    product_count: 4,
delivered_line_count: 1 }
  await render(createElement(ProgressOrderDelivery, { row }))
  assert.equal(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'), '25')
  assert.match(container.textContent, /明细交齐 25%/u)
  await render(createElement(ProgressOrderDelivery, { row: { ...row, delivery_known: false, delivered_line_count: undefined } }))
  assert.equal(container.querySelectorAll('[role="progressbar"]').length, 0)
  assert.match(container.textContent, /关联待核对/u)
})
