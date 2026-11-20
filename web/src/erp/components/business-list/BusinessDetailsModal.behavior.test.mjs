import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { salesOrderLineGroupKey } from '../../utils/sourceDocumentLineGroupKeys.mjs'

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

function groupedConfig(items) {
  return {
    items,
    title: '销售明细',
    getItemKey: (item) => item.id,
    getItemGroup: (item) => ({ key: salesOrderLineGroupKey(item), label: item.name || '未关联产品' }),
    getItemFields: (item) => [
      { label: '订单数量', value: item.quantity },
      { label: '单位', value: item.unit },
      { label: '金额', value: item.visibleAmount },
      { label: '备注', value: item.note, fullWidth: true },
    ],
  }
}

test('详情收起只留标题与条数，完整字段保值且独立操作与提示常显', async (t) => {
  const { render, flush, act } = await createReactTestHarness(t)
  const { default: BusinessDetailsModal } = await import('./BusinessDetailsModal.jsx')
  let actions = 0
  const items = [
    { id: 1, product_id: 1, name: '相同产品', quantity: '10', unit: '个', note: '第一行' },
    { id: 2, product_id: 1, name: '相同产品', quantity: '20', unit: '套', note: '第二行' },
    { id: 3, product_id: 2, name: '另一个产品', quantity: '0', unit: '个', amount: '999', note: '隐藏行' },
    { id: 4, product_id: 1, name: '相同产品', quantity: '30', unit: '个' },
    { id: 5, name: '同名未关联' }, { id: 6, name: '同名未关联' },
  ]
  await render(createElement(BusinessDetailsModal, {
    open: true,
    onClose() {},
    record: { id: 1 },
    lineItems: groupedConfig(items),
    extraActions: createElement('button', { onClick: () => { actions += 1 } }, '办理本单'),
  }, createElement('p', { role: 'alert' }, '独立异常提示')))
  await flush()
  const groups = [...document.querySelectorAll('.erp-business-detail-group')]
  assert.equal(groups.length, 5)
  const toggles = groups.map((group) => group.querySelector('.erp-business-detail-group__toggle'))
  assert.deepEqual(toggles.map((button) => button.getAttribute('aria-expanded')), ['true', 'false', 'false', 'false', 'false'])
  assert.equal(groups[0].querySelectorAll('.erp-business-row-item-card').length, 2, '不同单位的来源行保持独立，不合并数量')
  const fields = groups[1].querySelector('.erp-business-row-item-card__content')
  assert.deepEqual([...fields.querySelectorAll('dd')].map((node) => node.textContent), ['0', '个', '-', '隐藏行'])
  assert.equal(groups[1].textContent.includes('999'), false, '展开也不能重新取被权限隐藏的金额')
  assert.match(toggles[1].textContent, /另一个产品1 条/u)
  const action = [...document.querySelectorAll('.ant-modal-footer button')].find((button) => button.textContent === '办理本单')
  await act(async () => action.click())
  assert.equal(actions, 1)
  assert.equal(toggles[1].getAttribute('aria-expanded'), 'false', '独立业务入口不触发分组展开')
  await act(async () => toggles[1].click())
  assert.equal(groups[1].querySelector('.erp-business-row-item-card__content') === fields, true)
  assert.equal(groups[1].querySelector('.erp-business-detail-group__items').hidden, false)
  const button = (text) => [...document.querySelectorAll('.erp-business-detail-groups button')].find((node) => node.textContent === text)
  await act(async () => button('全部收起').click())
  assert.equal(groups.every((group) => group.querySelector('.erp-business-detail-group__items').hidden), true)
  assert.equal([...document.querySelectorAll('.erp-business-detail-group dt, .erp-business-detail-group dd')].every((field) => Boolean(field.closest('[hidden]'))), true, '收起后所有普通字段都归入隐藏内容，不在标题下另铺摘要')
  assert.equal(action.closest('[hidden]') === null, true, '底部办理入口持续可见')
  assert.equal(document.querySelector('[role="alert"]').closest('[hidden]') === null, true, '独立异常提示持续可见')
  assert.equal(document.querySelectorAll('.erp-business-row-item-card').length, 6)
  await act(async () => button('全部展开').click())
  assert.equal(groups.every((group) => !group.querySelector('.erp-business-detail-group__items').hidden), true)
})

test('明细分页各自保留展开状态，关闭和切换记录恢复首组，短详情不增加折叠', async (t) => {
  const { render, flush, act } = await createReactTestHarness(t)
  const { default: BusinessDetailsModal } = await import('./BusinessDetailsModal.jsx')
  const items = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, product_id: index + 1, name: `产品 ${index + 1}` }))
  const props = { open: true, onClose() {}, record: { id: 1 }, lineItems: groupedConfig(items) }
  await render(createElement(BusinessDetailsModal, props))
  await flush()
  const toggles = () => [...document.querySelectorAll('.erp-business-detail-group__toggle')]
  await act(async () => toggles()[2].click())
  await act(async () => document.querySelector('.ant-pagination-next button').click())
  assert.equal(toggles().length, 2)
  assert.deepEqual(toggles().map((button) => button.getAttribute('aria-expanded')), ['true', 'false'])
  await act(async () => toggles()[1].click())
  await act(async () => document.querySelector('.ant-pagination-prev button').click())
  assert.deepEqual(toggles().map((button) => button.getAttribute('aria-expanded')), ['true', 'false', 'true', ...Array(7).fill('false')])
  await render(createElement(BusinessDetailsModal, { ...props, open: false, record: null }))
  await flush()
  await render(createElement(BusinessDetailsModal, { ...props, record: { id: 2 } }))
  await flush()
  assert.deepEqual(toggles().map((button) => button.getAttribute('aria-expanded')), ['true', ...Array(9).fill('false')])
  await render(createElement(BusinessDetailsModal, { ...props, record: { id: 3 }, lineItems: groupedConfig(items.slice(0, 1)) }))
  await flush()
  assert.equal(toggles().length, 0)
  assert.equal(document.querySelectorAll('.erp-business-row-item-card').length, 1)
  await render(createElement(BusinessDetailsModal, { ...props, record: { id: 4 }, lineItems: { ...groupedConfig(items), getItemGroup: undefined } }))
  await flush()
  assert.equal(toggles().length, 0, '已有紧凑明细保留原结构')
})
