import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  assessBusinessChainConnection,
  addBusinessChainDraftEdge,
  parseBusinessChainDraft,
  emptyBusinessChainDraft,
} from './devBusinessChainDesign.mjs'

import { showBusinessChainWhole } from './devBusinessChainMap.mjs'

const library = buildBusinessChainDesignLibrary(catalog)

test('节点库完整投影正式链路、动作、状态与责任，不复制业务规则', () => {
  assert.equal(library.chains.length, catalog.businessChains.length)
  assert.deepEqual(
    library.chainOptionGroups.map(({ key, label, options }) => ({
      key,
      label,
      chainKeys: options.map((option) => option.value),
    })),
    catalog.businessChainOverview.lanes.map(({ key, label, chainKeys }) => ({
      key,
      label,
      chainKeys,
    }))
  )
  assert.equal(
    new Set(
      library.chainOptionGroups.flatMap((group) =>
        group.options.map((option) => option.value)
      )
    ).size,
    library.chains.length,
    '流程范围分组应完整且不重复覆盖正式链路'
  )
  assert.equal(
    library.nodes.filter(
      (node) => node.id.startsWith('node:') || node.id.startsWith('step:')
    ).length,
    catalog.businessChains.reduce(
      (sum, chain) => sum + chain.nodes.length + chain.steps.length,
      0
    )
  )
  for (const chain of catalog.businessChains) {
    for (const step of chain.steps) {
      assert(
        library.relations.some(
          (edge) =>
            edge.from === `node:${step.fromNodeKey}` &&
            edge.to === `step:${step.key}`
        )
      )
      assert(
        library.relations.some(
          (edge) =>
            edge.from === `step:${step.key}` &&
            edge.to === `node:${step.toNodeKey}`
        )
      )
    }
  }
  for (const node of library.nodes) {
    assert(
      node.machineKeys.every((key) =>
        catalog.flows.some((flow) => flow.key === key)
      )
    )
  }
  assert.equal(library.byId.get('node:effective_bom').domain, 'engineering')
  assert.equal(library.byId.get('node:sales_order').domain, 'sales')
  assert.equal(library.byId.get('node:purchase_task').catalogKind, 'reference')
  assert.equal(
    library.byId.get(library.byId.get('node:purchase_task').representedBy).type,
    'task'
  )
  assert.equal(
    library.byId.get(
      'step:purchase_task:calls_domain_command:purchase_approval'
    ).type,
    'group'
  )
  assert.equal(library.byId.get('node:purchase_payable_draft').type, 'document')
  assert(
    library.byId.get('node:purchase_task').machineKeys.includes('workflow.task')
  )
  assert.equal(
    new Set(library.roles.map((item) => item.label)).size,
    library.roles.length
  )
  for (const relation of library.relations) {
    assert(
      relation.evidence.condition ||
        relation.evidence.preconditions.length ||
        relation.evidence.results.length ||
        catalog.businessChains.some((chain) =>
          chain.steps.includes(relation.evidence.step)
        )
    )
    assert.equal(
      assessBusinessChainConnection(library, relation.from, relation.to).status,
      'known'
    )
  }
})

test('只以已登记方向推荐；省略动作与终止结果被阻断，跨链缺依据保持待核对', () => {
  const from = 'node:purchase_accepted'
  const to = 'node:purchase_lot'
  const skipped = assessBusinessChainConnection(library, from, to)
  assert.equal(skipped.status, 'blocked')
  assert.equal(skipped.action, 'step:purchase_accepted:posts_fact:purchase_lot')
  assert.equal(
    assessBusinessChainConnection(library, from, from).status,
    'blocked'
  )
  assert.equal(
    assessBusinessChainConnection(library, 'node:purchase_rejected', from)
      .status,
    'blocked'
  )
  assert.equal(
    assessBusinessChainConnection(
      library,
      'node:sales_order',
      'node:purchase_order'
    ).status,
    'unknown'
  )
  const edge = library.relations[0]
  assert.equal(
    assessBusinessChainConnection(library, edge.to, edge.from).status,
    'unknown'
  )
})

test('全部流程整体视图可恢复，草稿加线阻断非法与重复关系，保持目录无变更', () => {
  const before = JSON.stringify(catalog)
  for (const chain of library.chains) {
    const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value)
    assert.deepEqual(
      parseBusinessChainDraft(JSON.stringify(draft), library),
      draft
    )
    assert(
      draft.nodes.every(
        (node) => Number.isFinite(node.x) && Number.isFinite(node.y)
      )
    )
  }
  const draft = {
    ...emptyBusinessChainDraft(),
    nodes: ['node:sales_order', 'node:purchase_order'].map((id, i) => ({
      id,
      x: i * 228,
      y: 12,
    })),
  }
  const added = addBusinessChainDraftEdge(
    draft,
    library,
    draft.nodes[0].id,
    draft.nodes[1].id
  )
  assert.equal(added.edges[0].kind, 'unknown')
  assert.equal(
    addBusinessChainDraftEdge(
      added,
      library,
      draft.nodes[1].id,
      draft.nodes[0].id
    ),
    added
  )
  assert.equal(
    addBusinessChainDraftEdge(
      draft,
      library,
      draft.nodes[0].id,
      draft.nodes[0].id
    ),
    draft
  )
  assert.equal(JSON.stringify(catalog), before)
})

test('损坏或过时草稿拒绝读取；只持久化节点身份、位置和讨论线', () => {
  assert.throws(() => parseBusinessChainDraft('{', library))
  const template = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'sales_to_production')
  for (const change of [
    (draft) => {
      draft.nodes[0].id = 'missing'
    },
    (draft) => {
      draft.nodes[0].x = Infinity
    },
    (draft) => {
      draft.nodes.push(draft.nodes[0])
    },
    (draft) => {
      draft.edges[0].to = draft.edges[0].from
    },
    (draft) => {
      draft.edges.push(draft.edges[0])
    },
    (draft) => {
      draft.edges[0].kind = 'executed'
    },
  ]) {
    const draft = structuredClone(template)
    change(draft)
    assert.throws(() => parseBusinessChainDraft(JSON.stringify(draft), library))
  }
  const draft = structuredClone(template)
  draft.nodes[0].label = '过时文案'
  draft.edges[0].condition = '假的条件'
  draft.ideas = [{ text: '核对工程资料的前置条件' }]
  const restored = parseBusinessChainDraft(JSON.stringify(draft), library)
  assert.equal(restored.nodes[0].label, undefined)
  assert.equal(restored.edges[0].condition, undefined)
  assert.equal(Object.hasOwn(restored, 'ideas'), false)
})
