import React from 'react'
import { Button } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildFulfillmentSubflow, buildSubflowMermaid } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'

export default function FulfillmentSubflow({ step, searchParams, setSearchParams, onOpenException }) {
  const flow = React.useMemo(() => buildFulfillmentSubflow(step), [step])
  const diagram = React.useMemo(() => flow ? buildSubflowMermaid(flow) : null, [flow])
  if (!flow) return null
  const selected = flow.nodes.find((node) => node.key === searchParams.get(queryKeys.roleSubstep)) || flow.nodes[0]
  const selectedId = diagram.nodes.find((node) => node.key === selected.key).id
  const selectNode = (id) => {
    const node = diagram.nodes.find((item) => item.id === id)
    if (!node) return
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('flow_stage', step.stage)
      next.set(queryKeys.roleSubstep, node.key)
      return next
    })
  }
  return (
    <section className="erp-dev-fulfillment-guide__subflow" aria-label="当前环节的子流程">
      <div><h4>办理子流程</h4><p className="erp-dev-fulfillment-guide__subflow-summary">{flow.summary}</p></div>
      <div className="erp-dev-fulfillment-guide__subflow-workspace">
        <MermaidDiagram
          chart={diagram.chart}
          label={`${step.label}子流程`}
          initialZoom="fit"
          nativeSize
          interactiveNodes={diagram.nodes}
          selectedNodeId={selectedId}
          onNodeSelect={selectNode}
          showSourceOnError={false}
        />
        <div className="erp-dev-fulfillment-guide__substep-detail" aria-live="polite" data-selected-substep={selected.key}>
          <h4>{selected.label}</h4>
          {selected.role ? <p className="erp-dev-fulfillment-guide__owner">办理岗位：{selected.role}</p> : null}
          {selected.details.map((detail, index) => <section key={`${selected.key}-${index}`}><strong className="erp-dev-fulfillment-guide__substep-label">{detail.label}</strong><p>{detail.text}</p></section>)}
          {selected.exception && onOpenException ? <Button onClick={onOpenException}>查看异常处理过程</Button> : null}
        </div>
      </div>
      <details className="erp-dev-fulfillment-guide__substep-list">
        <summary>按文字选择子步骤</summary>
        <div>{diagram.nodes.map((node) => <button className="erp-dev-fulfillment-guide__substep-option" key={node.id} type="button" aria-pressed={node.id === selectedId} onClick={() => selectNode(node.id)}>{node.label}</button>)}</div>
      </details>
    </section>
  )
}
