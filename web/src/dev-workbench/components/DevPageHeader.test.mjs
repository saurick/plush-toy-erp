import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useRef, useState } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('页头导航往返保留标题焦点、页签节点和已有面板状态', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Header }, { default: Nav }, { default: Tabs }] = await Promise.all([
    import('./DevPageHeader.jsx'),
    import('./DevTaskNav.jsx'),
    import('../../common/components/navigation/SlidingTabs.jsx'),
  ])
  let titleRef
  let refreshes = 0
  function Page() {
    const [view, setView] = useState('versions')
    titleRef = useRef(null)
    const items = [
      { key: 'versions', label: '版本与部署', children: h('input', { 'aria-label': '保留筛选', defaultValue: '' }) },
      { key: 'history', label: '操作记录', children: h('p', null, '已有操作记录') },
    ]
    return h('div', null,
      h(Header, {
        title: h('h1', { ref: titleRef, tabIndex: -1 }, '版本发布'),
        navigation: h(Nav, { idPrefix: 'dev-header-test', ariaLabel: '版本发布视图', items: items.map(({ key, label }) => ({ value: key, label })), value: view, onChange: setView, compact: true }),
        tools: h('button', { type: 'button', disabled: view === 'history', onClick: () => { refreshes += 1 } }, '刷新状态'),
      }),
      h(Tabs, { id: 'dev-header-test', activeKey: view, items, onChange: setView, renderTabBar: () => null })
    )
  }
  await ui.render(h(Page))
  const header = ui.container.querySelector('header')
  const nav = header.querySelector('[role="tablist"]')
  const title = titleRef.current
  const filter = ui.container.querySelector('input')
  filter.value = '保留这个查询'
  const click = async (node) => {
    await ui.act(() => node.click())
    await ui.flush()
  }
  await click(header.querySelector('.erp-dev-page-header__tools button'))
  assert.equal(refreshes, 1)
  await click(nav.querySelector('#dev-header-test-tab-history'))
  assert.equal(header.querySelector('.erp-dev-page-header__tools button').disabled, true)
  const panel = ui.container.querySelector('#dev-header-test-panel-history')
  assert.equal(panel.getAttribute('aria-labelledby'), 'dev-header-test-tab-history')
  assert.equal(ui.container.querySelectorAll('[role="tablist"]').length, 1)
  await click(nav.querySelector('#dev-header-test-tab-versions'))
  assert.equal(filter.isConnected, true)
  assert.equal(filter.value, '保留这个查询')
  assert.equal(ui.container.querySelector('header') === header, true)
  assert.equal(header.querySelector('[role="tablist"]') === nav, true)
  assert.equal(titleRef.current === title, true)
  assert.equal(header.querySelector('.erp-dev-page-header__tools button').disabled, false)
  titleRef.current.focus()
  assert.equal(document.activeElement === title, true)
})

test('无一级页签时不创建空导航，必要范围与失败反馈保留在页头', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Header } = await import('./DevPageHeader.jsx')
  await ui.render(h(Header, { title: h('h1', null, '客户配置') },
    h('section', { 'aria-label': '客户配置范围' }, h('p', { role: 'alert' }, '当前客户未登记'))
  ))
  assert.equal(ui.container.querySelector('.erp-dev-page-header__navigation') === null, true)
  assert.equal(ui.container.querySelector('.erp-dev-page-header__tools') === null, true)
  assert.equal(ui.container.querySelectorAll('h1').length, 1)
  assert.equal(ui.container.querySelector('header [role="alert"]').textContent, '当前客户未登记')
})
