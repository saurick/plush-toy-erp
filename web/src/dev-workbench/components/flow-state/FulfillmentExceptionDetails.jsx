import React from 'react'
import { Button } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import FilterSelect from '@/common/components/select/FilterSelect'
import { buildSubflowMermaid } from '../../config/devFulfillmentSubflow.mjs'
import { getFulfillmentStageCopy } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentExceptionDetails({
  selection,
  role,
  onSelectPlan,
  onSelectStep,
  onSelectOrigin,
  onSelectStage,
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
  const graph = React.useMemo(
    () => buildSubflowMermaid(flow, { role, compact: true, direction: 'LR' }),
    [flow, role]
  )
  const onNodeSelect = (id) => {
    const node = graph.nodes.find((item) => item.id === id)
    if (!node || node.key === 'source') return
    if (!plan) onSelectPlan(node.key)
    else onSelectStep(node.key)
  }
  return (
    <section
      className="erp-dev-fulfillment-guide__exception"
      data-exception-guide={guide.key}
    >
      <div className="erp-dev-fulfillment-guide__choices">
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
      <div
        data-exception-handling={plan ? '' : undefined}
        data-exception-plan={plan?.key}
      >
        <MermaidDiagram
          chart={graph.chart}
          label={`${guide.label}流程图`}
          toolbar="compact"
          initialZoom={1}
          nativeSize
          interactiveNodes={graph.nodes}
          selectedNodeId={
            graph.nodes.find((node) => node.key === selected?.key)?.id
          }
          onNodeSelect={onNodeSelect}
          showSourceOnError={false}
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
