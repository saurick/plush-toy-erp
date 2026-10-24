import React from 'react'
import { MermaidDiagram } from '@/common/components/markdown'
import {
  buildFulfillmentSubflow,
  buildSubflowMermaid,
} from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { selectFulfillmentSubstep } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentSubflow({
  step,
  role,
  searchParams,
  setSearchParams,
  onOpenException,
}) {
  const flow = React.useMemo(() => buildFulfillmentSubflow(step), [step])
  const graph = React.useMemo(
    () =>
      flow &&
      buildSubflowMermaid(flow, { role, compact: true, direction: 'LR' }),
    [flow, role]
  )
  if (!flow) return null
  const selected = selectFulfillmentSubstep(
    flow,
    searchParams.get(queryKeys.roleSubstep),
    role
  )
  const selectedID = graph.nodes.find((node) => node.key === selected.key)?.id
  const selectNode = (id) => {
    const node = flow.nodes.find(
      (item) => item.key === graph.nodes.find((item) => item.id === id)?.key
    )
    if (!node) return
    if (node.exception_guide && onOpenException) {
      onOpenException(node.key, node.exception_guide)
      return
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set(queryKeys.roleStage, step.stage)
      next.set(queryKeys.roleSubstep, node.key)
      return next
    })
  }
  return (
    <section
      className="erp-dev-fulfillment-guide__subflow"
      aria-label="当前环节的子流程"
    >
      <MermaidDiagram
        chart={graph.chart}
        label={`${step.label}流程图`}
        interactiveNodes={graph.nodes}
        selectedNodeId={selectedID}
        onNodeSelect={selectNode}
        showSourceOnError={false}
      />
      <div
        className="erp-dev-fulfillment-guide__focus"
        aria-live="polite"
        data-selected-substep={selected.key}
      >
        <strong>
          {selected.label}
          {selected.role ? ` · ${selected.role}` : ''}
        </strong>
        <p data-substep-instruction>
          {selected.details[0]?.text || step.result}
        </p>
        {selected.details.length > 1 ? (
          <details className="erp-dev-disclosure erp-dev-fulfillment-guide__instructions">
            <summary>节点规则</summary>
            {selected.details.slice(1).map((detail) => (
              <p key={detail.text}>
                {detail.label}：{detail.text}
              </p>
            ))}
          </details>
        ) : null}
      </div>
    </section>
  )
}
