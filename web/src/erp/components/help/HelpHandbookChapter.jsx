import React from 'react'
import { getBusinessPageHandbookSections } from '../../config/businessHandbook.mjs'

export default function HelpHandbookChapter({ document }) {
  const sections =
    document.sections || getBusinessPageHandbookSections(document.page)
  const prefix = `handbook-${document.id.replaceAll(':', '-')}`
  return (
    <div className="erp-help-handbook-content">
      <nav className="erp-help-handbook-anchors" aria-label="本章内容">
        {sections.map((section) => (
          <a key={section.key} href={`#${prefix}-${section.key}`}>
            {section.title}
          </a>
        ))}
      </nav>
      {sections.map((section) => (
        <section key={section.key} id={`${prefix}-${section.key}`}>
          <h4>{section.title}</h4>
          {section.paragraphs?.map((text) => (
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
              {section.rows.map(([label, text], index) => (
                <div key={`${label}-${index}`}>
                  <dt>{label}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}
    </div>
  )
}
