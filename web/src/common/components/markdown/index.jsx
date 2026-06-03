import React from 'react'
import { Remarkable } from 'remarkable'
import RemarkableReactRenderer from 'remarkable-react'

const stripHeadingMarkdown = (rawTitle = '') =>
  String(rawTitle || '')
    .replace(/\s+#+\s*$/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()

const slugifyHeading = (rawTitle = '') =>
  stripHeadingMarkdown(rawTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

export const extractMarkdownHeadings = (source = '', levels = [2]) => {
  const normalizedLevels = new Set(
    levels
      .map((level) => Number(level || 0))
      .filter((level) => Number.isInteger(level) && level > 0)
  )
  const headingCounts = new Map()
  const headings = []
  const lines = String(source || '').split(/\r?\n/)
  let inFence = false

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (/^```/.test(trimmed)) {
      inFence = !inFence
      return
    }

    if (inFence) {
      return
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
    if (!match) {
      return
    }

    const level = match[1].length
    if (!normalizedLevels.has(level)) {
      return
    }

    const title = stripHeadingMarkdown(match[2])
    if (!title) {
      return
    }

    const baseId = slugifyHeading(title) || `section-${headings.length + 1}`
    const nextCount = (headingCounts.get(baseId) || 0) + 1
    headingCounts.set(baseId, nextCount)

    headings.push({
      id: nextCount > 1 ? `${baseId}-${nextCount}` : baseId,
      level,
      title,
    })
  })

  return headings
}

const addHeadingIds = (node, headingQueue) => {
  if (!React.isValidElement(node)) {
    return node
  }

  const elementType = String(node.type || '')
  const headingMatch = /^h([1-6])$/.exec(elementType)
  const nextHeading = headingMatch ? headingQueue.shift() : null
  const children = React.Children.map(node.props.children, (child) =>
    addHeadingIds(child, headingQueue)
  )

  if (!nextHeading) {
    return React.cloneElement(node, undefined, children)
  }

  return React.cloneElement(
    node,
    {
      id: nextHeading.id,
    },
    children
  )
}

// Markdown md展示
export const Markdown = ({ source }) => {
  const md = new Remarkable()
  md.renderer = new RemarkableReactRenderer()
  const headingQueue = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  return React.Children.map(md.render(source), (node) =>
    addHeadingIds(node, headingQueue)
  )
}
