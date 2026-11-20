import React from 'react'
import Link from '../business-list/BusinessLink.jsx'
import { getHelpCenterHref } from '../../config/helpManualCatalog.mjs'
import HelpHandbookChapter from './HelpHandbookChapter'

export function HelpReferenceDetails({ item }) {
  return (
    <>
      <p>{item.explanation}</p>
      <dl className="erp-help-reference-details">
        {[
          ['数据来源', item.source],
          ['变化时注意', item.updateRule],
          ['举个例子', item.example],
          ['会影响什么', item.effect],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
    </>
  )
}

export default function HelpReferenceContent({ document, roleKey }) {
  if (!document.item) {
    return (
      <div className="erp-help-reference-content">
        <HelpHandbookChapter
          key={document.id}
          document={document}
          roleKey={roleKey}
        />
      </div>
    )
  }
  const { page, item } = document
  const href = (itemKey = '') =>
    getHelpCenterHref({ pageKey: page.key, itemKey, roleKey })
  return (
    <div className="erp-help-reference-content erp-help-reference-content--term">
      <nav className="erp-help-reference-links" aria-label="相关帮助">
        <Link to={href()}>← 查看{page.title}完整章节</Link>
      </nav>
      <HelpReferenceDetails item={item} />
      <section>
        <h4>业务边界</h4>
        <p>{page.boundary}</p>
      </section>
      <nav className="erp-help-reference-index" aria-label="同章其他词条">
        <strong>同章其他词条</strong>
        {page.items
          .filter((entry) => entry.key !== item.key)
          .map((entry) => (
            <Link key={entry.key} to={href(entry.key)}>
              {entry.title}
            </Link>
          ))}
      </nav>
    </div>
  )
}
