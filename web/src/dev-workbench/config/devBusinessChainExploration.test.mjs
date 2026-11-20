import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  parseBusinessChainDraft,
} from './devBusinessChainDesign.mjs'
import {
  businessChainNodeContext,
  businessChainNeighbors,
  expandBusinessChainView,
  isBusinessChainStep,
} from './devBusinessChainDesignView.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const quality = 'step:purchase_quality:posts_fact:purchase_accepted'
const empty = { nodes: [{ id: quality, x: 512, y: 96 }], edges: [], ideas: [] }

test('单步查完整上下游和状态，无需先把关联节点加入画布', () => {
  const before = JSON.stringify(catalog)
  assert.deepEqual(
    businessChainNeighbors(library, quality, 'downstream').map(
      (edge) => library.byId.get(edge.to).label
    ),
    ['仓库确认本次合格行入库']
  )
  assert(
    businessChainNeighbors(library, quality, 'upstream').some(
      (edge) => library.byId.get(edge.from).label === '自动建立逐行待检 IQC'
    )
  )
  const related = businessChainNodeContext(library, quality)
  assert(related.some((node) => node.id === 'node:purchase_quality'))
  assert(
    related.some((node) => node.machineKeys.includes('fact.quality_inspection'))
  )
  assert.equal(JSON.stringify(catalog), before)
})

test('展开完整上下游终止于已访问节点，保留手摆位置，重复展开不重复节点与边', () => {
  const view = expandBusinessChainView(empty, library, quality, 'both', true)
  assert(view.nodes.length > 5)
  assert.deepEqual(
    view.nodes.find((node) => node.id === quality),
    empty.nodes[0]
  )
  assert(
    view.nodes.every(
      (node) =>
        !library.byId.get(node.id).representedBy &&
        !library.byId.get(node.id).splitInto
    )
  )
  assert(
    view.nodes.some((node) => node.id === 'node:purchase_order'),
    '完整展开保留流程入口的来源单据'
  )
  assert.deepEqual(
    expandBusinessChainView(view, library, quality, 'both', true),
    view
  )
  const restored = parseBusinessChainDraft(
    JSON.stringify({ ...view, presentation: { mode: 'all', role: 'quality' } }),
    library
  )
  assert.equal(restored.presentation.role, 'quality')
  assert.equal(restored.presentation.mode, 'all')
  assert.deepEqual(restored.nodes, view.nodes)
})

test('只展开选中的方向和接点，不把并列任务都串入当前路径', () => {
  const target = 'step:purchase_accepted:posts_fact:purchase_lot'
  const view = expandBusinessChainView(
    empty,
    library,
    quality,
    'downstream',
    false,
    target
  )
  assert.deepEqual(
    view.nodes.map((node) => node.id),
    [quality, target]
  )
  assert.equal(view.edges.length, 1)
})

test('两级审核拆成真实动作；不同流程分支的具体岗位任务保持独立', () => {
  const parent = library.byId.get(
    'step:effective_bom:calls_domain_command:material_request'
  )
  assert.deepEqual(
    parent.splitInto.map((id) => library.byId.get(id).label),
    ['汇总用料并自动送审', '老板批准用料', '财务批准采购']
  )
  assert(
    library.nodes.every((node) => node.label.trim()),
    '每个具体步骤都有可读名称'
  )
  assert.deepEqual(
    parent.splitInto.map((id) => library.byId.get(id).roles),
    [['engineering'], ['boss'], ['finance']]
  )
  assert.equal(isBusinessChainStep(parent), false)
  const tasks = businessChainNodeContext(
    library,
    'node:sales_acceptance'
  ).filter((node) => node.processNode && node.type === 'task')
  assert(tasks.some((node) => node.label === '订单审批'))
  assert(tasks.some((node) => node.label === '工程资料'))
  for (const task of tasks) {
    const definition = catalog.processDefinitions.find(
      (item) => item.key === task.processNode.definitionKey
    )
    const next = businessChainNeighbors(library, task.id, 'downstream')
    assert.deepEqual(
      next.map((edge) => library.byId.get(edge.to).processNode.nodeKey),
      definition.edges
        .filter((edge) => edge.from === task.processNode.nodeKey)
        .map((edge) => edge.to)
    )
    assert(
      next.every(
        (edge) =>
          library.byId.get(edge.to).processNode.definitionKey === definition.key
      )
    )
  }
})
