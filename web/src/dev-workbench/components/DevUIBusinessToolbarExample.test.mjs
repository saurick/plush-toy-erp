import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('四业务组合覆盖继承的业务和页面动作上下文，仅操作本地样例', async (t) => {
  const { container, render, act, flush } = await createReactTestHarness(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => { requests.push(String(url)); throw new Error('演示不应请求业务') })
  const [{ default: Example }, { MemoryRouter, Routes, Route, Outlet }, { BusinessPageContext }, { ERPPageActionsContext }] = await Promise.all([
    import('./DevUIBusinessToolbarExample.jsx'), import('react-router-dom'),
    import('../../erp/hooks/useBusinessPageContext.js'), import('../../erp/components/ERPPageActions.jsx'),
  ])
  const actions = []
  const inherited = { adminProfile: { id: 1, is_super_admin: true }, taskBusiness: { readOnly: true }, moduleWorkspace: { tabs: [{ key: 'unrelated' }] } }
  const storageBefore = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]
  const route = h(Route, { element: h(Outlet, { context: inherited }) }, h(Route, { path: '*', element: h(Example) }))
  await render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(BusinessPageContext.Provider, { value: inherited }, h(ERPPageActionsContext.Provider, { value: { onRefresh: () => actions.push('refresh'), onSplit: () => actions.push('split') } }, h(Routes, null, route)))))
  for (const business of ['inventory', 'purchase', 'tasks', 'history', 'inventory']) {
    const position = ['inventory', 'purchase', 'tasks', 'history'].indexOf(business)
    const button = container.querySelectorAll('[aria-label="组合示例业务"] input')[position]
    await act(async () => button.click())
    await flush()
    const panel = container.querySelector(`section[data-business="${business}"]`)
    assert.equal(panel.hidden, false)
    assert.equal(panel.querySelectorAll('.erp-business-toolbar-workspace').length, 1)
    assert.equal(panel.querySelectorAll('.ant-table').length, 1)
    assert.equal(panel.querySelectorAll('.erp-business-operation-panel__search input').length, 1)
    assert.equal(panel.querySelectorAll('[aria-label="刷新当前页"], [aria-label="分栏"]').length, 0)
  }
  const inventory = container.querySelector('[data-business="inventory"]')
  const navigation = inventory.querySelector('[aria-label="库存查询内容分类"]')
  const command = inventory.querySelector('.erp-business-operation-panel__command')
  await act(async () => navigation.querySelectorAll('[role="tab"]')[1].click())
  assert.equal(inventory.querySelector('[aria-label="库存查询内容分类"]') === navigation, true)
  assert.equal(inventory.querySelector('.erp-business-operation-panel__command') === command, true)
  assert.equal(navigation.querySelector('[aria-selected="true"]').textContent, '库存批次')
  await act(async () => [...container.querySelectorAll('button')].find((node) => node.textContent === '恢复示例').click())
  assert.equal(container.querySelectorAll('[data-business]').length, 1)
  assert.deepEqual(requests, [])
  assert.deepEqual(actions, [])
  assert.deepEqual([JSON.stringify(localStorage), JSON.stringify(sessionStorage)], storageBefore)
})

test('采购查询视角与生产办理入口保持各自位置、业务对象与本地查看边界', async (t) => {
  const { container, render, act, flush } = await createReactTestHarness(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => { requests.push(String(url)); throw new Error('演示不应请求业务') })
  const [{ default: Example }, { MemoryRouter }] = await Promise.all([
    import('./DevUIBusinessToolbarExample.jsx'), import('react-router-dom'),
  ])
  const storageBefore = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]
  await render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Example)))
  const purchase = container.querySelector('[aria-label="采购页签位置对照"]')
  const production = container.querySelector('[aria-label="生产页签位置对照"]')
  const purchaseNavigation = purchase.querySelector('[role="tablist"]')
  const productionNavigation = production.querySelector('[role="tablist"]')
  const purchaseSearch = purchase.querySelector('input[aria-label="采购对照搜索"]')
  const productionSearch = production.querySelector('input[aria-label="生产对照搜索"]')
  assert.equal(purchase.querySelector('.erp-business-page-header-card [role="tablist"]'), null)
  assert.equal(purchase.querySelector('.erp-business-operation-panel [role="tablist"]') === purchaseNavigation, true)
  assert.equal(production.querySelector('.erp-business-page-header-card [role="tablist"]') === productionNavigation, true)
  assert.equal(production.querySelector('.erp-business-operation-panel [role="tablist"]'), null)
  const purchaseNumbers = [...purchase.querySelectorAll('tbody tr.ant-table-row td:first-child')].map((cell) => cell.textContent)
  await act(async () => purchaseNavigation.querySelectorAll('[role="tab"]')[1].click())
  assert.deepEqual([...purchase.querySelectorAll('tbody tr.ant-table-row td:first-child')].map((cell) => cell.textContent), purchaseNumbers)
  assert.match(purchase.textContent, /交期将到/u)
  const objects = ['MO-DEMO', 'WIP-DEMO', 'PF-DEMO', 'EX-DEMO']
  const actions = ['查看计划', '查看批次', '查看记录', '查看处置']
  for (const [index, prefix] of objects.entries()) {
    await act(async () => productionNavigation.querySelectorAll('[role="tab"]')[index].click())
    await flush()
    assert.match(production.querySelector('tbody').textContent, new RegExp(prefix, 'u'))
    const action = [...production.querySelectorAll('tbody button')].find((node) => node.textContent === actions[index])
    await act(async () => action.click())
    const detail = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes(`生产对照 · ${actions[index]}`))
    assert.ok(detail)
    assert.match(detail.textContent, /本地虚构样例/u)
    await act(async () => [...detail.querySelectorAll('button')].find((node) => node.textContent.replace(/\s+/gu, '') === '关闭').click())
    assert.equal(production.querySelector('[role="tablist"]') === productionNavigation, true)
    assert.equal(production.querySelector('input[aria-label="生产对照搜索"]') === productionSearch, true)
  }
  assert.equal(purchase.querySelector('[role="tablist"]') === purchaseNavigation, true)
  assert.equal(purchase.querySelector('input[aria-label="采购对照搜索"]') === purchaseSearch, true)
  await act(async () => [...container.querySelectorAll('button')].find((node) => node.textContent === '重置对照').click())
  assert.equal(container.querySelector('[aria-label="采购对照查询视角"] [aria-selected="true"]').textContent, '订单列表')
  assert.equal(container.querySelector('[aria-label="生产对照办理入口"] [aria-selected="true"]').textContent, '生产订单')
  assert.deepEqual(requests, [])
  assert.deepEqual([JSON.stringify(localStorage), JSON.stringify(sessionStorage)], storageBefore)
})
