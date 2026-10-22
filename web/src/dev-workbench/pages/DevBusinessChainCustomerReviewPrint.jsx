import React from 'react'
import { createPortal } from 'react-dom'

import { MermaidDiagram } from '@/common/components/markdown'

function ReviewHeader({ review }) {
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(review.generatedAt))
  return (
    <header className="erp-dev-flow-customer-review__header">
      <h1>{review.documentTitle}</h1>
      <p>{review.designScope} · <time dateTime={review.generatedAt}>{date}</time></p>
    </header>
  )
}

function StageCard({ entry }) {
  return (
    <li data-customer-review-stage={entry.step.stage} data-conditional={entry.step.branch || undefined}>
      <h3><span>{entry.number}</span>{entry.label}</h3>
      <p className="erp-dev-flow-customer-review__role">{entry.step.role}</p>
      <p>{entry.step.result}</p>
    </li>
  )
}

function OverviewContent({ overview }) {
  return (
    <main data-customer-review-overview>
      <section className="erp-dev-flow-customer-review__phase-map" aria-label="订单主流程">
        {overview.phases.map((phase) => (
          <section key={phase.key}>
            <h2>{phase.label}</h2>
            <ol>{phase.stages.map((entry) => <StageCard key={entry.step.stage} entry={entry} />)}</ol>
            {phase.branches.length > 0 ? (
              <aside>
                <h3>按约定办理</h3>
                <ul>{phase.branches.map((entry) => <StageCard key={entry.step.stage} entry={entry} />)}</ul>
              </aside>
            ) : null}
          </section>
        ))}
      </section>
      <section className="erp-dev-flow-customer-review__exception-map" data-customer-review-exception-map>
        <h2>关键异常分支</h2>
        <div>
          {overview.exceptionGuides.map((guide) => (
            <section key={guide.key} data-customer-review-exception={guide.key}>
              <h3>{guide.label}{guide.approval ? <small>审批后执行</small> : null}</h3>
              <dl>
                {guide.plans.map((plan) => (
                  <div key={plan.key} data-customer-review-plan={plan.key}>
                    <dt>{plan.label}</dt>
                    <dd>{[plan.continuation.original_terminal, plan.continuation.reentry?.label, plan.continuation.label].filter(Boolean).join('；')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}

function ChainContent({ chain }) {
  const conditions = [...new Map(chain.steps.flatMap((step) => step.actionOutcomes.filter((action) => action.condition).map((action) => [action.key, action]))).values()]
  return (
    <main data-customer-review-chain>
      <section className="erp-dev-flow-customer-review__diagram" data-customer-review-diagram>
        <MermaidDiagram
          chart={chain.diagram.mermaidSource}
          label={`${chain.chainName}流程图`}
          showSourceOnError={false}
          themeMode="light"
          flowchartHtmlLabels={false}
        />
        <ul className="erp-dev-flow-customer-review__legend" aria-label="图例">
          {chain.diagram.legend.map((item) => <li key={item.tone} data-diagram-tone={item.tone}>{item.label}</li>)}
        </ul>
      </section>
      {conditions.length > 0 ? (
        <section className="erp-dev-flow-customer-review__conditions" data-customer-review-conditions>
          <h2>关键条件</h2>
          <ul>{conditions.map((action) => <li key={action.key}><strong>{action.label}：</strong>{action.condition}</li>)}</ul>
        </section>
      ) : null}
    </main>
  )
}

export default function DevBusinessChainCustomerReviewPrint({ review }) {
  if (!review || typeof document === 'undefined') return null
  return createPortal(
    <article
      className="erp-dev-flow-customer-review-print"
      data-customer-review-print-root
      data-review-mode={review.overview ? 'overview' : 'chain'}
      data-review-generated-at={review.generatedAt}
    >
      <ReviewHeader review={review} />
      {review.overview ? <OverviewContent overview={review.overview} /> : <ChainContent chain={review.chain} />}
      <footer>{review.customerBinding}</footer>
    </article>,
    document.body
  )
}
