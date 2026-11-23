const DEV_DOCS_ORIGIN = 'https://dev-docs.local'

export function buildDevDocsChapterOutline(headings, titleHeadingId) {
  const bodyHeadings = headings.filter((heading) => heading.id !== titleHeadingId)
  const chapterLevel = Math.min(...bodyHeadings.map((heading) => heading.level))
  const chapters = []
  const locationByHeadingId = new Map()
  let chapter
  let tocHeadingId

  for (const heading of bodyHeadings) {
    if (heading.level === chapterLevel) {
      chapter = { heading, sections: [] }
      chapters.push(chapter)
      tocHeadingId = heading.id
    } else if (chapter && heading.level === chapterLevel + 1) {
      chapter.sections.push(heading)
      tocHeadingId = heading.id
    }
    if (chapter) {
      locationByHeadingId.set(heading.id, {
        chapterId: chapter.heading.id,
        tocHeadingId,
      })
    }
  }
  return { chapters, locationByHeadingId }
}

export function resolveDevDocsReadingHeading(
  headings = [],
  { scrollTop = 0, clientHeight = 0, scrollHeight = 0, readingInset = 16 } = {},
  preferredHeadingId = ''
) {
  if (headings.length === 0) return ''
  const preferred = preferredHeadingId && headings.find((heading) => heading.id === preferredHeadingId)
  if (preferred && preferred.top >= scrollTop - 1 && preferred.top < scrollTop + clientHeight) {
    return preferred.id
  }
  if (
    scrollTop > 0 &&
    scrollHeight > clientHeight &&
    scrollTop + clientHeight >= scrollHeight - 1
  ) {
    return headings.at(-1).id
  }
  let current = headings[0].id
  for (const heading of headings) {
    if (heading.top > scrollTop + readingInset) break
    current = heading.id
  }
  return current
}

function decodeUrlPart(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeHref(value = '') {
  const href = String(value || '').trim()
  if (href.startsWith('<') && href.endsWith('>')) {
    return href.slice(1, -1).trim()
  }
  return href
}

export function buildDevDocsLocation({
  pathname = '/__dev/docs',
  search = '',
  path = '',
  headingId = '',
} = {}) {
  const params = new URLSearchParams(search)
  params.set('path', String(path || '').trim())
  return {
    pathname,
    search: `?${params.toString()}`,
    hash: headingId ? `#${encodeURIComponent(headingId)}` : '',
  }
}

export function findDevDocsMarkdownAnchor(container, headingId = '') {
  const normalizedHeadingId = String(headingId || '').trim()
  if (!container || !normalizedHeadingId) return null

  return (
    [...container.querySelectorAll('[data-markdown-anchor]')].find(
      (element) => element.id === normalizedHeadingId
    ) || null
  )
}

export function resolveDevDocsMarkdownHref(href = '', currentPath = '') {
  const normalizedHref = normalizeHref(href)
  const normalizedCurrentPath = String(currentPath || '').trim()
  if (!normalizedHref || !normalizedCurrentPath) {
    return null
  }

  if (normalizedHref.startsWith('#')) {
    return {
      path: normalizedCurrentPath,
      headingId: decodeUrlPart(normalizedHref.slice(1)),
    }
  }

  if (
    normalizedHref.startsWith('/') ||
    normalizedHref.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(normalizedHref)
  ) {
    return null
  }

  let target
  try {
    target = new URL(
      normalizedHref,
      `${DEV_DOCS_ORIGIN}/${normalizedCurrentPath}`
    )
  } catch {
    return null
  }

  const targetPath = decodeUrlPart(target.pathname.replace(/^\/+/, ''))
  if (!/\.md$/iu.test(targetPath)) {
    return null
  }

  return {
    path: targetPath,
    headingId: decodeUrlPart(target.hash.replace(/^#/, '')),
  }
}
