import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import { devFlowExplorerChainURL } from '../config/devRoutes.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
} from '../config/devBusinessChainDesign.mjs'
import {
  applyDevFlowExplorerEntry,
  resolveDevFlowExplorerEntry,
  DEV_FLOW_EXPLORER_BLANK_HREF,
} from './devFlowExplorerNavigation.mjs'

test('探索入口校验链路、节点归属及重复参数', () => {
  assert.equal(
    resolveDevFlowExplorerEntry(new URLSearchParams(), catalog).entry,
    null
  )
  for (const search of [
    'chain=missing',
    'node=purchase_order',
    'chain=purchase_to_inventory&node=sales_order',
    'chain=purchase_to_inventory&chain=sales_to_production',
    'unregistered=x',
    'new=unknown',
    'new=blank&new=blank',
    'new=blank&chain=purchase_to_inventory',
    'chain=sales_to_production&step=unknown',
    'chain=sales_to_production&panel=rules',
    'chain=sales_to_production&batch=rules-20261103',
  ]) {
    assert.ok(
      resolveDevFlowExplorerEntry(new URLSearchParams(search), catalog).error,
      search
    )
  }
  const target = new URL(devFlowExplorerChainURL('purchase_to_inventory', 'purchase_order'), 'http://localhost')
  assert.equal(target.pathname, '/__dev/flow-explorer')
  assert.deepEqual(
    resolveDevFlowExplorerEntry(new URLSearchParams(target.search), catalog)
      .entry,
    { chainKey: 'purchase_to_inventory', nodeKey: 'purchase_order' }
  )
})

test('显式空白入口独立于链路定位，不提供含糊的组合参数', () => {
  assert.deepEqual(
    resolveDevFlowExplorerEntry(new URL(DEV_FLOW_EXPLORER_BLANK_HREF, 'http://localhost').searchParams, catalog),
    { entry: null, startBlank: true }
  )
})

test('来源节点按现有目录展开分支，保留手动位置', () => {
  const library = buildBusinessChainDesignLibrary(catalog)
  const draft = {
    ...emptyBusinessChainDraft(),
    nodes: [{ id: 'node:sales_order', x: 32, y: 48, manual: true }],
  }
  const sources = library.nodes.filter(
    (node) =>
      node.id.startsWith('node:') && (node.splitInto || node.representedBy)
  )
  assert.ok(sources.length > 0)
  for (const source of sources) {
    const result = applyDevFlowExplorerEntry(draft, library, {
      chainKey: source.chainKey,
      nodeKey: source.source.key,
    })
    assert.ok(result.map.visibleIds.length > 0, source.id)
    assert.deepEqual(
      result.nodes.find((node) => node.id === 'node:sales_order'),
      draft.nodes[0]
    )
    assert.equal(result.map.chainKey, source.chainKey)
  }
})

test('动作核验仅恢复同一链路内的正式动作', () => {
  const chain = catalog.businessChains.find(({ key }) => key === 'purchase_to_inventory')
  const step = chain.steps[0]
  const valid = new URLSearchParams({ chain: chain.key, step: step.key, panel: 'rules' })
  const result = resolveDevFlowExplorerEntry(valid, catalog)
  assert.equal(result.entry, null)
  assert.equal(result.verification.chain.key, chain.key)
  assert.equal(result.verification.action.key, step.key)
  for (const invalid of [
    new URLSearchParams({ chain: 'sales_to_production', step: step.key }),
    new URLSearchParams({ chain: chain.key, step: step.key, node: chain.entryNodeKeys[0] }),
    new URLSearchParams(`${valid}&step=${step.key}`),
  ]) assert.ok(resolveDevFlowExplorerEntry(invalid, catalog).error)
})

test('异常与纠正的直达入口加载该范围及其业务分支', () => {
  const library = buildBusinessChainDesignLibrary(catalog)
  const draft = { ...emptyBusinessChainDraft(), presentation: { mode: 'overview', layers: ['normal'] } }
  for (const [key, layer] of [['purchase_quality_disposition', 'exception'], ['purchase_posting_corrections', 'correction']]) {
    const result = applyDevFlowExplorerEntry(draft, library, { chainKey: key })
    assert.equal(result.map.chainKey, key)
    assert.equal(result.presentation.mode, 'mainline')
    assert.ok(result.presentation.layers.includes(layer))
    assert.ok(result.map.visibleIds.length)
  }
})
