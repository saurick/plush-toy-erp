import React from 'react'
import { createPortal } from 'react-dom'

import { MermaidDiagram } from '@/common/components/markdown'
import { fulfillmentExceptionPath } from '../../erp/utils/workflowFulfillment.mjs'

function formatGeneratedAt(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function ReviewHeader({ review }) {
  return (
    <header className="erp-dev-flow-customer-review__header">
      <p>{review.designScope}</p>
      <h1>{review.documentTitle}</h1>
      <dl>
        <div>
          <dt>生成时间</dt>
          <dd>
            <time dateTime={review.generatedAt}>
              {formatGeneratedAt(review.generatedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>适用范围</dt>
          <dd>{review.applicableScope}</dd>
        </div>
        <div>
          <dt>客户与版本</dt>
          <dd>
            {review.customerBinding}；{review.releaseVersion}
          </dd>
        </div>
      </dl>
    </header>
  )
}

function ReviewDiagram({ diagram, label }) {
  return (
    <section
      className="erp-dev-flow-customer-review__diagram"
      data-customer-review-diagram
    >
      <header>
        <h2>{diagram.title}</h2>
        <p>{diagram.description}</p>
      </header>
      <MermaidDiagram
        chart={diagram.mermaidSource}
        label={label}
        showSourceOnError={false}
        themeMode="light"
        flowchartHtmlLabels={false}
      />
      <ul className="erp-dev-flow-customer-review__legend" aria-label="图例">
        {diagram.legend.map((item) => (
          <li key={item.tone} data-diagram-tone={item.tone}>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  )
}

function OverviewContent({ overview }) {
  return (
    <main data-customer-review-overview>
      <section className="erp-dev-flow-customer-review__summary">
        <h2>业务范围</h2>
        <p>{overview.purpose}</p>
      </section>
      <section className="erp-dev-flow-customer-review__step-table" data-customer-review-fulfillment>
        <h2>正常办理与岗位交接</h2>
        <table data-table-lines="fixed">
          <thead><tr><th scope="col">环节</th><th scope="col">岗位</th><th scope="col">交接与审批</th></tr></thead>
          <tbody>
            {overview.fulfillmentFlow.map((step, index) => (
              <tr key={step.stage}>
                <th scope="row">{index + 1}. {step.label}</th>
                <td>{step.role}</td>
                <td>
                  <p>{step.result}</p>
                  {step.handoffs?.map((handoff) => <p key={handoff}>{handoff}</p>)}
                  {step.approvals?.map((approval) => (
                    <div key={approval.label}>
                      <strong>{approval.label}</strong>
                      <p>{approval.condition}</p>
                      <p>通过：{approval.passed}</p>
                      <p>未通过：{approval.rejected}</p>
                    </div>
                  ))}
                  {!step.handling && step.exception ? <p>异常：{step.exception}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="erp-dev-flow-customer-review__step-table" data-customer-review-handling-table>
        <h2>异常处理与继续条件</h2>
        <table data-table-lines="fixed">
          <colgroup><col style={{ width: '17%' }} /><col style={{ width: '23%' }} /><col style={{ width: '32%' }} /><col style={{ width: '28%' }} /></colgroup>
          <thead><tr><th scope="col">环节</th><th scope="col">异常情况</th><th scope="col">办理方式</th><th scope="col">继续前核对</th></tr></thead>
          <tbody>
            {overview.fulfillmentFlow.map((step, index) => step.handling ? (
              <tr key={step.stage} data-customer-review-handling={step.stage}>
                <th scope="row">{index + 1}. {step.label}</th>
                <td>{step.handling.issues}</td>
                <td>{step.handling.action}</td>
                <td>{step.handling.resume}</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </section>
      <section className="erp-dev-flow-customer-review__all-exceptions">
        <h2>专项异常处置与闭环条件</h2>
        {overview.exceptionGuides.map((guide) => (
          <section key={guide.key} data-customer-review-exception={guide.key}>
            <h3>{guide.label}</h3><p>{guide.source}</p>
            {guide.approval ? <p>审批：{guide.approval.condition} 未通过：{guide.approval.rejected}</p> : null}
            <table data-table-lines="fixed">
              <colgroup><col style={{ width: '18%' }} /><col style={{ width: '38%' }} /><col style={{ width: '44%' }} /></colgroup>
              <thead><tr><th scope="col">处理方案</th><th scope="col">岗位交接</th><th scope="col">闭环与恢复</th></tr></thead>
              <tbody>
                {guide.plans.map((plan) => (
                  <tr key={plan.key}>
                    <th scope="row">{plan.label}</th>
                    <td>{fulfillmentExceptionPath(guide, plan.key).steps.map((step) => `${step.role}：${step.label}`).join(' → ')}</td>
                    <td><p>{plan.closure}</p><p>{plan.recovery}</p>{guide.approval ? <p>{guide.approval.withdrawal}</p> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </section>
      <ReviewDiagram diagram={overview.diagram} label="相关业务专题关系图" />
    </main>
  )
}

function ExceptionList({ paths }) {
  return (
    <ul className="erp-dev-flow-customer-review__exceptions">
      {paths.map((path) => (
        <li key={path}>{path}</li>
      ))}
    </ul>
  )
}

function ChainContent({ chain }) {
  return (
    <main data-customer-review-chain>
      <section className="erp-dev-flow-customer-review__summary">
        <p>{chain.chainKind}</p>
        <h2>业务范围</h2>
        <p>{chain.purpose}</p>
      </section>
      <ReviewDiagram
        diagram={chain.diagram}
        label={`${chain.chainName}关系图`}
      />
      <section className="erp-dev-flow-customer-review__step-table">
        <h2>岗位与完成条件</h2>
        <table data-table-lines="fixed">
          <thead>
            <tr>
              <th scope="col">环节</th>
              <th scope="col">岗位</th>
              <th scope="col">处理与完成条件</th>
            </tr>
          </thead>
          <tbody>
            {chain.steps.map((step) => (
              <tr key={`${step.number}-${step.name}`}>
                <th scope="row">
                  <strong>{step.number}. {step.name}</strong>
                  <small>进入：{step.trigger}</small>
                </th>
                <td>{step.responsibleRole}</td>
                <td>
                  {step.actionOutcomes.length === 0 ? <p>{step.completion}</p> : null}
                  {step.actionOutcomes.map((action) => (
                    <p key={action.key}>
                      <strong>{action.label}</strong>
                      {action.condition ? `条件：${action.condition}；` : ''}
                      {action.results.join('；') || '本动作不直接改变业务状态。'}
                    </p>
                  ))}
                  <p>
                    <strong>下一步</strong>
                    {step.next}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="erp-dev-flow-customer-review__all-exceptions">
        <h2>异常与纠正</h2>
        <ExceptionList paths={chain.displayExceptionPaths} />
      </section>
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
      {review.overview ? (
        <OverviewContent overview={review.overview} />
      ) : (
        <ChainContent chain={review.chain} />
      )}
      <aside className="erp-dev-flow-customer-review__boundary">
        <strong>完成边界</strong>
        <p>{review.completionBoundary}</p>
      </aside>
      <footer>{review.footer}</footer>
    </article>,
    document.body
  )
}
