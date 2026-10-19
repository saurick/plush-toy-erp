import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('表格标题装饰后任务摘要仍显示正式字段名称与原记录值', async (t) => {
  const { render } = await createReactTestHarness(t)
  const [{ useBusinessColumnOrder }, { default: BusinessRecordDetails }] = await Promise.all([import('./BusinessListToolbarActions.jsx'), import('./BusinessRecordDetails.jsx')])
  const columns = [{ dataIndex: 'number', title: '单号' }, { dataIndex: 'party', title: '客户', exportTitle: '客户名称' }]
  function TaskSource() {
    const { tableColumns } = useBusinessColumnOrder({ columns, moduleKey: 'sales-orders', adminProfile: { id: 1, is_super_admin: true } })
    return createElement(BusinessRecordDetails, { columns: tableColumns, record: { number: 'SIM-91', party: '模拟客户' }, column: 1 })
  }
  await render(createElement(TaskSource))
  assert.deepEqual([...document.querySelectorAll('.ant-descriptions-item-label')].map((label) => label.textContent), ['单号', '客户名称'])
  assert.match(document.body.textContent, /SIM-91/u)
  assert.match(document.body.textContent, /模拟客户/u)
  assert.doesNotMatch(document.body.textContent, /\[object Object\]/u)
})

test('detail records distinguish empty, loading, failed and paginated results', async (t) => {
  const { render, flush, act } = await createReactTestHarness(t)
  const { default: BusinessDetailsModal } = await import('./BusinessDetailsModal.jsx')
  const props = { open: true, onClose() {}, columns: [], title: '明细验证', record: { id: 1 } }
  const config = { emptyDescription: '尚无核销明细', title: '核销明细', getItemKey: (item) => item.id, getItemLabel: (item) => `第 ${item.id} 行`, getItemFields: (item) => [{ label: '金额', value: item.amount }] }
  for (const size of [0, 1, 10, 11]) {
    const items = Array.from({ length: size }, (_, index) => ({ id: index + 1, amount: '12.5' }))
    await render(createElement(BusinessDetailsModal, { ...props, lineItems: { ...config, items } }))
    await flush()
    const modal = document.querySelector('.erp-business-details-modal')
    assert.equal(modal.querySelectorAll('.ant-pagination').length, size === 0 ? 0 : 1)
    assert.equal(modal.textContent.includes('尚无核销明细'), size === 0)
    assert.equal(modal.textContent.includes('共 0 条'), false)
    assert.equal(modal.querySelectorAll('.erp-business-row-item-card').length, Math.min(size, 10))
  }
  let rejectRead
  const load = () => new Promise((_, reject) => { rejectRead = reject })
  await render(createElement(BusinessDetailsModal, { ...props, record: { id: 2 }, lineItems: { ...config, load } }))
  await flush()
  assert.equal(document.querySelector('.erp-business-details-modal').textContent.includes('尚无核销明细'), false, '读取中不能当成空结果')
  await act(async () => rejectRead(new Error('simulated detail failure')))
  await flush()
  const modal = document.querySelector('.erp-business-details-modal')
  assert.equal(modal.querySelectorAll('.ant-alert-error').length, 1)
  assert.equal(modal.textContent.includes('尚无核销明细'), false, '读取失败不能当成空结果')
  assert.match(modal.textContent, /重试/u)
})
