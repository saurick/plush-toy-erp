import React, { useState } from 'react'

export default function HelpChapterContents({ id, items }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null

  return (
    <nav
      className="erp-help-handbook-anchors"
      aria-label="本章内容"
      data-expanded={expanded}
    >
      <button
        type="button"
        className="erp-help-handbook-anchors__toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((open) => !open)}
      >
        本章内容 <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <ol id={id}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="erp-help-handbook-anchor-link"
              href={`#${item.id}`}
              onClick={() => setExpanded(false)}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
