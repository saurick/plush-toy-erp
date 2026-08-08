import React from 'react'
import { createPortal } from 'react-dom'

import { MermaidDiagram } from '@/common/components/markdown'

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
        <h2>这份总览解决什么问题</h2>
        <p>{overview.purpose}</p>
      </section>
      <ReviewDiagram diagram={overview.diagram} label="十二条业务链总览图" />
      <section className="erp-dev-flow-customer-review__overview-index">
        <h2>四个业务区</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">业务区</th>
              <th scope="col">包含哪些业务链</th>
            </tr>
          </thead>
          <tbody>
            {overview.lanes.map((lane) => (
              <tr key={lane.name}>
                <th scope="row">{lane.name}</th>
                <td>
                  {lane.chains.map((chain) => (
                    <span key={`${chain.number}-${chain.name}`}>
                      {chain.number}. {chain.name}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
      <ReviewDiagram
        diagram={chain.diagram}
        label={`${chain.chainName}关系图`}
      />
      <section className="erp-dev-flow-customer-review__step-table">
        <h2>再看表：每一步谁办、怎么办</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">步骤与进入条件</th>
              <th scope="col">谁负责</th>
              <th scope="col">人员与系统怎么配合</th>
              <th scope="col">怎样算完成、接到哪里</th>
            </tr>
          </thead>
          <tbody>
            {chain.steps.map((step) => (
              <tr key={`${step.number}-${step.name}`}>
                <th scope="row">
                  <span>第 {step.number} 步</span>
                  <strong>{step.name}</strong>
                  <small>进入：{step.trigger}</small>
                </th>
                <td>{step.responsibleRole}</td>
                <td>
                  <p>
                    <strong>人员</strong>
                    {step.personAction}
                  </p>
                  <p>
                    <strong>系统</strong>
                    {step.systemAction}
                  </p>
                </td>
                <td>
                  <p>{step.completion}</p>
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
        <h2>异常时怎么走</h2>
        <p>图中已标出主要分支；下列校对点只列一次，不在每一步重复。</p>
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
