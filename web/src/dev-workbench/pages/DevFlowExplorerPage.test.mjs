import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { Simulate } from 'react-dom/test-utils'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../scripts/test/mermaidRuntime.mjs'
import { buildChainActionRelations } from '../config/devFulfillmentRelations.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import {
  CHAIN_DESIGN_SAVED_KEY as savedKey,
  CHAIN_DESIGN_WORKING_KEY as workingKey,
} from '../components/flow-state/useBusinessChainDraft.mjs'

registerMermaidTestRenderer()

async function setup(t) {
  const ui = await createReactTestHarness(t)
  const { default: Explorer } = await import('./DevFlowExplorerPage.jsx')
  const { default: Topics } =
    await import('../components/flow-state/BusinessTopicsView.jsx')
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
        element: h('div', null, h(Nav), h(Topics, { catalog, actions: catalog.businessChains.flatMap((chain) => buildChainActionRelations(catalog, chain)) })),
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
    await ui.act(() => element.click())
    await ui.flush()
  }
  const back = async () => {
    await ui.act(() => navigate(-1))
    await ui.flush()
  }
  const nameView = async (name) => {
    const input = document.querySelector('#chain-draft-name')
    assert(input)
    await ui.act(() => {
      input.value = name
      Simulate.change(input)
    })
    await ui.flush()
  }
  return { ui, render, click, nameView, back, location: () => location }
}

const savedViews = () => [
  {
    id: 'existing-one',
    name: '原有销售视图',
    draft: {
      nodes: [{ id: 'node:sales_order', x: 96, y: 80, manual: true }],
      edges: [],
      ideas: [{ text: '保留原备注' }],
      presentation: { mode: 'all', role: '' },
    },
  },
  {
    id: 'existing-two',
    name: '原有空白视图',
    draft: { nodes: [], edges: [], ideas: [], presentation: { mode: 'mainline', role: '', layout: 'lanes', showBranches: false, layers: ['normal'] } },
  },
]

test('独立菜单直接恢复已有视图，未保存草稿在页面往返和刷新后完整保留', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  await app.render()
  assert.match(app.ui.container.textContent, /原有销售视图/u)
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
  assert.ok(app.ui.container.querySelector('[data-topic-diagram]'))
  await app.click('流程探索')
  assert.equal(window.sessionStorage.getItem(workingKey), working)
  assert.equal(
    app.ui.container.querySelector('[aria-label="视图保存状态"]').textContent,
    '未保存'
  )
  await app.render(app.location())
  assert.equal(
    app.ui.container.querySelectorAll('[data-design-node]').length,
    nodeCount
  )
  assert.equal(window.sessionStorage.getItem(workingKey), working)
  assert.equal(window.localStorage.getItem(savedKey), saved)
})

test('新建空白入口优先于命名视图和 opener 复制的草稿，消费入口后刷新恢复本页编辑', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  window.sessionStorage.setItem(workingKey, JSON.stringify({ currentId: 'existing-one', draft: savedViews()[0].draft }))
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.location().search, '')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.match(app.ui.container.querySelector('[aria-label="当前探索范围"]').textContent, /尚未加载链路/u)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), { currentId: null, draft: { nodes: [], edges: [], ideas: [], presentation: { mode: 'mainline', role: '', layout: 'lanes', showBranches: false, layers: ['normal'] } } })
  assert.equal(window.localStorage.getItem(savedKey), saved)
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
  assert.equal(window.sessionStorage.getItem(workingKey), edited)
  assert.equal(window.localStorage.getItem(savedKey), saved)
})

test('空白初始化暂存失败时保留显式入口，刷新不会误恢复复制来的原图', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  const copied = JSON.stringify({ currentId: 'existing-one', draft: savedViews()[0].draft })
  window.localStorage.setItem(savedKey, saved)
  window.sessionStorage.setItem(workingKey, copied)
  const storage = window.sessionStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: () => { throw new Error('quota') } })
  t.after(restore)
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(app.location().search, '?new=blank')
  assert.match(app.ui.container.textContent, /本标签页暂存失败/u)
  assert.equal(storage.getItem(workingKey), copied)
  restore()
  await app.render('/__dev/flow-explorer?new=blank')
  assert.equal(app.location().search, '')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(JSON.parse(storage.getItem(workingKey)).currentId, null)
  assert.equal(window.localStorage.getItem(savedKey), saved)
})

test('链路和节点入口只调整阅读范围，浏览器后退恢复来源选择与上下文', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  const source =
    '/__dev/status-flows?view=chain&flow_tab=topics&flow_topic=purchase_to_inventory&flow_topic_node=purchase_order&flow_role=purchase'
  const state = { readingContext: { stage: 'material_supply', scrollTop: 320 } }
  await app.render({
    pathname: source.split('?')[0],
    search: `?${source.split('?')[1]}`,
    state,
  })
  await app.click('从此节点探索')
  assert.equal(app.location().pathname, '/__dev/flow-explorer')
  assert.equal(app.location().search, '')
  let working = JSON.parse(window.sessionStorage.getItem(workingKey))
  assert.equal(working.draft.map.focusId, 'node:purchase_order')
  assert.equal(working.draft.map.chainKey, 'purchase_to_inventory')
  assert.deepEqual(
    working.draft.nodes.find((node) => node.id === 'node:sales_order'),
    savedViews()[0].draft.nodes[0]
  )
  assert.deepEqual(working.draft.ideas, [{ text: '保留原备注' }])
  await app.back()
  assert.equal(app.location().pathname + app.location().search, source)
  assert.deepEqual(app.location().state.readingContext, state.readingContext)
  assert.equal(app.location().state.flowRestoreFrame.focus, '从此节点探索')
  await app.click('在流程探索中打开')
  working = JSON.parse(window.sessionStorage.getItem(workingKey))
  assert.equal(working.draft.map.scope, 'whole')
  assert.equal(working.draft.map.chainKey, 'purchase_to_inventory')
  assert.equal(window.localStorage.getItem(savedKey), saved)
})

test('无效入口不改写本地视图，可继续上次探索', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  await app.render(
    '/__dev/flow-explorer?chain=purchase_to_inventory&node=sales_order'
  )
  assert.match(app.ui.container.textContent, /不属于所选链路/u)
  assert.equal(window.sessionStorage.getItem(workingKey), null)
  assert.equal(window.localStorage.getItem(savedKey), saved)
  await app.click('继续上次探索')
  assert.equal(
    app.ui.container.querySelectorAll('[data-design-node]').length,
    1
  )
  assert.match(app.ui.container.textContent, /原有销售视图/u)
})

test('未修改的视图在当前页直接新建，刷新保持空白且不改写已保存视图', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  await app.render()
  const locationKey = app.location().key
  assert.equal(app.ui.container.querySelectorAll('a[href*="new=blank"]').length, 0)
  await app.click('新建空白视图')
  assert.equal(app.location().key, locationKey, '新建不进行页面导航')
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(workingKey)), {
    currentId: null, draft: { nodes: [], edges: [], ideas: [], presentation: { mode: 'mainline', role: '', layout: 'lanes', showBranches: false, layers: ['normal'] } },
  })
  await app.render()
  assert.match(app.ui.container.textContent, /尚未加载链路/u)
  assert.equal(window.localStorage.getItem(savedKey), saved)
})

test('取消新建保留未保存内容，保存并新建更新原视图后才进入空白', async (t) => {
  const app = await setup(t)
  const entries = savedViews()
  window.localStorage.setItem(savedKey, JSON.stringify(entries))
  await app.render()
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  const working = window.sessionStorage.getItem(workingKey)
  const saved = window.localStorage.getItem(savedKey)
  await app.click('新建空白视图')
  assert.match(document.querySelector('[role="dialog"]').textContent, /再新建空白视图/u)
  await app.click('取消')
  assert.equal(window.sessionStorage.getItem(workingKey), working)
  assert.equal(window.localStorage.getItem(savedKey), saved)
  await app.click('新建空白视图')
  await app.click('保存并新建')
  const stored = JSON.parse(window.localStorage.getItem(savedKey))
  const original = stored.find((item) => item.id === 'existing-one')
  assert.deepEqual(original.draft.nodes, JSON.parse(working).draft.nodes)
  assert.deepEqual(original.draft.ideas, JSON.parse(working).draft.ideas)
  assert.deepEqual(stored.find((item) => item.id === 'existing-two'), entries[1])
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
})

test('未命名草稿保存并新建先完成有效命名，取消或重名不清空内容', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  const working = JSON.stringify({ currentId: null, draft: savedViews()[0].draft })
  window.localStorage.setItem(savedKey, saved)
  window.sessionStorage.setItem(workingKey, working)
  await app.render()
  await app.click('新建空白视图')
  await app.click('保存并新建')
  await app.click('保存')
  assert.match(document.querySelector('[role="dialog"]').textContent, /请输入 1 至 60 个字/u)
  await app.nameView('原有销售视图')
  await app.click('保存')
  assert.match(document.querySelector('[role="dialog"]').textContent, /已有同名视图/u)
  await app.click('取消')
  assert.equal(window.sessionStorage.getItem(workingKey), working)
  assert.equal(window.localStorage.getItem(savedKey), saved)
  await app.click('新建空白视图')
  await app.click('保存并新建')
  await app.nameView('新建前保留的探索')
  await app.click('保存')
  const stored = JSON.parse(window.localStorage.getItem(savedKey))
  assert.equal(stored.length, 3)
  assert.equal(stored[0].name, '新建前保留的探索')
  assert.deepEqual(stored[0].draft.nodes, JSON.parse(working).draft.nodes)
  assert.deepEqual(stored.slice(1), JSON.parse(saved))
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
})

test('放弃并新建只清空当前草稿，保存列表不变且不能撤销回原图', async (t) => {
  const app = await setup(t)
  const saved = JSON.stringify(savedViews())
  window.localStorage.setItem(savedKey, saved)
  await app.render()
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  await app.click('新建空白视图')
  await app.click('放弃并新建')
  assert.equal(window.localStorage.getItem(savedKey), saved)
  assert.equal(JSON.parse(window.sessionStorage.getItem(workingKey)).currentId, null)
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(app.ui.container.querySelector('[aria-label="撤销"]').disabled, true)
  assert.equal(app.ui.container.querySelector('[aria-label="重做"]').disabled, true)
})

test('保存并新建遇到存储失败保留原图和确认框，恢复后可以重试', async (t) => {
  const app = await setup(t)
  window.localStorage.setItem(savedKey, JSON.stringify(savedViews()))
  await app.render()
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  const working = window.sessionStorage.getItem(workingKey)
  const saved = window.localStorage.getItem(savedKey)
  const storage = window.localStorage
  const original = storage.setItem
  const restore = () => Object.defineProperty(storage, 'setItem', { configurable: true, value: original })
  Object.defineProperty(storage, 'setItem', { configurable: true, value: () => { throw new Error('quota') } })
  t.after(restore)
  await app.click('新建空白视图')
  await app.click('保存并新建')
  assert.match(document.querySelector('[role="dialog"]').textContent, /保存失败/u)
  assert.equal(window.sessionStorage.getItem(workingKey), working)
  assert.equal(window.localStorage.getItem(savedKey), saved)
  assert.ok(app.ui.container.querySelectorAll('[data-design-node]').length > 0)
  restore()
  await app.click('保存并新建')
  assert.equal(app.ui.container.querySelectorAll('[data-design-node]').length, 0)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
})

test('另存通过更多菜单建立独立副本，保存视图仍更新当前副本', async (t) => {
  const app = await setup(t)
  const entries = savedViews()
  window.localStorage.setItem(savedKey, JSON.stringify(entries))
  await app.render()
  assert.equal([...app.ui.container.querySelectorAll('button')].some((button) => button.textContent === '另存一份'), false)
  await app.click('加入：预留现有成品')
  await app.click('关闭画布说明')
  await app.click('更多视图操作')
  await app.click('另存一份')
  await app.nameView('采购观察副本')
  await app.click('保存')
  let stored = JSON.parse(window.localStorage.getItem(savedKey))
  assert.equal(stored.length, 3)
  assert.deepEqual(stored.find((item) => item.id === 'existing-one'), entries[0])
  const copyId = stored[0].id
  await app.click('加入：老板批准用料')
  await app.click('关闭画布说明')
  await app.click('保存视图')
  stored = JSON.parse(window.localStorage.getItem(savedKey))
  assert.equal(stored.length, 3)
  assert.equal(stored[0].id, copyId)
  assert.deepEqual(stored[0].draft.nodes, JSON.parse(window.sessionStorage.getItem(workingKey)).draft.nodes)
})
