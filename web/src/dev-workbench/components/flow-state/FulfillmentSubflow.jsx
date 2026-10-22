import React from 'react'
import { buildFulfillmentSubflow } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { selectFulfillmentSubstep } from '../../config/devFulfillmentPresentation.mjs'
import { fulfillmentStepMatchesRole } from '../../../erp/utils/workflowFulfillment.mjs'

export default function FulfillmentSubflow({
  step,
  role,
  searchParams,
  setSearchParams,
  onOpenException,
}) {
  const flow = React.useMemo(() => buildFulfillmentSubflow(step), [step])
  if (!flow) return null
  const selected = selectFulfillmentSubstep(
    flow,
    searchParams.get(queryKeys.roleSubstep),
    role
  )
  const details = [
    ...new Map(
      selected.details
        .filter((detail) => detail.reference !== 'result')
        .map((detail) => [detail.text, detail])
    ).values(),
  ]
  const outgoing = flow.edges.filter((edge) => edge.from === selected.key)
  const selectNode = (node) => {
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
      <ul className="erp-dev-fulfillment-guide__substeps" aria-label="环节步骤">
        {flow.nodes.map((node) => (
          <li
            key={node.key}
            data-role-match={
              role === 'all'
                ? undefined
                : fulfillmentStepMatchesRole(node, role)
            }
          >
            <button
              type="button"
              aria-pressed={node.key === selected.key}
              onClick={() => selectNode(node)}
            >
              <span>{node.label}</span>
              {node.role ? <small>{node.role}</small> : null}
            </button>
          </li>
        ))}
      </ul>
      <div
        className="erp-dev-fulfillment-guide__focus"
        aria-live="polite"
        data-selected-substep={selected.key}
      >
        {details.length ? (
          details.map((detail) => (
            <p key={detail.text} data-substep-instruction>
              {detail.text}
            </p>
          ))
        ) : (
          <p data-substep-instruction>{step.result}</p>
        )}
      </div>
      {outgoing.length ? (
        <ul className="erp-dev-fulfillment-guide__transitions">
          {outgoing.map((edge) => {
            const target = flow.nodes.find((node) => node.key === edge.to).label
            return (
              <li key={`${edge.from}:${edge.to}`}>
                {edge.label && target.startsWith(edge.label)
                  ? target
                  : `${edge.label || '完成后'} → ${target}`}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
