import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
} from '../config/devBusinessChainDesign.mjs'
import {
  applyDevFlowExplorerEntry,
  buildDevFlowExplorerLocation,
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
  ]) {
    assert.ok(
      resolveDevFlowExplorerEntry(new URLSearchParams(search), catalog).error,
      search
    )
  }
  const target = buildDevFlowExplorerLocation(
    'purchase_to_inventory',
    'purchase_order'
  )
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

test('来源节点按现有目录展开分支，保留手动位置和备注', () => {
  const library = buildBusinessChainDesignLibrary(catalog)
  const draft = {
    ...emptyBusinessChainDraft(),
    nodes: [{ id: 'node:sales_order', x: 32, y: 48, manual: true }],
    ideas: [{ text: '原有备注' }],
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
    assert.deepEqual(result.ideas, draft.ideas)
    assert.equal(result.map.chainKey, source.chainKey)
  }
})
