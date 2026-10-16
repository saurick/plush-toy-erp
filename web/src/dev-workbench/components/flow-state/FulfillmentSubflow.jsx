import React from 'react'
import { Button, Grid, Select } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildFulfillmentSubflow, buildSubflowMermaid } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { getFulfillmentSubstepCopy, selectFulfillmentSubstep } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentSubflow({ step, role, searchParams, setSearchParams, onOpenException }) {
  const screens = Grid.useBreakpoint()
  const stepSelectID = React.useId()
  const direction = screens.md === false ? 'TB' : 'LR'
  const flow = React.useMemo(() => buildFulfillmentSubflow(step), [step])
  const diagram = React.useMemo(() => flow ? buildSubflowMermaid(flow, { role, compact: true, direction }) : null, [flow, role, direction])
  if (!flow) return null
  const selected = selectFulfillmentSubstep(flow, searchParams.get(queryKeys.roleSubstep), role)
  const details = [...new Map(selected.details.filter((detail) => detail.reference !== 'result').map((detail) => [detail.text, detail])).values()]
  const selectedId = diagram.nodes.find((node) => node.key === selected.key).id
  const selectNode = (id) => {
    const node = diagram.nodes.find((item) => item.id === id)
    if (!node) return
    if (flow.nodes.find((item) => item.key === node.key).exception && onOpenException) {
      onOpenException(node.key)
      return
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('flow_stage', step.stage)
      next.set(queryKeys.roleSubstep, node.key)
      return next
    })
  }
  const renderHandoffs = (label, edges, target) => edges.length ? (
    <div className="erp-dev-fulfillment-guide__substep-relation">
      <span className="erp-dev-fulfillment-guide__substep-relation-label">{label}</span>
      {edges.map((edge) => {
        const node = flow.nodes.find((item) => item.key === edge[target])
        return <span className="erp-dev-fulfillment-guide__substep-handoff" key={`${edge.from}-${edge.to}`}><Button size="small" onClick={() => selectNode(diagram.nodes.find((item) => item.key === node.key).id)}>{getFulfillmentSubstepCopy(node)}</Button>{edge.label ? <span>{edge.label}</span> : null}</span>
      })}
    </div>
  ) : null
  return (
    <section className="erp-dev-fulfillment-guide__subflow" aria-label="当前环节的子流程">
      <p className="erp-dev-fulfillment-guide__subflow-summary">{flow.summary}</p>
      <div className="erp-dev-fulfillment-guide__subflow-workspace">
        <MermaidDiagram
          chart={diagram.chart}
          label={`${step.label}子流程`}
          nativeSize
          interactiveNodes={diagram.nodes}
          selectedNodeId={selectedId}
          onNodeSelect={selectNode}
          showSourceOnError={false}
        />
        <div className="erp-dev-fulfillment-guide__substep-detail" aria-live="polite" data-selected-substep={selected.key}>
          <div className="erp-dev-fulfillment-guide__substep-heading">
            <label htmlFor={stepSelectID}>步骤</label>
            <Select id={stepSelectID} aria-label="查看子步骤" value={selectedId} options={diagram.nodes.map((node) => ({ value: node.id, label: node.label }))} onChange={selectNode} virtual={false} />
            {selected.role ? <span className="erp-dev-fulfillment-guide__owner">{selected.role}</span> : null}
          </div>
          {details.length === 1 ? <p data-substep-instruction>{details[0].text}</p> : details.length ? <dl className="erp-dev-fulfillment-guide__node-facts">{details.map((detail) => <React.Fragment key={`${detail.label}-${detail.text}`}><dt>{detail.label}</dt><dd>{detail.text}</dd></React.Fragment>)}</dl> : <p data-substep-instruction>{step.result}</p>}
          {renderHandoffs('接自', flow.edges.filter((edge) => edge.to === selected.key), 'from')}
          {renderHandoffs('交给', flow.edges.filter((edge) => edge.from === selected.key), 'to')}
          {details.length ? <details className="erp-dev-fulfillment-guide__instructions" key={step.stage}><summary>环节完成条件</summary><p>{step.result}</p></details> : null}
        </div>
      </div>
    </section>
  )
}
