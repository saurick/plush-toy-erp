import React from 'react'
import { Link } from 'react-router-dom'
import { getHelpCenterHref } from '../../config/helpManualCatalog.mjs'

export function HelpReferenceDetails({ item }) {
  const details = [
    ['数据来源', item.source],
    ['变化时注意', item.updateRule],
    ['举个例子', item.example],
    ['会影响什么', item.effect],
  ].filter(([, value]) => value)
  return (
    <>
      <p>{item.explanation}</p>
      {details.length > 0 ? (
        <dl className="erp-help-reference-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  )
}

export default function HelpReferenceContent({ document, roleKey, onGuide }) {
  const { page, item } = document
  const href = (itemKey = '') =>
    getHelpCenterHref({ pageKey: page.key, itemKey, roleKey })
  return (
    <div className="erp-help-reference-content">
      <nav className="erp-help-reference-links" aria-label="相关帮助">
        {item ? <Link to={href()}>查看{page.title}完整章节</Link> : null}
        {onGuide ? (
          <button type="button" onClick={onGuide}>
            查看相关操作图解 →
          </button>
        ) : null}
      </nav>
      {item ? (
        <HelpReferenceDetails item={item} />
      ) : (
        <>
          <p className="erp-help-reference-lead">{page.task}</p>
          <nav className="erp-help-reference-index" aria-label="本章词条">
            <strong>本章可查</strong>
            {page.items.map((entry) => (
              <Link key={entry.key} to={href(entry.key)}>
                {entry.title}
              </Link>
            ))}
          </nav>
          <section>
            <h4>办理顺序</h4>
            <ol>
              {page.flowSteps.map((description) => (
                <li key={description}>{description}</li>
              ))}
            </ol>
          </section>
          <section>
            <h4>完成标准与交接</h4>
            <p>{page.completion}</p>
            <p>{page.handoff}</p>
          </section>
          {page.items.map((entry) => (
            <section key={entry.key}>
              <h4>
                <Link to={href(entry.key)}>{entry.title}</Link>
              </h4>
              <HelpReferenceDetails item={entry} />
            </section>
          ))}
        </>
      )}
      <section>
        <h4>业务边界</h4>
        <p>{page.boundary}</p>
      </section>
      {item ? (
        <nav className="erp-help-reference-index" aria-label="同章其他词条">
          <strong>继续查阅</strong>
          {page.items
            .filter((entry) => entry.key !== item.key)
            .map((entry) => (
              <Link key={entry.key} to={href(entry.key)}>
                {entry.title}
              </Link>
            ))}
        </nav>
      ) : null}
    </div>
  )
}
