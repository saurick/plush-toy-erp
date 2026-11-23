import React, { useState } from 'react'
import Directory, { DirectoryItem } from '@/common/components/navigation/Directory.jsx'

export default function HelpChapterContents({ id, items }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null

  return (
    <Directory
      className="erp-help-handbook-anchors"
      aria-label="本章内容"
    >
      <DirectoryItem
        className="erp-help-handbook-anchors__toggle"
        expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>本章内容</span>
      </DirectoryItem>
      <ol id={id} className="erp-directory-list" hidden={!expanded}>
        {items.map((item) => (
          <li key={item.id}>
            <DirectoryItem
              href={`#${item.id}`}
              onClick={() => setExpanded(false)}
            >
              <span>{item.title}</span>
            </DirectoryItem>
          </li>
        ))}
      </ol>
    </Directory>
  )
}
