import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { Simulate } from 'react-dom/test-utils'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../../scripts/test/mermaidRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'
import {
  CHAIN_DESIGN_SAVED_KEY as savedKey,
  CHAIN_DESIGN_WORKING_KEY as workingKey,
} from './useBusinessChainDraft.mjs'

registerMermaidTestRenderer()

test('部分载入的视图切换颗粒度只改显示，保留关系、手动坐标与保存内容', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  const { buildBusinessChainDesignLibrary } = await import('../../config/devBusinessChainDesign.mjs')
  const source = buildBusinessChainDesignLibrary(catalog).nodes.find((node) => node.label === '提交委外订单')
  const draft = { nodes: [{ id: source.id, x: -80, y: 96, manual: true }], edges: [], ideas: [] }
  window.localStorage.setItem(savedKey, JSON.stringify([{ id: 'partial', name: '局部手动视图', draft }]))
  await harness.render(h(Designer, { catalog }))
  const root = harness.container
  const working = () => JSON.parse(window.sessionStorage.getItem(workingKey)).draft
  for (const [label, mode] of [['全部已载入节点', 'all'], ['链路概览', 'overview'], ['业务步骤', 'mainline']]) {
    const option = [...root.querySelectorAll('[aria-label="流程颗粒度"] label')].find((item) => item.textContent === label)
    assert(option, label)
    await harness.act(() => option.click())
    await harness.flush()
    assert.equal(working().presentation.mode, mode)
    assert.deepEqual(working().nodes, draft.nodes)
    assert.deepEqual(working().edges, draft.edges)
    assert.equal(working().map, undefined, '切换显示不会隐式初始化范围或载入关联内容')
  }
  const undo = root.querySelector('button[aria-label="撤销"]')
  assert(undo)
  assert.equal(undo.disabled, true, '显示切换不占布局撤销历史')
  const save = [...root.querySelectorAll('button')].find((item) => item.textContent === '保存视图')
  assert(save)
  await harness.act(() => save.click())
  await harness.flush()
  const saved = JSON.parse(window.localStorage.getItem(savedKey))[0].draft
  assert.deepEqual(saved.nodes, draft.nodes)
  assert.deepEqual(saved.edges, draft.edges)
  assert.equal(saved.presentation.mode, 'mainline')
})

test('拖入单个业务步骤即可探索规则、状态、任务并保存展开后的视图', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Designer } = await import('./BusinessChainDesigner.jsx')
  const root = harness.container
  window.localStorage.setItem(
    savedKey,
    JSON.stringify([
      {
        id: 'canvas-test',
        name: '来料探索',
        draft: { nodes: [], edges: [], ideas: [] },
      },
    ])
  )
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
  await click('撤销')
  assert.equal(working().map.visibleIds.length, 2)
  await click('重做')
  assert(working().nodes.length > 5)
  await click('保存视图')
  assert.equal(
    root.querySelector('[aria-label="视图保存状态"]').textContent,
    '已保存'
  )
  const saved = JSON.parse(window.localStorage.getItem(savedKey))[0].draft
  await click('查看节点：IQC 确认本行检验通过')
  await click('移出画布')
  await click('更多视图操作')
  const restore = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent === '恢复已保存'
  )
  await harness.act(() => restore.click())
  await harness.flush()
  await click('放弃修改并恢复')
  assert.deepEqual(working(), saved)
  await click('全库')
  await click('全部')
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
  window.localStorage.setItem(savedKey, '{broken')
  await harness.render(h(Designer, { catalog }))
  assert(
    harness.container
      .querySelector('[role="alert"]')
      .textContent.includes('无法读取')
  )
  assert.equal(window.localStorage.getItem(savedKey), '{broken')
  await harness.act(() =>
    harness.container.querySelector('[aria-label="加入：预留现有成品"]').click()
  )
  await harness.flush()
  assert.equal(window.localStorage.getItem(savedKey), '{broken')
  assert.equal(
    harness.container.querySelectorAll('[data-design-node]').length,
    1
  )
})

test('节点库提交搜索后更新列表，分组筛选即时生效，重置筛选保留关键词和阅读视角', async (t) => {
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
  await click(root, '加入：IQC 确认本行检验通过')
  await click(root, '关闭画布说明')
  const before = window.sessionStorage.getItem(workingKey)
  await click(root, '全库')
  const perspectives = root.querySelector('[aria-label="常用视角"]')
  await click(perspectives, '岗位任务')
  await click(root, '筛选业务节点')
  const dialog = document.querySelector(
    '[aria-label="筛选业务节点"][role="dialog"]'
  )
  assert(dialog)
  await click(dialog.querySelector('[aria-label="按业务领域筛选"]'), '工程')
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
  await click(dialog, '收起')
  assert(
    root
      .querySelector('[aria-label="已选节点筛选"]')
      .textContent.includes('业务领域：工程')
  )
  assert.equal(
    document.activeElement === findButton(root, '筛选业务节点'),
    true
  )
  const search = root.querySelector('input[aria-label="搜索业务节点"]')
  await harness.act(() => {
    search.value = '工程'
    Simulate.change(search)
  })
  await harness.flush()
  await click(root.querySelector('[aria-label="业务节点库"]'), '搜索')
  await click(root, '筛选业务节点')
  await click(dialog, '重置筛选')
  assert.equal(search.value, '工程')
  assert.equal(
    findButton(perspectives, '岗位任务').getAttribute('aria-pressed'),
    'true'
  )
  assert.equal(!!root.querySelector('[aria-label="已选节点筛选"]'), false)
  await harness.act(() =>
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  )
  await harness.flush()
  assert.equal(
    findButton(root, '筛选业务节点').getAttribute('aria-expanded'),
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
  }))
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
