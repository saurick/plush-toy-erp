import React from 'react'
import { Button } from 'antd'
import { fulfillmentStepMatchesRole } from '../../../erp/utils/workflowFulfillment.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { getFulfillmentStageCopy } from '../../config/devFulfillmentPresentation.mjs'

export default function FulfillmentExceptionDetails({ selection, context, role, onSelectPlan, onSelectStep, onSelectStage }) {
  const { guide, plan, steps, selected, related, returnStage, reentryStage } = selection
  const stageLabel = (step) => `${catalog.fulfillment_flow.indexOf(step) + 1} ${getFulfillmentStageCopy(step).label}`
  const destination = reentryStage || returnStage
  return (
    <section className="erp-dev-fulfillment-guide__exception" data-exception-guide={guide.key}>
      {context ? <h4>{guide.label}</h4> : <p>{guide.source}</p>}
      {related.length > 1 || !context && related.length ? (
        <div className="erp-dev-fulfillment-guide__involved"><span>涉及环节</span>{related.map((step) => <Button key={step.stage} type="link" size="small" aria-pressed={context?.stage === step.stage} onClick={() => onSelectStage(step.stage, true, true)}>{stageLabel(step)}</Button>)}</div>
      ) : null}
      <div className="erp-dev-fulfillment-guide__choices" role="group" aria-label="处理方式">
        <span>处理方式</span>
        {guide.plans.length === 1 ? <strong>{guide.plans[0].label}</strong> : guide.plans.map((item) => <Button key={item.key} aria-pressed={plan?.key === item.key} onClick={() => onSelectPlan(plan?.key === item.key ? null : item.key)}>{item.label}</Button>)}
      </div>
      {plan ? (
        <section className="erp-dev-chain__details" aria-label="异常步骤与岗位" data-exception-handling data-exception-plan={plan.key}>
          <ol className="erp-dev-chain__handling-steps">
            {steps.map((step, index) => (
              <React.Fragment key={step.key}>
                {plan.continuation.reentry?.before_step === step.key ? <li className="erp-dev-chain__reentry-note">重新进入 {stageLabel(reentryStage)}{plan.continuation.original_terminal ? ' · 新批' : ''}</li> : null}
                <li data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
                  <button type="button" aria-pressed={selected.key === step.key} onClick={() => onSelectStep(step.key)}><span>{index + 1}</span><strong>{step.label}</strong>{step.role && !step.label.includes(step.role) ? <small>{step.role}</small> : null}</button>
                </li>
              </React.Fragment>
            ))}
          </ol>
          <p className="erp-dev-fulfillment-guide__focus" aria-live="polite" data-selected-exception-node={selected.key}>{selected.result || selected.condition}</p>
          <section className="erp-dev-fulfillment-guide__continuation"><h4>{plan.continuation.kind === 'stop' ? '结束条件' : '继续条件'}</h4><p>{plan.closure}</p><div><span>{plan.continuation.label}</span>{destination ? <Button type="link" size="small" onClick={() => onSelectStage(destination.stage)}>查看第 {catalog.fulfillment_flow.indexOf(destination) + 1} 环节</Button> : null}</div></section>
        </section>
      ) : null}
      <details className="erp-dev-fulfillment-guide__instructions" key={`${guide.key}:${plan?.key || ''}:${context?.stage || ''}`}><summary>处理规则</summary>
        {context?.handling ? <><p>{context.handling.action}</p><p>{context.handling.resume}</p></> : null}
        {plan ? <p>撤销或失败：{plan.recovery}</p> : null}
        {guide.approval ? <><p>审批未通过：{guide.approval.rejected}</p><p>取消：{guide.approval.withdrawal}</p></> : null}
      </details>
    </section>
  )
}
