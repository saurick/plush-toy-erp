import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('image placeholders retain accessible states without reading attachments', async (t) => {
  let requests = 0
  const harness = await businessFormHarness(t, { rpc: async () => { requests += 1; return { data: {} } } })
  const { default: Placeholder } = await import('./WorkflowTaskImagePlaceholder.jsx')
  for (const [state, label, description] of [
    ['empty', '暂无图', '暂无可显示的图片'],
    ['loading', '加载中', '图片加载中'],
    ['failed', '加载失败', '图片暂不可用'],
    ['denied', '无权限', '无图片读取权限'],
  ]) {
    await harness.render(h(Placeholder, { item: { kind: 'product', productID: 13, imageAttachmentID: 17, name: '演示产品' }, state }))
    const root = document.querySelector('.erp-task-product-image')
    assert.equal(root.dataset.imageState, state)
    assert.equal(root.textContent, label)
    assert.equal(root.querySelector('[role="img"]').getAttribute('aria-label'), `演示产品：${description}`)
    assert.equal(root.querySelectorAll('button, img').length, 0)
  }
  await harness.render(h(Placeholder, { item: { kind: 'material', name: '演示材料' } }))
  assert.equal(document.querySelector('.erp-task-product-image').textContent, '物料')
  assert.equal(requests, 0)
})
