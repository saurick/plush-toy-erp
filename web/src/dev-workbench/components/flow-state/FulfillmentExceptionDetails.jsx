import React from 'react'
import { Button } from 'antd'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { getFulfillmentStageCopy } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentExceptionDetails({
  selection,
  role,
  onSelectPlan,
  onSelectStep,
  onSelectOrigin,
  onSelectStage,
  guides,
  onSelectGuide,
}) {
  const { guide, plan, selected, related, origin } = selection
  const origins = related.filter((step) =>
    guide.entry_stages.includes(step.stage)
  )
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
  const [previewKey, setPreviewKey] = React.useState(null)
  const preview = !plan && guide.plans.find((item) => item.key === previewKey)
  const menuNode = preview || flow.nodes[0]
  const selectedNode = plan ? selected : menuNode
  const selectNode = (key) => (plan ? onSelectStep(key) : setPreviewKey(key))
  return (
    <section
      className="erp-dev-fulfillment-guide__exception"
      data-exception-guide={guide.key}
    >
      <div className="erp-dev-fulfillment-guide__choices">
        {guides && onSelectGuide ? (
          <FilterSelect
            label="异常类型"
            aria-label="异常类型"
            placeholder="选择异常类型"
            value={guide.key}
            onChange={onSelectGuide}
            options={guides.map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            virtual={false}
          />
        ) : null}
        {origins.length ? (
          <FilterSelect
            label="发生环节"
            aria-label="发生环节"
            placeholder="选择发生环节"
            value={origin?.stage}
            onChange={onSelectOrigin}
            options={origins.map((step) => ({
              value: step.stage,
              label: getFulfillmentStageCopy(step).label,
            }))}
            virtual={false}
          />
        ) : (
          <span>独立业务</span>
        )}
        {guide.plans.length > 1 ? (
          <FilterSelect
            label="处理方案"
            aria-label="处理方案"
            placeholder="选择处理方案"
            value={plan?.key}
            onChange={onSelectPlan}
            options={guide.plans.map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            virtual={false}
          />
        ) : (
          <span>{plan.label}</span>
        )}
      </div>
      <p className="erp-dev-business-flow-print-scope">{plan ? `处理方案：${plan.label}` : '方案分支总览'}{origins.length && !origin ? ' · 未指定发生环节' : ''}</p>
      <div
        data-exception-handling={plan ? '' : undefined}
        data-exception-plan={plan?.key}
      >
        <BusinessFlowDiagram
          flow={flow}
          label={`${guide.label}流程图`}
          selectedKey={selectedNode?.key}
          onSelect={selectNode}
          role={role}
        />
      </div>
      {selectedNode ? (
        <div
          className="erp-dev-fulfillment-guide__focus"
          aria-live="polite"
          data-selected-exception-node={plan ? selectedNode.key : undefined}
        >
          <strong>{selectedNode.label}</strong>
          <p>
            {plan
              ? selectedNode.result || selectedNode.condition
              : preview?.closure || guide.source}
          </p>
          {preview ? (
            <Button type="link" onClick={() => onSelectPlan(preview.key)}>
              查看此方案
            </Button>
          ) : null}
          {selectedNode.stage ? (
            <Button
              type="link"
              size="small"
              onClick={() => onSelectStage(selectedNode.stage)}
            >
              查看该环节
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="erp-dev-fulfillment-guide__hint">
          点选图中的方案，展开办理与回接路径。
        </p>
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
