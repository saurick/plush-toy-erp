import assert from 'node:assert/strict'
import test from 'node:test'
import { ERP_DARK_PALETTE, ERP_LIGHT_PALETTE } from '../../theme/erpThemePalette.mjs'
import { diagramIconLabel, diagramNodeType } from './diagramSemantics.mjs'
import { buildBusinessFlowMermaid } from './mermaidGraph.mjs'
import { prepareMermaidSource } from './mermaidSemantics.mjs'

test('object types use icons without inventing states from labels', () => {
  const graph = buildBusinessFlowMermaid({
    nodes: [
      { key: 'doc', label: '已完成订单', layer: 'source_document', domain: 'sales' },
      { key: 'task', label: '待确认', layer: 'workflow_task' },
      { key: 'branch', label: '退回核对', diagramType: 'rule', risk: true, domain: 'sales' },
      { key: 'state', label: '已完成', kind: 'state' },
    ],
    edges: [
      { from: 'doc', to: 'task', label: '发起' },
      { from: 'task', to: 'branch', label: '退回', kind: 'returns' },
    ],
  })
  assert.deepEqual(graph.types, ['document', 'task', 'rule'])
  assert.deepEqual(graph.domains, ['sales'])
  assert.match(graph.chart, /fa:fa-erp-document/u)
  assert.match(graph.chart, /class N0 diagramDomain_sales/u)
  assert.match(graph.chart, /class N2 diagramBranch/u)
  assert.doesNotMatch(graph.chart, /class N2 diagramDomain|diagramSuccess/u)
  assert.deepEqual(graph.edges.map(({ branch }) => branch), [false, true])
  assert.equal(diagramNodeType({ kind: 'terminal', label: '完成' }), null)
  assert.equal(diagramNodeType({ kind: 'step', label: '1. 核对' }), null)
  assert.throws(() => diagramNodeType({ diagramType: 'inferred' }), /Unknown diagram node type/u)
  assert.throws(() => diagramIconLabel('对象', 'inferred'), /Unknown diagram icon/u)
})

for (const [mode, palette] of Object.entries({ light: ERP_LIGHT_PALETTE, dark: ERP_DARK_PALETTE })) {
  test(`${mode} diagram semantics preserve readable labels, branch dashes and result colors`, () => {
    const chart = 'flowchart LR\nA["业务记录"]:::diagramSuccess --> B["需核对"]:::diagramBranch'
    const source = prepareMermaidSource(chart, { mode })
    assert(source.includes(`classDef diagramSuccess fill:${palette.surfaceSoft},color:${palette.text},stroke:${palette.success}`))
    assert(source.includes(`classDef diagramBranch fill:${palette.surfaceSoft},color:${palette.text},stroke:${palette.warning},stroke-dasharray:6 4`))
    assert.doesNotMatch(source, /classDef diagramDanger/u, '只输出当前图实际使用的类别')
  })
}

test('paper labels keep written types, relations and conditions without icon font syntax', () => {
  const graph = buildBusinessFlowMermaid({
    nodes: [{ key: 'a', label: '采购单', layer: 'source_document' }, { key: 'b', label: '核对', diagramType: 'rule' }],
    edges: [{ from: 'a', to: 'b', label: '退回', condition: '实收不符', branch: true }],
  })
  const paper = prepareMermaidSource(graph.chart, { mode: 'light', htmlLabels: false })
  assert.doesNotMatch(paper, /fa:fa-erp/u)
  assert.match(paper, /业务单据/u)
  assert.match(paper, /接入条件/u)
  assert.match(paper, /E0@-\.->/u)
  assert.equal(graph.edges[0].description, '实收不符')
  const sequence = 'sequenceDiagram\nA->>B: diagramSuccess'
  assert.equal(prepareMermaidSource(sequence, { mode: 'dark' }), sequence)
})
