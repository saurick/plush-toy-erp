import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { Simulate } from 'react-dom/test-utils'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../../scripts/test/mermaidRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'
import { CHAIN_DESIGN_WORKING_KEY as workingKey } from './useBusinessChainDraft.mjs'

registerMermaidTestRenderer()

async function openActions(harness) {
  await harness.act(() => harness.container.querySelector('[aria-label="更多视图操作"]').click())
  await harness.flush()
  return [...document.querySelectorAll('[role="menuitem"]')]
}

async function chooseAction(harness, name) {
  const item = (await openActions(harness)).find((node) => node.textContent === name)
  assert(item, name)
  await harness.act(() => item.click())
  await harness.flush()
}

test('部分载入的视图切换颗粒度只改显示，保留关系、手动坐标与自动记录', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  const { buildBusinessChainDesignLibrary } = await import('../../config/devBusinessChainDesign.mjs')
  const source = buildBusinessChainDesignLibrary(catalog).nodes.find((node) => node.label === '提交委外订单')
  const draft = { nodes: [{ id: source.id, x: -80, y: 96, manual: true }], edges: [], ideas: [] }
  window.localStorage.setItem(workingKey, JSON.stringify({ draft }))
  await harness.render(h(Designer, { catalog }))
  const root = harness.container
  const working = () => JSON.parse(window.sessionStorage.getItem(workingKey)).draft
  await harness.act(() => root.querySelector('button[data-picker="view"]').click())
  await harness.flush()
  for (const [label, mode] of [['全部已载入节点', 'all'], ['链路概览', 'overview'], ['业务步骤', 'mainline']]) {
    const option = document.querySelector(`[role="dialog"][aria-label="画布视图"] input[value="${mode}"]`)
    assert(option, label)
    await harness.act(() => option.click())
    await harness.flush()
    assert.equal(working().presentation.mode, mode)
    assert.deepEqual(working().nodes, draft.nodes)
    assert.deepEqual(working().edges, draft.edges)
    assert.equal(working().map, undefined, '切换显示不会隐式初始化范围或载入关联内容')
  }
  await harness.act(() => document.querySelector('button[aria-label="关闭视图面板"]').click())
  await harness.flush()
  const undo = (await openActions(harness)).find((node) => node.textContent === '撤销')
  assert(undo)
  assert.equal(undo.getAttribute('aria-disabled'), 'true', '显示切换不占编辑历史')
  const saved = JSON.parse(window.localStorage.getItem(workingKey)).draft
  assert.deepEqual(saved.nodes, draft.nodes)
  assert.deepEqual(saved.edges, draft.edges)
  assert.equal(saved.presentation.mode, 'mainline')
})

for (const layout of ['lanes', 'flow']) {
  test(`链路概览展开和收起步骤遵循所选布局 ${layout}，保留节点位置`, async (t) => {
    const harness = await createReactTestHarness(t)
    const { default: Designer } = await import('./BusinessChainDesigner.jsx')
    const { buildBusinessChainDesignLibrary, emptyBusinessChainDraft } = await import('../../config/devBusinessChainDesign.mjs')
    const { showBusinessChainWhole, arrangeBusinessChainMap } = await import('../../config/devBusinessChainMap.mjs')
    const library = buildBusinessChainDesignLibrary(catalog)
    const chain = library.chains.find((item) => item.label === '销售受理到生产准备')
    const draft = arrangeBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value), library, 'mainline', layout)
    draft.presentation = { mode: 'overview', role: '', layout }
    window.localStorage.setItem(workingKey, JSON.stringify({ draft }))
    await harness.render(h(Designer, { catalog }))
    const root = harness.container
    const click = async (name) => {
      const button = [...root.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === name || item.textContent.replace(/\s/gu, '') === name)
      assert(button, name)
      await harness.act(() => button.click())
      await harness.flush()
    }
    const lanes = () => [...root.querySelectorAll('.erp-chain-design__lane')].map((item) => item.textContent).sort()
    const positions = () => [...root.querySelectorAll('[data-design-node]:not([data-design-node^="map:"])')].map((item) => ({ id: item.dataset.designNode, x: item.style.left, y: item.style.top }))
    const expectedLanes = layout === 'lanes' ? ['工程', '库存', '采购', '财务', '生产', '销售'].sort() : []
    assert.deepEqual(lanes(), [], '收起的链路卡片不生成空泳道')
    await click('查看节点：销售受理到生产准备')
    await click('展开这条链路的步骤')
    assert.equal(root.querySelector('[aria-label="流程探索画布"]').dataset.viewMode, 'overview')
    assert(positions().length > 1, '概览中已展开具体业务步骤')
    assert.deepEqual(lanes(), expectedLanes, '展开步骤后遵循所选布局')
    const expanded = positions()
    const scope = root.querySelector('[aria-label="当前探索范围"]')
    assert.match(scope.textContent, /19 步/)
    assert.equal(root.querySelector('[data-design-node^="map:"]') !== null, false)
    await click('用途与交接')
    assert.match(root.querySelector('.erp-chain-design__card').textContent, /从什么开始/)
    await click('关闭画布说明')
    await click('折叠为链路卡片')
    assert.deepEqual(lanes(), [])
    assert.deepEqual(positions(), [])
    assert.equal(root.querySelectorAll('[data-design-node^="map:"]').length, 1)
    await click('展开链路步骤')
    assert.deepEqual(lanes(), expectedLanes)
    assert.deepEqual(positions(), expanded, '再次展开保留原节点坐标')
  })
}

test('拖入单个业务步骤即可探索规则、状态、任务并保存展开后的视图', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  const root = harness.container
  await harness.render(h(Designer, { catalog }))
  const button = (name) =>
    [...document.querySelectorAll('button')].find(
      (item) =>
        item.getAttribute('aria-label') === name ||
        item.textContent.replace(/\s/gu, '') === name
    )
  const click = async (name) => {
    assert(button(name), `找不到 ${name}`)
    await harness.act(() => button(name).click())
    await harness.flush()
  }
  const working = () =>
    JSON.parse(window.sessionStorage.getItem(workingKey)).draft
  const tab = async (name) => {
    const item = [
      ...root.querySelectorAll('[aria-label="节点信息"] [role="tab"]'),
    ].find((node) => node.textContent === name)
    assert(item)
    await harness.act(() => item.click())
    await harness.flush()
  }
  assert.equal(!!button('加入：来料检验与材料入库'), false)
  assert(button('加入：老板批准用料'))
  assert(button('加入：财务批准采购'))
  await click('加入：IQC 确认本行检验通过')
  assert.equal(working().map.visibleIds.length, 1)
  assert(
    root
      .querySelector('[aria-label="已登记下游"]')
      .textContent.includes('仓库确认本次合格行入库')
  )
  await tab('接入规则')
  assert(
    root.querySelector('[role="dialog"]').textContent.includes('通过只确认品质')
  )
  await tab('状态')
  assert(
    root
      .querySelector('.erp-chain-design__state-preview')
      .textContent.includes('检验')
  )
  await tab('上下游')
  await click('展开下游')
  assert.equal(working().map.visibleIds.length, 2)
  assert.equal(root.querySelectorAll('[data-design-edge]').length, 1)
  const originalPosition = working().nodes[0]
  await click('展开完整上下游')
  assert(working().nodes.length > 5)
  assert.deepEqual(working().nodes[0], originalPosition)
  await click('关闭画布说明')
  await chooseAction(harness, '撤销')
  assert.equal(working().map.visibleIds.length, 2)
  await chooseAction(harness, '重做')
  assert(working().nodes.length > 5)
  const expanded = working()
  await click('查看节点：IQC 确认本行检验通过')
  await click('移出画布')
  await chooseAction(harness, '撤销')
  assert.deepEqual(working(), expanded)
  await harness.render(h(Designer, { catalog, key: 'reload' }))
  assert.deepEqual(working(), expanded)
  await click('筛选业务节点 · 业务步骤')
  await click('全库')
  await click('全部')
  await click('应用筛选')
  await click('加入：按业务分支创建岗位任务')
  await tab('任务与单据')
  assert(
    root
      .querySelector('[aria-label="具体岗位任务"]')
      .textContent.includes('工程资料')
  )
  assert(
    root
      .querySelector('[aria-label="具体岗位任务"]')
      .textContent.includes('订单审批')
  )
})

test('损坏视图保留现场并显示错误，编辑画布不覆盖原存储', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  window.localStorage.setItem(workingKey, '{broken')
  await harness.render(h(Designer, { catalog }))
  assert(
    harness.container
      .querySelector('[role="alert"]')
      .textContent.includes('上次探索无法读取')
  )
  assert.equal(window.localStorage.getItem(workingKey), '{broken')
  await harness.act(() =>
    harness.container.querySelector('[aria-label="加入：预留现有成品"]').click()
  )
  await harness.flush()
  assert.equal(window.localStorage.getItem(workingKey), '{broken')
  assert.equal(
    harness.container.querySelectorAll('[data-design-node]').length,
    1
  )
  const click = async (name) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.replace(/\s/gu, '') === name)
    assert.ok(button, name)
    await harness.act(() => button.click())
    await harness.flush()
  }
  await chooseAction(harness, '新建空白视图')
  await click('取消')
  assert.equal(window.localStorage.getItem(workingKey), '{broken')
  await chooseAction(harness, '新建空白视图')
  await click('直接新建')
  assert.deepEqual(JSON.parse(window.localStorage.getItem(workingKey)).draft.nodes, [])
  assert.equal(!!harness.container.querySelector('[role="alert"]'), false)
})

test('节点库提交搜索后更新列表，分组筛选应用后生效，重置筛选保留关键词和阅读视角', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  await harness.render(h(Designer, { catalog }))
  const root = harness.container
  const findButton = (scope, label) =>
    [...scope.querySelectorAll('button')].find(
      (node) =>
        node.getAttribute('aria-label') === label ||
        node.querySelector('.erp-filter-chip__label')?.textContent === label ||
        node.textContent.replace(/\s/gu, '') === label
    )
  const click = async (scope, label) => {
    const button = findButton(scope, label)
    assert(button, label)
    await harness.act(() => button.click())
    await harness.flush()
  }
  await click(root, '展开节点库')
  await click(root, '加入：IQC 确认本行检验通过')
  await click(root, '关闭画布说明')
  const before = window.sessionStorage.getItem(workingKey)
  await click(root, '筛选业务节点 · 业务步骤')
  const dialog = document.querySelector(
    '[aria-label="筛选业务节点"][role="dialog"]'
  )
  assert(dialog)
  const perspectives = dialog.querySelector('[aria-label="常用视角"]')
  await click(dialog, '全库')
  await click(perspectives, '岗位任务')
  await click(dialog.querySelector('[aria-label="按业务领域筛选"]'), '工程')
  assert(dialog.querySelector('[aria-label="已选节点筛选"]').textContent.includes('业务领域：工程'))
  await click(dialog, '应用筛选')
  assert(
    root
      .querySelector('[aria-label="可加入的节点"]')
      .textContent.includes('工程资料')
  )
  assert(
    !root
      .querySelector('[aria-label="可加入的节点"]')
      .textContent.includes('订单审批')
  )
  const filterTrigger = findButton(root, '筛选业务节点 · 岗位任务 · 业务领域：工程')
  assert.equal(filterTrigger.querySelector('.erp-control-count').textContent, '2')
  assert.equal(filterTrigger.querySelector('.anticon-filter + span').textContent, '筛选')
  assert.equal(
    document.activeElement === findButton(root, '筛选业务节点 · 岗位任务 · 业务领域：工程'),
    true
  )
  const search = root.querySelector('input[aria-label="搜索业务节点"]')
  await harness.act(() => {
    search.value = '工程'
    Simulate.change(search)
  })
  await harness.flush()
  await click(root.querySelector('[aria-label="查找节点"]'), '搜索')
  await click(root, '筛选业务节点 · 岗位任务 · 业务领域：工程')
  const reopened = document.querySelector('[aria-label="筛选业务节点"][role="dialog"]')
  await click(reopened, '重置筛选')
  assert.equal(search.value, '工程')
  assert.equal(
    findButton(reopened.querySelector('[aria-label="常用视角"]'), '岗位任务').getAttribute('aria-pressed'),
    'true'
  )
  assert.equal(!!reopened.querySelector('[aria-label="已选节点筛选"]'), false)
  await harness.act(() =>
    reopened.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  )
  await harness.flush()
  assert.equal(
    findButton(root, '筛选业务节点 · 岗位任务 · 业务领域：工程').getAttribute('aria-expanded'),
    'false'
  )
  assert.equal(window.sessionStorage.getItem(workingKey), before)
})

test('没有匹配节点时查看全部会清掉尚未提交的搜索草稿', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: NodeLibrary } = await import('./BusinessChainNodeLibrary.jsx')
  await harness.render(h(NodeLibrary, {
    library: { entries: [], nodes: [], chains: [], roles: [] },
    filters: { view: 'steps', search: '', domain: '', type: '', role: '', chain: '' },
    chainKey: 'all',
    nodeScope: 'all',
    setNodeScope() {},
    setFilters() {},
    onShowResults() {},
  }, (search, results) => h('div', null, search, results)))
  const root = harness.container
  const search = root.querySelector('input[aria-label="搜索业务节点"]')
  await harness.act(() => {
    search.value = '尚未提交'
    Simulate.change(search)
  })
  assert.equal(search.value, '尚未提交')
  const reset = [...root.querySelectorAll('button')].find((button) => button.textContent === '查看全部节点')
  await harness.act(() => reset.click())
  assert.equal(search.value, '')
})
