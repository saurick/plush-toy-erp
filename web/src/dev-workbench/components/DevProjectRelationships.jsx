import React, { useCallback, useMemo } from 'react'
import { Checkbox, Select, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { MermaidDiagram } from '@/common/components/markdown'
import {
  DEV_PROJECT_GRAPH_EXAMPLES,
  DEV_PROJECT_GRAPH_GROUPS,
  DEV_PROJECT_GRAPH_MODELS,
} from '../config/devRelationshipPerspectives.mjs'
import {
  buildProjectGraph,
  getProjectGraphNodeContext,
  resolveProjectGraphSelection,
  updateProjectGraphSearch,
} from '../config/devProjectGraph.mjs'
import '../styles/dev-project-relationships.css'

export default function DevProjectRelationships() {
  const [params, setParams] = useSearchParams()
  const selected = resolveProjectGraphSelection(params)
  const model = DEV_PROJECT_GRAPH_MODELS[selected.modelKey]
  const graph = useMemo(() => buildProjectGraph(selected.exampleKey, {
    references: selected.references,
    highlightReturns: selected.highlightReturns,
  }), [selected.exampleKey, selected.references, selected.highlightReturns])
  const node = getProjectGraphNodeContext(graph, selected.nodeId)
  const updateSelection = useCallback((changes) => setParams((previous) => updateProjectGraphSearch(previous, changes)), [setParams])
  const selectNode = useCallback((nodeId) => updateSelection({ nodeId }), [updateSelection])
  const judgment = selected.references && graph.referenceEdge
    ? '叠加跨目录引用后，节点出现多个来源；仍然没有有向回路，但整体已是一般 DAG，不再是严格目录树。'
    : '树／森林描述层级结构；按父 → 子定向时属于 DAG 的特例。DAG 允许多个前置汇合，有向图也可以包含回路。'

  return (
    <section className="erp-dev-project-relationships" aria-label="项目图视角">
      <p className="erp-dev-project-relationships__intro">按图模型理解，再看项目示例；图的方向与结构分别判断。</p>
      <div className="erp-dev-project-relationships__workspace">
        <nav className="erp-dev-project-relationships__catalog" aria-label="图模型分类">
          {DEV_PROJECT_GRAPH_GROUPS.map((group) => (
            <section key={group.label}>
              <h2>{group.label}</h2>
              {group.models.map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={selected.modelKey === key}
                  onClick={() => {
                    if (selected.modelKey !== key) updateSelection({ modelKey: key })
                  }}
                >
                  <strong>{DEV_PROJECT_GRAPH_MODELS[key].name}</strong>
                  <span>{DEV_PROJECT_GRAPH_MODELS[key].summary}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <section className="erp-dev-project-relationships__detail" aria-label="图模型与项目示例">
          <div className="erp-dev-project-relationships__breadcrumb">{model.crumb}</div>
          <div className="erp-dev-project-relationships__heading">
            <h2>{model.title}</h2>
            <Tag color="blue" data-project-graph-classification>{graph.classification.label}</Tag>
          </div>
          <p className="erp-dev-project-relationships__definition">{model.definition}</p>
          <div className="erp-dev-project-relationships__controls">
            {model.examples.length > 1 ? (
              <label>
                项目示例
                <Select
                  aria-label="项目示例"
                  value={selected.exampleKey}
                  virtual={false}
                  options={model.examples.map((key) => ({ value: key, label: DEV_PROJECT_GRAPH_EXAMPLES[key].name }))}
                  onChange={(exampleKey) => {
                    if (exampleKey !== selected.exampleKey) updateSelection({ exampleKey })
                  }}
                />
              </label>
            ) : <span>项目示例：{graph.name}</span>}
            {graph.referenceEdge ? (
              <Checkbox checked={selected.references} onChange={(event) => updateSelection({ references: event.target.checked })}>叠加跨目录引用</Checkbox>
            ) : null}
            {graph.edges.some((edge) => edge.kind === 'return') ? (
              <Checkbox checked={selected.highlightReturns} onChange={(event) => updateSelection({ highlightReturns: event.target.checked })}>标出退回回路</Checkbox>
            ) : null}
          </div>
          <MermaidDiagram
            chart={graph.chart}
            label="项目关系图"
            nativeSize
            interactiveNodes={graph.nodes}
            selectedNodeId={selected.nodeId}
            onNodeSelect={selectNode}
            showSourceOnError={false}
          />
          <p className="erp-dev-project-relationships__caption">{graph.caption}</p>
          <section className="erp-dev-project-relationships__node" aria-label="节点关系说明" aria-live="polite">
            <h3>{node ? node.label : '点选节点，查看关系含义'}</h3>
            {node ? <><p>{node.description}</p><p>{node.relationships}</p></> : <p>节点说明与前后关系在此显示，不改变业务状态。</p>}
          </section>
          <details className="erp-dev-project-relationships__evidence">
            <summary>模型判断与对应入口</summary>
            <p>{judgment}</p>
            <div className="erp-dev-project-relationships__links">
              {graph.destinations.map((destination) => <Link key={destination.route} to={destination.route}>{destination.label}</Link>)}
            </div>
          </details>
        </section>
      </div>
      <p className="erp-dev-project-relationships__boundary">图模型与结构示意；实际权限、业务状态、CI 和交付结果分别到正式入口核对。</p>
    </section>
  )
}
