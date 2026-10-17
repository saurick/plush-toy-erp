import React from 'react'
import Link from '../business-list/BusinessLink.jsx'
import { getBusinessPageHandbookSections } from '../../config/businessHandbook.mjs'
import { getHelpCenterHref } from '../../config/helpManualCatalog.mjs'
import HelpChapterContents from './HelpChapterContents'

export default function HelpHandbookChapter({ document, roleKey }) {
  const sections =
    document.sections || getBusinessPageHandbookSections(document.page)
  const prefix = `handbook-${document.id.replaceAll(':', '-')}`
  const terms = new Set(document.page?.items.map((item) => item.key) || [])
  return (
    <div className="erp-help-handbook-content">
      <HelpChapterContents
        id={`${prefix}-contents`}
        items={sections.map((section) => ({
          id: `${prefix}-${section.key}`,
          title: section.title,
        }))}
      />
      <div className="erp-help-handbook-sections">
        {sections.map((section) => (
          <section
            className="erp-help-handbook-section"
            key={section.key}
            id={`${prefix}-${section.key}`}
          >
            <h4>{section.title}</h4>
            {(section.paragraphs || []).map((text) => (
              <p key={text}>{text}</p>
            ))}
            {section.steps?.length ? (
              <ol>
                {section.steps.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>
            ) : null}
            {section.rows?.length ? (
              <dl className="erp-help-reference-details">
                {section.rows.map(([label, text]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {terms.has(section.key) ? (
              <Link
                className="erp-help-handbook-term-link"
                aria-label={`单独查看：${section.title}`}
                to={getHelpCenterHref({
                  pageKey: document.page.key,
                  itemKey: section.key,
                  roleKey,
                })}
              >
                单独查看词条 →
              </Link>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  )
}
