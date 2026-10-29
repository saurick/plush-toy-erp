import React from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from 'antd'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import { buildFulfillmentSubflow } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { selectFulfillmentSubstep } from '../../config/devFulfillmentPresentation.mjs'
import { relationMatches, relationFiltersActive } from '../../config/devFulfillmentRelations.mjs'
import BusinessActionRelations from './BusinessActionRelations.jsx'

export default function FulfillmentSubflow({
  step,
  relation,
  filters,
  onOpenRules,
  onOpenInstances,
  role,
  searchParams,
  setSearchParams,
  onOpenException,
}) {
  const location = useLocation()
  const flow = React.useMemo(() => buildFulfillmentSubflow(step), [step])
  if (!flow) return null
  const originalSelection = selectFulfillmentSubstep(
    flow,
    searchParams.get(queryKeys.roleSubstep),
    role
  )
  const filtered = relation && relationFiltersActive(filters)
  const actions = relation?.actions.filter((action) => relationMatches(action, filters)) || []
  const matchingNodes = filtered ? new Set(actions.map((action) => action.substepKey)) : null
  const selected = filtered
    ? flow.nodes.find((node) => node.key === originalSelection.key && matchingNodes.has(node.key)) || flow.nodes.find((node) => matchingNodes.has(node.key))
    : originalSelection
  const selectNode = (id) => {
    const node = flow.nodes.find((item) => item.key === id)
    if (!node) return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set(queryKeys.roleStage, step.stage)
        next.set(queryKeys.roleSubstep, node.key)
        next.delete(queryKeys.relationAction)
        return next
      },
      { state: location.state }
    )
  }
  return (
    <section
      className="erp-dev-fulfillment-guide__subflow"
      aria-label="当前环节的子流程"
    >
      <BusinessFlowDiagram
        flow={flow}
        label={`${step.label}流程图`}
        selectedKey={selected?.key}
        matchingKeys={matchingNodes}
        onSelect={selectNode}
        role={role}
      />
      <div className="erp-dev-fulfillment-guide__subflow-detail">
        {selected ? (
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
            {selected.exception_guide && onOpenException ? (
              <Button
                type="link"
                onClick={() =>
              onOpenException(selected.key, selected.exception_guide)
            }
              >
                查看异常处理路径
              </Button>
        ) : null}
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
      ) : <p role="status" className="erp-dev-relation-empty">本环节没有同时满足条件的动作。结构图保留上下游位置，移除筛选可恢复查看。</p>}
        {relation && selected ? (
        actions.some((action) => action.substepKey === selected.key) ? <BusinessActionRelations
          actions={actions.filter((action) => action.substepKey === selected.key)}
          selectedKey={searchParams.get(queryKeys.relationAction)}
          onSelect={(key) => setSearchParams((previous) => {
            const next = new URLSearchParams(previous)
            next.set(queryKeys.relationAction, key)
            return next
          }, { state: location.state })}
          onOpenRules={onOpenRules}
          onOpenInstances={onOpenInstances}
        /> : <Button type="link" onClick={() => selectNode(actions[0]?.substepKey)} disabled={!actions.length}>查看本环节关联动作</Button>
      ) : null}
      </div>
    </section>
  )
}
