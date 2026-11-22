import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
  parseBusinessChainDraft,
  CHAIN_DESIGN_TYPES,
  CHAIN_DESIGN_DOMAINS,
} from './devBusinessChainDesign.mjs'
import {
  CHAIN_NODE_VIEWS,
  filterBusinessChainEntries,
  businessChainFacetOptions,
} from './devBusinessChainNodeCatalog.mjs'
import {
  businessChainNeighbors,
  expandBusinessChainView,
} from './devBusinessChainDesignView.mjs'

import { showBusinessChainWhole } from './devBusinessChainMap.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const get = (id) => library.byId.get(id)
const list = (filters) => filterBusinessChainEntries(library, filters)
const canonical = (id) => get(id).representedBy || id
const initialIDs = catalog.businessChains
  .flatMap((chain) => {
    const definitions = new Set([
      ...chain.nodes.flatMap((node) => node.processDefinitionKeys),
      ...chain.steps.flatMap((step) =>
        step.processNodeRefs.map((ref) => ref.processDefinitionKey)
      ),
    ])
    return [
      ...chain.nodes.map((node) => `node:${node.key}`),
      ...chain.steps.map((step) => `step:${step.key}`),
      ...catalog.processDefinitions
        .filter((definition) => definitions.has(definition.key))
        .flatMap((definition) =>
          definition.nodes.map(
            (node) => `process:${chain.key}:${definition.key}:${node.key}`
          )
        ),
    ]
  })
  .concat([
    'action:effective_bom:calls_domain_command:material_request:prepare',
    'action:effective_bom:calls_domain_command:material_request:SUBMITTED->BOSS_APPROVED',
    'action:effective_bom:calls_domain_command:material_request:BOSS_APPROVED->APPROVED',
    'action:finance_payment_process:calls_domain_command:finance_payment:DRAFT->APPROVED',
    'action:finance_payment_process:calls_domain_command:finance_payment:APPROVED->POSTED',
  ])

test('原有 227 个来源逐项有分类和去向；全部当前节点有真实来源且分组可回查', () => {
  assert.equal(initialIDs.length, 227)
  const offered = new Set(
    library.entries.flatMap((entry) => entry.nodes.map((node) => node.id))
  )
  for (const id of initialIDs) {
    const node = get(id)
    assert(node, id)
    assert(offered.has(canonical(id)), id)
  }
  for (const node of library.nodes) {
    assert(CHAIN_DESIGN_TYPES[node.type], node.id)
    assert(CHAIN_DESIGN_DOMAINS[node.domain], node.id)
    assert(['node', 'group', 'reference'].includes(node.catalogKind), node.id)
    assert(node.sourceRefs.length, node.id)
    for (const ref of node.sourceRefs) {
      assert(existsSync(new URL(`../../../../${ref}`, import.meta.url)), ref)
    }
    for (const id of node.splitInto || []) {
      assert(get(id) && id !== node.id, node.id)
    }
    if (node.representedBy) {
      assert(!get(node.representedBy).representedBy, `单次归并：${node.id}`)
    }
    for (const step of node.steps) {
      for (const ref of step.stateTransitionRefs) {
        assert(
          catalog.flows
            .find((flow) => flow.key === ref.machineKey)
            ?.transitions.some((rule) => rule.key === ref.transitionKey),
          node.id
        )
      }
    }
  }
})

test('完整保留原节点坐标、关系、备注及阅读模式，无需清空浏览器视图', () => {
  const ids = new Set(initialIDs)
  const draft = {
    nodes: initialIDs.map((id, index) => ({
      id,
      x: index * 17,
      y: index * 11,
    })),
    edges: library.relations
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map(({ from, to }) => ({ from, to, kind: 'known' })),
    ideas: [{ text: '原有阅读笔记' }],
    presentation: { mode: 'all', highlightedRoles: ['quality'] },
  }
  draft.edges = [
    ...new Map(
      draft.edges.map((edge) => [JSON.stringify([edge.from, edge.to]), edge])
    ).values(),
  ]
  assert.deepEqual(
    parseBusinessChainDraft(JSON.stringify(draft), library),
    draft
  )
  for (const chain of library.chains) {
    const view = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value)
    assert(
      view.nodes.every(({ id }) => !get(id).representedBy && !get(id).splitInto)
    )
    assert.deepEqual(
      parseBusinessChainDraft(JSON.stringify(view), library),
      view
    )
  }
})

test('独立创建、提交、确认、过账分别有准确状态与岗位，事务效果不拆成手工动作', () => {
  const parent = get('step:outsourcing_order:posts_fact:outsourcing_issue')
  const parts = parent.splitInto.map(get)
  assert.deepEqual(
    parts.map((node) => node.label),
    ['提交委外订单', '确认委外订单', '登记委外发料草稿', '过账委外发料']
  )
  assert.deepEqual(
    parts.map((node) => node.roles),
    [['purchase'], ['purchase'], ['warehouse'], ['warehouse']]
  )
  assert.deepEqual(
    parts[0].steps[0].stateTransitionRefs.map((ref) => ref.transitionKey),
    ['draft->submitted']
  )
  assert.deepEqual(
    parts[1].steps[0].stateTransitionRefs.map((ref) => ref.transitionKey),
    ['submitted->confirmed']
  )
  assert.equal(parts[2].steps[0].stateTransitionRefs.length, 0)
  assert.equal(parts[2].steps[0].resultStateRefs[0].stateKey, 'DRAFT')
  assert.equal(
    parts[3].steps[0].stateTransitionRefs[0].machineKey,
    'fact.outsourcing'
  )
  assert(
    businessChainNeighbors(library, parts[0].id, 'upstream').some(
      (edge) => edge.from === 'node:outsourcing_order'
    )
  )
  assert.equal(
    get('step:shipped:reverses:shipment_cancelled').splitInto,
    undefined
  )
  const quality = get(
    'step:outsourcing_quality:posts_fact:outsourcing_lot'
  ).splitInto.map(get)
  assert.deepEqual(
    quality.map((node) => node.steps[0].stateTransitionRefs.length),
    [2, 2],
    '质检状态与库存冻结属于同一动作结果'
  )
  assert.equal(
    get('step:material_request:requires:production_order').type,
    'rule'
  )
  assert.equal(
    get('step:released_production_order:posts_fact:wip_batch').type,
    'system'
  )
  assert.equal(
    get('action:finance_payment:posts_fact:finance_allocation:settlement').type,
    'result'
  )
})

test('同一收付款命令只提供一个入口，任务办理和业务事实仍分别表达', () => {
  for (const label of ['批准收付款', '过账并核销收付款', '提交收付款审批']) {
    const nodes = list({ view: 'steps' })
      .flatMap((entry) => entry.nodes)
      .filter((node) => node.label === label)
    assert.equal(nodes.length, 1, label)
  }
  const approval = get(
    'process:finance_payment_and_reversal:finance_payment_approval/approval_post:approve_finance_payment'
  )
  assert.deepEqual(approval.roles, ['boss'])
  assert.deepEqual(approval.machineKeys, ['fact.finance_payment'])
  assert(
    approval.atomicEvidence.results.every((text) => !text.includes('已过账'))
  )
  assert(
    list({ view: 'tasks' })
      .flatMap((entry) => entry.nodes)
      .every(
        (node) =>
          node.type === 'task' && node.machineKeys.join() === 'workflow.task'
      )
  )
  for (const node of list({ view: 'tasks' }).flatMap((entry) => entry.nodes)) {
    assert.equal(
      node.atomicEvidence.step.stateTransitionRefs.length,
      0,
      node.id
    )
  }
  const reject = get(
    'process:production_exception:production_exception_approval/exception_decision_approval:reject_production_exception'
  )
  assert(
    reject.atomicEvidence.step.stateTransitionRefs.every(
      (ref) => ref.to !== 'CANCELLED'
    )
  )
  const edge = library.explorationRelations.find(
    (item) => item.to === approval.id && get(item.from).type === 'task'
  )
  assert(edge.evidence.results.every((text) => !text.includes('已过账')))
})

test('目录合并标题保留分支身份和条件，审批、应收与发票不交叉接续', () => {
  const approvals = list({ view: 'tasks' }).find(
    (entry) => entry.label === '订单审批'
  )
  assert.equal(approvals.nodes.length, 2)
  for (const node of approvals.nodes) {
    const next = businessChainNeighbors(library, node.id, 'downstream')
    assert(
      next.every(
        (edge) =>
          get(edge.to).processNode.definitionKey ===
          node.processNode.definitionKey
      )
    )
  }
  assert.equal(
    list({ view: 'steps' }).find((entry) => entry.label === '生成应付草稿')
      .nodes.length,
    3
  )
  const from = 'action:shipped:creates_fact_draft:receivable_draft:receivable'
  const next = businessChainNeighbors(library, from, 'downstream').map(
    (edge) => get(edge.to).label
  )
  assert.deepEqual(next, ['过账应收'])
  const start = get(
    'action:outsourcing_order:posts_fact:outsourcing_stage:receive'
  )
  assert(
    library.explorationRelations.some(
      (edge) =>
        edge.from === start.id &&
        edge.to === 'node:outsourcing_stage' &&
        edge.evidence.condition.includes('不要求质量关口')
    )
  )
})

test('搜索、视角与分组条件取交集；数量按相同候选口径计算，不改变画布', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'sales_to_production')
  const before = JSON.stringify(draft)
  for (const view of CHAIN_NODE_VIEWS) {
    assert(list({ view: view.value }).length, view.label)
  }
  assert(
    list({ view: 'steps', domain: 'delivery', role: 'sales' }).some(
      (entry) => entry.label === '确认实际出货'
    )
  )
  assert(
    list({ view: 'tasks', domain: 'delivery', role: 'finance' }).some(
      (entry) => entry.label === '出货财务审批'
    )
  )
  const filtered = list({
    view: 'steps',
    domain: 'quality',
    role: 'quality',
    search: '委外 合格',
  })
  assert(filtered.length)
  assert(
    filtered
      .flatMap((entry) => entry.nodes)
      .every(
        (node) => node.domain === 'quality' && node.roles.includes('quality')
      )
  )
  assert.equal(list({ view: 'tasks', type: 'document' }).length, 0)
  assert.equal(list({ search: '不存在的节点' }).length, 0)
  assert(
    list({ view: 'all', search: '销售订单与订单行' }).some((entry) =>
      entry.nodes.some((node) => node.id === 'node:sales_order')
    )
  )
  const filters = { view: 'all', role: 'warehouse' }
  const options = businessChainFacetOptions(library, filters, 'domain', [
    { value: '', label: '全部' },
    { value: 'inventory', label: '库存' },
  ])
  assert.equal(options[0].count, list(filters).length)
  assert.equal(
    options[1].count,
    list({ ...filters, domain: 'inventory' }).length
  )
  const anchor = 'action:effective_bom:creates_source:production_order:release'
  const view = expandBusinessChainView(
    { nodes: [{ id: anchor, x: 601, y: 273 }], edges: [], ideas: [] },
    library,
    anchor,
    'both',
    true
  )
  assert.deepEqual(
    view.nodes.find(({ id }) => id === anchor),
    { id: anchor, x: 601, y: 273 }
  )
  assert.equal(JSON.stringify(draft), before)
})
