import React from 'react'
import { Button } from 'antd'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { getFulfillmentStageCopy } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentExceptionDetails({
  selection,
  onSelectPlan,
  onSelectStep,
  onSelectOrigin,
  onSelectStage,
}) {
  const { guide, plan, selected, origins, origin } = selection
  const titleRef = React.useRef(null)
  const focusTitle = React.useRef(false)
  // Without a chosen plan, the diagram is a menu of registered alternatives.
  const flow = React.useMemo(
    () =>
      selection.graph || {
        nodes: [
          { key: 'source', label: guide.diagram.branch_label },
          ...guide.plans.map((item) => ({ key: item.key, label: item.label })),
        ],
        edges: guide.plans.map((item) => ({ from: 'source', to: item.key })),
      },
    [selection.graph, guide]
  )
  React.useLayoutEffect(() => {
    if (focusTitle.current) {
      focusTitle.current = false
      titleRef.current?.focus({ preventScroll: true })
    }
  }, [plan?.key])
  const showPlan = (key) => {
    focusTitle.current = true
    onSelectPlan(key)
  }
  const selectNode = (key) => {
    if (plan) onSelectStep(key)
    else if (guide.plans.some((item) => item.key === key)) showPlan(key)
  }
  return (
    <section
      className="erp-dev-fulfillment-guide__exception"
      data-exception-guide={guide.key}
    >
      <div className="erp-dev-fulfillment-guide__exception-toolbar">
        <h4 ref={titleRef} tabIndex={-1}>{plan?.label || '处理方案'}</h4>
        {plan && guide.plans.length > 1 ? (
          <Button onClick={() => showPlan(null)}>查看全部方案</Button>
        ) : null}
        {plan && origins.length > 1 ? (
          <FilterSelect
            className="erp-dev-fulfillment-guide__exception-select"
            label="发生环节"
            placeholder="选择发生环节"
            value={origin?.stage}
            onChange={onSelectOrigin}
            options={origins.map((step) => ({
              value: step.stage,
              label: getFulfillmentStageCopy(step).label,
            }))}
            showSearch={false}
            virtual={false}
          />
        ) : null}
      </div>
      <p className="erp-dev-business-flow-print-scope">{plan ? `处理方案：${plan.label}` : '方案分支总览'}{origins.length && !origin ? ' · 未指定发生环节' : ''}</p>
      <div
        data-exception-handling={plan ? '' : undefined}
        data-exception-plan={plan?.key}
      >
        <BusinessFlowDiagram
          flow={flow}
          label={`${guide.label}流程图`}
          selectedKey={selected?.key ?? 'source'}
          onSelect={selectNode}
          legend={plan ? undefined : '点选方案查看办理路径。'}
        />
      </div>
      {selected ? (
        <div
          className="erp-dev-fulfillment-guide__focus"
          aria-live="polite"
          data-selected-exception-node={selected.key}
        >
          <strong>{selected.label}</strong>
          <p>{selected.result || selected.condition}</p>
          {selected.stage ? (
            <Button
              type="link"
              size="small"
              onClick={() => onSelectStage(selected.stage)}
            >
              查看该环节
            </Button>
          ) : null}
        </div>
      ) : (
        <p>{guide.source}</p>
      )}
      {plan ? (
        <details
          className="erp-dev-disclosure erp-dev-fulfillment-guide__instructions"
          key={`${guide.key}:${plan.key}`}
        >
          <summary>完成条件与撤销规则</summary>
          <p>{plan.closure}</p>
          <p>{plan.recovery}</p>
          {guide.approval ? <p>{guide.approval.withdrawal}</p> : null}
        </details>
      ) : null}
    </section>
  )
}
