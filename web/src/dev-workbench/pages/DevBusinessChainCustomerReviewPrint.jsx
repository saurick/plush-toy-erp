import React from 'react'
import { createPortal } from 'react-dom'

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
          <dt>客户发布范围</dt>
          <dd>{review.customerBinding}</dd>
        </div>
        <div>
          <dt>发布版本</dt>
          <dd>{review.releaseVersion}</dd>
        </div>
      </dl>
    </header>
  )
}

function OverviewContent({ overview }) {
  return (
    <main data-customer-review-overview>
      <section className="erp-dev-flow-customer-review__summary">
        <h2>这份总览解决什么问题</h2>
        <p>{overview.purpose}</p>
        <p>{overview.detailBoundary}</p>
      </section>
      <div className="erp-dev-flow-customer-review__lanes">
        {overview.lanes.map((lane) => (
          <section key={lane.name}>
            <header>
              <h2>{lane.name}</h2>
              <p>{lane.purpose}</p>
            </header>
            <ol>
              {lane.chains.map((chain) => (
                <li key={`${chain.number}-${chain.name}`}>
                  <span>{chain.number}</span>
                  <div>
                    <h3>{chain.name}</h3>
                    <p>{chain.purpose}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
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
        <h2>这条业务链解决什么问题</h2>
        <p>{chain.purpose}</p>
      </section>
      <ol className="erp-dev-flow-customer-review__steps">
        {chain.steps.map((step) => (
          <li key={`${step.number}-${step.name}`}>
            <header>
              <span>第 {step.number} 步</span>
              <h2>{step.name}</h2>
            </header>
            <p className="erp-dev-flow-customer-review__action">
              {step.action}
            </p>
            <dl>
              <div>
                <dt>谁负责</dt>
                <dd>{step.responsibleRole}</dd>
              </div>
              <div>
                <dt>触发条件或前置条件</dt>
                <dd>{step.trigger}</dd>
              </div>
              <div>
                <dt>系统自动完成什么</dt>
                <dd>{step.systemAction}</dd>
              </div>
              <div>
                <dt>人员需要办理什么</dt>
                <dd>{step.personAction}</dd>
              </div>
              <div>
                <dt>怎样算完成</dt>
                <dd>{step.completion}</dd>
              </div>
              <div>
                <dt>下一步衔接到哪里</dt>
                <dd>{step.next}</dd>
              </div>
            </dl>
            <section>
              <h3>本步骤适用的异常路径</h3>
              <ExceptionList paths={step.exceptionPaths} />
            </section>
          </li>
        ))}
      </ol>
      <section className="erp-dev-flow-customer-review__all-exceptions">
        <h2>整条业务链的异常与纠正路径</h2>
        <ExceptionList paths={chain.exceptionPaths} />
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
