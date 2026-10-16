import React from 'react'
import { Link } from 'react-router-dom'
import { getHelpCenterHref } from '../../config/helpManualCatalog.mjs'
import HelpHandbookChapter from './HelpHandbookChapter'

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
  if (document.kind === 'chapter') {
    return (
      <div className="erp-help-reference-content">
        <HelpHandbookChapter document={document} />
      </div>
    )
  }
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
          <nav className="erp-help-reference-index" aria-label="本章词条">
            <strong>本章可查</strong>
            {page.items.map((entry) => (
              <Link key={entry.key} to={href(entry.key)}>
                {entry.title}
              </Link>
            ))}
          </nav>
          <HelpHandbookChapter document={document} />
        </>
      )}
      {item ? (
        <section>
          <h4>业务边界</h4>
          <p>{page.boundary}</p>
        </section>
      ) : null}
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
