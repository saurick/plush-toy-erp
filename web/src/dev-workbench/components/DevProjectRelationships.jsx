import React, { useCallback, useMemo } from 'react'
import { Checkbox, Empty, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import Select from '@/common/components/select/AppSelect'
import FilterSelect from '@/common/components/select/FilterSelect'
import DevProjectGraphView from './DevProjectGraphView.jsx'
import {
  DEV_PROJECT_GRAPH_EXAMPLES,
  DEV_PROJECT_GRAPH_GROUPS,
  DEV_PROJECT_GRAPH_MODELS,
  DEV_PROJECT_GRAPH_TOPIC_GROUPS,
} from '../config/devRelationshipPerspectives.mjs'
import {
  buildProjectGraph,
  resolveProjectGraphSelection,
  updateProjectGraphSearch,
} from '../config/devProjectGraph.mjs'

export default function DevProjectRelationships() {
  const [params, setParams] = useSearchParams()
  const selected = resolveProjectGraphSelection(params)
  const modelCatalog = params.get('catalog') === 'models'
  const model = DEV_PROJECT_GRAPH_MODELS[selected.modelKey]
  const graph = useMemo(() => selected.exampleKey ? buildProjectGraph(selected.exampleKey, {
    references: selected.references,
    highlightReturns: selected.highlightReturns,
  }) : null, [selected.exampleKey, selected.references, selected.highlightReturns])
  const updateSelection = useCallback((changes) => setParams((previous) => updateProjectGraphSearch(previous, changes)), [setParams])
  const selectNode = useCallback((nodeId) => updateSelection({ nodeId }), [updateSelection])
  const selectExample = (exampleKey) => {
    if (exampleKey === undefined) {
      updateSelection({ exampleKey: '' })
      return
    }
    if (exampleKey === selected.exampleKey) return
    const modelKey = Object.keys(DEV_PROJECT_GRAPH_MODELS).find((key) => DEV_PROJECT_GRAPH_MODELS[key].examples.includes(exampleKey))
    updateSelection({ modelKey, exampleKey })
  }
  const judgment = selected.references && graph?.referenceEdge
    ? '叠加跨目录引用后，节点出现多个来源；仍然没有有向回路，但整体已是一般 DAG，不再是严格目录树。'
    : '树／森林描述层级结构；按父 → 子定向时属于 DAG 的特例。DAG 允许多个前置汇合，有向图也可以包含回路。'

  return (
    <section className="erp-dev-project-relationships" aria-label="项目关系图">
      <div className="erp-dev-project-relationships__workspace">
        <nav className="erp-dev-project-relationships__catalog" aria-label={modelCatalog ? '图模型分类' : '项目关系主题'}>
          <FilterSelect
            emptyValue="topics"
            aria-label="关系图目录方式"
            virtual={false}
            value={modelCatalog ? 'models' : 'topics'}
            options={[{ value: 'topics', label: '按项目主题' }, { value: 'models', label: '按图模型' }]}
            onChange={(value) => setParams((previous) => {
              const next = new URLSearchParams(previous)
              if (value === 'models') next.set('catalog', 'models')
              else next.delete('catalog')
              return next
            })}
          />
          {(modelCatalog ? DEV_PROJECT_GRAPH_GROUPS : DEV_PROJECT_GRAPH_TOPIC_GROUPS).map((group) => (
            <section key={group.label}>
              <h2>{group.label}</h2>
              {(modelCatalog ? group.models : group.examples).map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={(modelCatalog ? selected.modelKey : selected.exampleKey) === key}
                  onClick={() => {
                    if (modelCatalog) {
                      if (selected.modelKey !== key) updateSelection({ modelKey: key })
                    } else selectExample(key)
                  }}
                >
                  <strong>{(modelCatalog ? DEV_PROJECT_GRAPH_MODELS : DEV_PROJECT_GRAPH_EXAMPLES)[key].name}</strong>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <section className="erp-dev-project-relationships__detail" aria-label="图模型与项目示例">
          {graph ? (
            <div className="erp-dev-project-relationships__heading">
              <h2>{graph.name}</h2>
              <Tag className="erp-dev-accent-tag" data-project-graph-classification>{graph.classification.label}</Tag>
            </div>
          ) : null}
          {modelCatalog || graph?.referenceEdge || graph?.edges.some((edge) => edge.kind === 'return') ? (
            <div className="erp-dev-project-relationships__controls">
              {modelCatalog && (model.examples.length > 1 || !graph) ? (
                <label>
                  项目示例
                  <Select
                    placeholder="项目示例"
                    aria-label="项目示例"
                    value={selected.exampleKey || undefined}
                    virtual={false}
                    options={model.examples.map((key) => ({ value: key, label: DEV_PROJECT_GRAPH_EXAMPLES[key].name }))}
                    onChange={selectExample}
                  />
                </label>
              ) : null}
              {graph?.referenceEdge ? (
                <Checkbox checked={selected.references} onChange={(event) => updateSelection({ references: event.target.checked })}>叠加跨目录引用</Checkbox>
              ) : null}
              {graph?.edges.some((edge) => edge.kind === 'return') ? (
                <Checkbox checked={selected.highlightReturns} onChange={(event) => updateSelection({ highlightReturns: event.target.checked })}>标出退回回路</Checkbox>
              ) : null}
            </div>
          ) : null}
          {graph ? <DevProjectGraphView graph={graph} selectedNodeId={selected.nodeId} onNodeSelect={selectNode} /> : <Empty description="请选择项目示例" />}
          {graph ? (
            <details className="erp-dev-project-relationships__evidence">
              <summary>图模型说明与对应工具</summary>
              <p><strong>{model.title}</strong> · {model.definition}</p>
              <p>{judgment}</p>
              <div className="erp-dev-project-relationships__links">
                {graph.destinations.map((destination) => <Link key={destination.route} to={destination.route}>{destination.label}</Link>)}
              </div>
            </details>
          ) : null}
        </section>
      </div>
      <p className="erp-dev-project-relationships__boundary">结构示例；实际结果请到对应工具核对。</p>
    </section>
  )
}
