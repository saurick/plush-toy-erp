import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { register } from 'node:module'
import { MemoryRouter } from 'react-router-dom'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('任务工程编辑器仅在选定订单后读取，关闭后不遗留内容或查询空订单', async (t) => {
  // Vite permits this generated JSON import without Node's JSON attribute.
  register(`data:text/javascript,${encodeURIComponent(`
    export async function load(url, context, nextLoad) {
      return nextLoad(url, url.endsWith('/bomImportExamplePreview.generated.json')
        ? { ...context, importAttributes: { ...context.importAttributes, type: 'json' } }
        : context)
    }
  `)}`, import.meta.url)
  const reads = []
  const ui = await businessFormHarness(t, { rpc: async (method, params) => {
    reads.push({ method, params })
    if (method === 'get_sales_order') {
      assert.equal(params.id, 1)
      return { data: { sales_order: { id: 1, order_no: 'SIM-ORDER-1', version: 1, lifecycle_status: 'draft' } } }
    }
    assert.equal(method, 'list_sales_order_items')
    assert.equal(params.sales_order_id, 1)
    return { data: { sales_order_items: [], total: 0, limit: params.limit, offset: params.offset } }
  } })
  const [{ default: Entry }, { BusinessPageContext }] = await Promise.all([
    import('./SalesOrderEngineeringModal.jsx'),
    import('../../hooks/useBusinessPageContext.js'),
  ])
  const context = { adminProfile: { id: 1, is_super_admin: true }, taskBusiness: { readOnly: true, task: { id: 1, source_type: 'sales_order', source_id: 1, task_group: 'engineering_data' } } }
  const render = (orderID) => ui.render(h(MemoryRouter, { initialEntries: ['/erp/task-board'] }, h(BusinessPageContext.Provider, { value: context }, h(Entry, { orderID, onCancel() {} }))))
  await render(null)
  assert.equal(reads.length, 0, '未打开编辑器不读取订单或产品')
  assert.equal(document.querySelector('.ant-alert') === null, true)
  await render(1)
  assert.ok(reads.some((read) => read.method === 'get_sales_order'))
  assert.ok(reads.some((read) => read.method === 'list_sales_order_items'))
  assert.match(document.body.textContent, /本单已没有待办理的产品/u)
  assert.equal(document.querySelector('.ant-alert') === null, true)
  const openedReads = reads.length
  await render(null)
  assert.equal(reads.length, openedReads, '关闭不发起新的来源查询')
  assert.doesNotMatch(document.body.textContent, /本单已没有待办理的产品|读取本单产品失败/u)
})
