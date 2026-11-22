import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../scripts/test/mermaidRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import { CHAIN_DESIGN_WORKING_KEY as workingKey } from '../components/flow-state/useBusinessChainDraft.mjs'

registerMermaidTestRenderer()

async function setup(t) {
  const ui = await createReactTestHarness(t)
  const { default: Explorer } = await import('./DevFlowExplorerPage.jsx')
  const { default: Guide } = await import('../components/flow-state/TaskFulfillmentGuide.jsx')
  const { default: Nav } = await import('../components/DevPageNav.jsx')
  const { ERPThemeProvider } = await import('../../common/theme/erpTheme.jsx')
  let location
  let navigate
  function App() {
    location = useLocation()
    navigate = useNavigate()
    return h(
      Routes,
      null,
      h(Route, { path: '/__dev/flow-explorer', element: h(Explorer) }),
      h(Route, {
        path: '/__dev/status-flows',
        element: h('div', null, h(Nav), h(Guide, { businessCatalog: catalog })),
      })
    )
  }
  let revision = 0
  const render = async (entry = '/__dev/flow-explorer') => {
    await ui.render(
      h(
        MemoryRouter,
        {
          key: revision++,
          initialEntries: [entry],
          future: { v7_startTransition: true, v7_relativeSplatPath: true },
        },
        h(
          ERPThemeProvider,
          { browserStorageKey: 'flow-explorer-test-theme' },
          h(App)
        )
      )
    )
    await ui.flush()
  }
  const click = async (name) => {
    const element = [...document.querySelectorAll('button,a,[role="menuitem"]')].find(
      (el) =>
        el.getAttribute('aria-label') === name ||
        el.textContent.replace(/\s/gu, '') === name
    )
    assert.ok(element, `找不到 ${name}`)
    await ui.act(async () => { element.click() })
    await ui.flush()
  }
  const menu = async (name) => {
    await click('更多视图操作')
    await click(name)
  }
  const back = async () => {
    await ui.act(() => navigate(-1))
    await ui.flush()
  }
  return { ui, render, click, menu, back, location: () => location }
}

const previousDraft = {
  nodes: [{ id: 'node:sales_order', x: 96, y: 80, manual: true }],
  edges: [],
  ideas: [{ text: '保留原备注' }],
  presentation: { mode: 'all', highlightedRoles: [] },
}
const recent = JSON.stringify({ draft: previousDraft })

test('独立菜单恢复最近探索，页面往返和刷新保留本页草稿', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  await app.render()
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)).draft, previousDraft)
  assert.equal(app.ui.container.querySelector('h1').textContent, '流程探索')
  assert.equal(
    app.ui.container.querySelectorAll('[aria-label="专项链路内容"]').length,
    0
  )
  const links = [
    ...app.ui.container.querySelectorAll('[aria-label="产品与业务工作入口"] a'),
  ].map((el) => el.textContent)
  assert.equal(links[links.indexOf('业务链路') + 1], '流程探索')
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  const working = window.sessionStorage.getItem(workingKey)
  const nodeCount =
    app.ui.container.querySelectorAll('[data-design-node]').length
  assert.ok(nodeCount > 1)
  assert.ok(
    JSON.parse(working).draft.nodes.some(
      (node) => node.id === 'node:stock_reservation'
    )
  )
  await app.click('业务链路')
  assert.ok(app.ui.container.querySelector('[aria-label="流程视图"]'))
  await app.click('流程探索')
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), JSON.parse(working))
  assert.equal(app.ui.container.querySelector('[aria-label="视图保存状态"]'), null)
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)), JSON.parse(working))
  await app.render(app.location())
  assert.equal(
    app.ui.container.querySelectorAll('[data-design-node]').length,
    nodeCount
  )
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), JSON.parse(working))
})

test('新建空白入口优先于原标签页复制的草稿，消费入口后刷新恢复本页编辑', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  window.sessionStorage.setItem(workingKey, recent)
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.location().search, '')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.match(app.ui.container.querySelector('[aria-label="当前探索范围"]').textContent, /尚未加载链路/u)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), { draft: { nodes: [], edges: [], ideas: [], presentation: { mode: 'mainline', highlightedRoles: [], layout: 'lanes', showBranches: false, layers: ['normal'] } } })
  await app.click('更多视图操作')
  const link = document.querySelector('a[href="/__dev/flow-explorer?new=blank"]')
  assert(link)
  assert.equal(link.textContent, '在新标签页新建')
  assert.equal(link.getAttribute('target'), '_blank')
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer')
  await app.click('更多视图操作')
  await app.click('加入：老板批准用料')
  await app.click('关闭画布说明')
  const edited = window.sessionStorage.getItem(workingKey)
  await app.render('/__dev/flow-explorer')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 1)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), JSON.parse(edited))
})

test('空白初始化暂存失败时保留显式入口，刷新不会误恢复复制来的原图', async (t) => {
  const app = await setup(t)
  const copied = recent
  window.localStorage.setItem(workingKey, recent)
  window.sessionStorage.setItem(workingKey, copied)
  const storage = window.sessionStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: () => { throw new Error('quota') } })
  t.after(restore)
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(app.location().search, '?new=blank')
  assert.match(app.ui.container.textContent, /自动保留失败/u)
  assert.equal(storage.getItem(workingKey), copied)
  restore()
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.location().search, '')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.deepEqual(JSON.parse(storage.getItem(workingKey)).draft.nodes, [])
})

test('订单环节直达对应链路，返回来源时恢复环节和筛选', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  const search = '?view=chain&flow_stage=incoming_quality&flow_role=purchase'
  await app.render({ pathname: '/__dev/status-flows', search })
  await app.click('在流程探索中查看链路')
  assert.equal(app.location().pathname, '/__dev/flow-explorer')
  assert.equal(app.location().search, '')
  const working = JSON.parse(window.sessionStorage.getItem(workingKey))
  assert.equal(working.draft.map.scope, 'whole')
  assert.equal(working.draft.map.chainKey, 'purchase_to_inventory')
  assert.deepEqual(working.draft.nodes.find((node) => node.id === 'node:sales_order'), previousDraft.nodes[0])
  assert.deepEqual(working.draft.ideas, previousDraft.ideas)
  await app.back()
  assert.equal(app.location().pathname, '/__dev/status-flows')
  assert.equal(app.location().search, search)
  assert.equal(app.location().state.flowRestoreFrame.focus, '在流程探索中查看链路')
})

test('无效入口不改写本地视图，可继续上次探索', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  await app.render(
    '/__dev/flow-explorer?chain=purchase_to_inventory&node=sales_order'
  )
  assert.match(app.ui.container.textContent, /不属于所选链路/u)
  assert.equal(window.sessionStorage.getItem(workingKey), null)
  assert.equal(window.localStorage.getItem(workingKey), recent)
  await app.click('继续上次探索')
  assert.equal(
    app.ui.container.querySelectorAll('[data-design-node]').length,
    1
  )
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)).draft, previousDraft)
})

test('普通探索自动持久化且没有保存按钮或状态，关闭标签页后重新进入可恢复', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  await app.render()
  assert.equal([...app.ui.container.querySelectorAll('button')].some((button) => /保存视图|另存一份/u.test(button.textContent)), false)
  assert.equal(app.ui.container.querySelector('[aria-label="视图保存状态"]'), null)
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  const working = window.sessionStorage.getItem(workingKey)
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)), JSON.parse(working))
  window.sessionStorage.clear()
  await app.render()
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), JSON.parse(working))
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, JSON.parse(working).draft.nodes.length)
})

test('新建可取消，确认后清空历史并恢复同一页的空态', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  await app.render()
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  const working = window.sessionStorage.getItem(workingKey)
  const locationKey = app.location().key
  await app.menu('新建空白视图')
  await app.click('取消')
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)), JSON.parse(working))
  await app.menu('新建空白视图')
  await app.click('直接新建')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  await app.click('更多视图操作')
  const historyActions = [...document.querySelectorAll('[role="menuitem"][aria-disabled="true"]')].map((item) => item.textContent)
  assert(historyActions.includes('撤销'))
  assert(historyActions.includes('重做'))
  await app.click('更多视图操作')
  assert.equal(app.location().key, locationKey)
  await app.menu('新建空白视图')
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  window.sessionStorage.clear()
  await app.render()
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
})

test('自动保留失败保留页面内容和原存储，显式重试成功后可重新进入恢复', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(workingKey, recent)
  await app.render()
  const before = window.localStorage.getItem(workingKey)
  const storage = window.localStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: function setItem(key, value) { if (key === workingKey) throw new Error('quota'); return original.call(this, key, value) } })
  t.after(restore)
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  assert.match(app.ui.container.textContent, /自动保留失败/u)
  assert.equal(window.localStorage.getItem(workingKey), before)
  assert.equal(window.sessionStorage.getItem(workingKey), before)
  assert.ok(app.ui.container.querySelectorAll('[data-design-node]').length > 1)
  await app.menu('新建空白视图')
  await app.click('直接新建')
  assert.match(document.querySelector('[role="dialog"]').textContent, /自动保留失败/u)
  await app.click('取消')
  restore()
  await app.click('重试自动保留')
  const latest = window.localStorage.getItem(workingKey)
  assert.notEqual(latest, before)
  window.sessionStorage.clear()
  await app.render()
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), JSON.parse(latest))
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, JSON.parse(latest).draft.nodes.length)
})

test('仅有历史收藏时直接进入全流程地图，页头和菜单仅提供当前探索的操作', async (t) => {
  const app = await setup(t)
  const key = 'plush-workbench:business-chain-design'
  const original = JSON.stringify([{ id: 'old-view', name: '11', draft: previousDraft }])
  window.localStorage.setItem(key, original)
  await app.render()
  assert.equal(JSON.parse(window.sessionStorage.getItem(workingKey)).draft.map.chainKey, 'all')
  assert.equal(!!app.ui.container.querySelector('[aria-label="选择收藏视图"]'), false)
  await app.click('更多视图操作')
  const menu = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)
  assert.deepEqual(menu, ['撤销', '重做', '新建空白视图', '导出当前范围', '视图备注', '员工定位示例', '在新标签页新建'])
  assert.equal(window.localStorage.getItem(key), original)
})
