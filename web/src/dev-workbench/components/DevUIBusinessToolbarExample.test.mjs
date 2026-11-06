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
