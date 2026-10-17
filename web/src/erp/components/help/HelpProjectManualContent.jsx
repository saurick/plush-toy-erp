import React from 'react'
import { useLocation } from 'react-router-dom'
import {
  Markdown,
  extractMarkdownHeadings,
} from '../../../common/components/markdown/index.jsx'
import { rewriteProjectManualLinks } from '../../config/projectManuals.mjs'
import HelpChapterContents from './HelpChapterContents'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'

export default function HelpProjectManualContent({ document, allowedBooks, references }) {
  const { pathname } = useLocation()
  const navigate = useBusinessNavigate()
  const source = rewriteProjectManualLinks(document.markdown, allowedBooks, {
    references,
    helpPath: pathname,
  })
  const headings = extractMarkdownHeadings(source, [3, 4])
  const followManualLink = (event) => {
    const href = event.target.closest('a')?.getAttribute('href')
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey ||
      !href?.startsWith(`${pathname}?`)) return
    event.preventDefault()
    navigate(href)
  }
  return (
    <div className="erp-help-handbook-content">
      <HelpChapterContents
        id={`${document.id.replaceAll(':', '-')}-contents`}
        items={headings}
      />
      <div className="erp-help-project-content" onClick={followManualLink}>
        <Markdown source={source} />
      </div>
    </div>
  )
}
