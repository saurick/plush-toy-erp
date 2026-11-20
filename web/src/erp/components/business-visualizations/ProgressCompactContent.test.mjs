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
  assert.equal(container.querySelectorAll('img, button').length, 0)
  assert.ok(container.querySelector('.erp-progress-product--empty'))
})

test('clearing progress core fields preserves labeled positions without stale values', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  const row = { ...base, product: '小熊', product_id: 7, product_count: 1 }
  await render(createElement(ProgressIdentity, { row }))
  await render(createElement(ProgressIdentity, { row: { ...row, product: '', order_no: '', customer: '' } }))
  assert.match(container.textContent, /产品名称未填写.*单据编号未提供.*客户未填写/u)
  assert.doesNotMatch(container.textContent, /小熊|SO-001|示例客户/u)
})

test('progress without image access preserves product and order instead of suggesting no upload', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  await render(createElement(ProgressIdentity, { row: { ...base, product: '小熊', product_id: 7, product_count: 1 } }))
  assert.match(container.textContent, /无权限.*小熊.*SO-001/u)
  assert.doesNotMatch(container.textContent, /暂无图|未关联产品/u)
  assert.equal(container.querySelectorAll('button').length, 0)
})

test('a known multi-product snapshot remains associated even without a representative image reference', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { ProgressIdentity } = await import('./ProgressCompactContent.jsx')
  await render(createElement(ProgressIdentity, { row: { ...base, product: '小熊', product_id: 0, product_count: 3 } }))
  assert.match(container.textContent, /暂无图.*小熊 等 3 项/u)
  assert.doesNotMatch(container.textContent, /未关联产品/u)
})
