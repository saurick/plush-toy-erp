import React from 'react'
import { Remarkable } from 'remarkable'
import RemarkableReactRenderer from 'remarkable-react'
import { MermaidDiagram } from '../diagram/MermaidDiagram.jsx'
import {
  extractMarkdownHeadings,
  stripMarkdownReaderDirectives,
} from './anchors.mjs'

export { extractMarkdownHeadings }

function MarkdownPre({ type, params, content, children }) {
  const language = String(params || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
  if (type === 'fence' && language === 'mermaid') {
    return <MermaidDiagram chart={content} />
  }

  return <pre>{children}</pre>
}

const addHeadingIds = (node, headingQueue, renderHeading) => {
  if (!React.isValidElement(node)) {
    return node
  }

  const elementType = String(node.type || '')
  const headingMatch = /^h([1-6])$/.exec(elementType)
  const nextHeading = headingMatch ? headingQueue.shift() : null
  const children = React.Children.map(node.props.children, (child) =>
    addHeadingIds(child, headingQueue, renderHeading)
  )

  if (!nextHeading) {
    return React.cloneElement(node, undefined, children)
  }

  const aliasAnchors = nextHeading.aliases.map((alias) => (
    <span
      key={`markdown-anchor-${alias}`}
      id={alias}
      data-markdown-anchor="alias"
      aria-hidden="true"
    />
  ))

  const heading = React.cloneElement(node, {
    id: nextHeading.id,
    'data-markdown-anchor': 'heading',
    children: [...aliasAnchors, ...React.Children.toArray(children)],
  })
  return renderHeading ? renderHeading(heading, nextHeading) : heading
}

function foldMarkdownSections(blocks, headings, renderCollapsedSection) {
  const headingsById = new Map(headings.map((heading) => [heading.id, heading]))
  const sections = []
  for (let start = 0; start < blocks.length; start += 1) {
    const block = blocks[start]
    const heading = headingsById.get(block?.props?.id)
    if (!heading?.collapsed) {
      sections.push(block)
      continue
    }

    let end = start + 1
    while (end < blocks.length) {
      const nextHeading = headingsById.get(blocks[end]?.props?.id)
      if (nextHeading && nextHeading.level <= heading.level) break
      end += 1
    }
    sections.push(renderCollapsedSection(block, blocks.slice(start + 1, end)))
    start = end - 1
  }
  return sections
}

// Markdown md展示
export const Markdown = ({ source, renderHeading, renderCollapsedSection }) => {
  const md = new Remarkable()
  const ReactRenderer =
    RemarkableReactRenderer.default || RemarkableReactRenderer
  md.renderer = new ReactRenderer({
    components: {
      pre: MarkdownPre,
    },
  })
  const headings = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  const headingQueue = [...headings]
  const renderSource = stripMarkdownReaderDirectives(source)
  const blocks = React.Children.map(md.render(renderSource), (node) =>
    addHeadingIds(node, headingQueue, renderHeading)
  ) || []
  const nodes = renderCollapsedSection && headings.some((heading) => heading.collapsed)
    ? foldMarkdownSections(blocks, headings, renderCollapsedSection)
    : blocks
  // React refresh traverses sibling fibers recursively. Bound each group so
  // long references remain refreshable without changing DOM or anchor order.
  const groups = []
  for (let index = 0; index < nodes.length; index += 128) {
    groups.push(
      <React.Fragment key={`markdown-group-${index}`}>
        {nodes.slice(index, index + 128)}
      </React.Fragment>
    )
  }
  return groups
}
