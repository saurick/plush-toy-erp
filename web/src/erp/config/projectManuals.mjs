import { Remarkable } from 'remarkable'
import {
  stripMarkdownHeading,
  slugifyMarkdownHeading,
  extractMarkdownHeadings,
} from '../../common/components/markdown/anchors.mjs'

export const BUSINESS_MANUAL = Object.freeze({
  key: 'business',
  title: '业务使用手册',
  summary: '按当前岗位学习业务办理、字段规则和上下游交接。',
})

export function getProjectManualDocuments(manual) {
  const lines = manual.markdown.split(/\r?\n/u)
  const tokens = new Remarkable().parse(manual.markdown, {})
  const headings = tokens.flatMap((token, index) =>
    token.type === 'heading_open' && token.hLevel === 2
      ? [
          {
            title: stripMarkdownHeading(tokens[index + 1].content),
            start: token.lines[0],
            contentStart: token.lines[1],
          },
        ]
      : []
  )
  const firstTitle = tokens.find(
    (token) => token.type === 'heading_open' && token.hLevel === 1
  )
  const entries = [
    {
      title: '使用说明',
      key: 'overview',
      start: firstTitle?.lines[1] || 0,
      end: headings[0]?.start || lines.length,
    },
  ]
  const seen = new Set(['overview'])
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const base = slugifyMarkdownHeading(heading.title.split(' / ').at(-1))
    let key = base
    for (let suffix = 2; seen.has(key); suffix += 1) key = `${base}-${suffix}`
    seen.add(key)
    entries.push({
      title: heading.title.split(' / ')[0],
      key,
      anchor: slugifyMarkdownHeading(heading.title),
      start: heading.contentStart,
      end: headings[index + 1]?.start || lines.length,
    })
  }
  return entries.map((entry) => ({
    id: `manual:${manual.key}:${entry.key}`,
    kind: 'manual',
    manualKey: manual.key,
    manualTitle: manual.title,
    title: entry.title,
    summary: manual.summary,
    sectionTitle: manual.title,
    chapterAnchor: entry.anchor || '',
    anchors: extractMarkdownHeadings(
      lines.slice(entry.start, entry.end).join('\n'),
      [3, 4]
    ).map((heading) => heading.id),
    markdown: lines.slice(entry.start, entry.end).join('\n').trim(),
  }))
}

export function rewriteProjectManualLinks(
  source,
  allowedBooks = ['business'],
  { references, helpPath = '/erp/help-center' } = {}
) {
  const names = {
    '业务使用手册.md': 'business',
    '管理员与实施手册.md': 'administration',
    '技术维护与运维手册.md': 'operations',
  }
  return String(source).replace(
    /(!?)\[([^\]]+)\]\(([^)]+)\)/gu,
    (original, image, label, href) => {
      if (image || /^(?:https?:|mailto:|#)/u.test(href)) return original
      const [file, rawAnchor = ''] = href.split('#')
      let anchor
      try {
        anchor = decodeURIComponent(rawAnchor)
      } catch {
        return label
      }
      const book = names[file.split('/').at(-1)]
      if (!book) return `${label}（源码专题：\`${href}\`）`
      if (!allowedBooks.includes(book)) return label
      const target = references?.find((reference) => {
        if (book === 'business') {
          return !reference.manualKey &&
            (anchor ? reference.id === anchor || reference.id.replaceAll(':', '-') === anchor : reference.id === 'handbook:start')
        }
        return reference.manualKey === book &&
          (anchor ? reference.chapterAnchor === anchor || reference.anchors?.includes(anchor) : reference.id === `manual:${book}:overview`)
      })
      // 书目可读不代表其中每个业务章节都属于当前账号的阅读范围。
      if (references && !target) return label
      const params = new URLSearchParams({
        view: 'reference',
        book,
        ref: target?.id || (
          book === 'business'
            ? anchor || 'handbook:start'
            : `manual:${book}:overview`),
      })
      const fragment = anchor && target?.anchors?.includes(anchor)
        ? `#${encodeURIComponent(anchor)}` : ''
      return `[${label}](${helpPath}?${params}${fragment})`
    }
  )
}

export function validateProjectManuals(data) {
  const keys = new Set()
  if (
    !Array.isArray(data?.manuals) ||
    data.manuals.some((manual) => {
      if (
        !manual ||
        !['administration', 'operations'].includes(manual.key) ||
        keys.has(manual.key)
      ) {
        return true
      }
      keys.add(manual.key)
      return (
        ![manual.title, manual.summary, manual.markdown].every(
          (value) => typeof value === 'string' && value.trim()
        ) || !/^[a-f0-9]{64}$/u.test(manual.source_hash)
      )
    })
  ) {
    const error = new Error('项目手册内容不完整，请重新读取')
    error.isInvalidResponse = true
    throw error
  }
  return data.manuals
}
