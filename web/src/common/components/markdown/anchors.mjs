const SUPPORTED_ANCHOR_LINE =
  /^\s*<a\s+(?:id|name)=["']([A-Za-z0-9][A-Za-z0-9._:-]*)["']\s*><\/a>\s*$/iu

function readFenceStart(line = '') {
  const match = /^(`{3,}|~{3,})/u.exec(String(line).trim())
  if (!match) return null
  return {
    marker: match[1][0],
    length: match[1].length,
  }
}

function closesFence(line, fence) {
  if (!fence) return false
  const trimmed = String(line).trim()
  const markerPattern = fence.marker === '`' ? '`' : '~'
  return new RegExp(`^${markerPattern}{${fence.length},}\\s*$`, 'u').test(
    trimmed
  )
}

function explicitAnchorId(line = '') {
  return SUPPORTED_ANCHOR_LINE.exec(String(line))?.[1] || ''
}

function anchorsFollowingHeading(lines, anchorIndex) {
  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (!trimmed || explicitAnchorId(lines[index])) continue
    return /^(#{1,6})\s+(.+?)\s*$/u.test(trimmed)
  }
  return false
}

export function stripMarkdownHeading(rawTitle = '') {
  return String(rawTitle || '')
    .replace(/\s+#+\s*$/u, '')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/\*([^*]+)\*/gu, '$1')
    .replace(/~~([^~]+)~~/gu, '$1')
    .replace(/<\/?[^>]+>/gu, '')
    .trim()
}

// Match GitHub's documented heading-link contract used by repository Markdown:
// spaces become hyphens, other whitespace and punctuation are removed, and
// Unicode letters/numbers remain available for headings such as Chinese text.
export function slugifyMarkdownHeading(rawTitle = '') {
  let slug = ''
  for (const character of stripMarkdownHeading(rawTitle).toLowerCase()) {
    if (character === ' ') {
      slug += '-'
      continue
    }
    if (/\s/u.test(character)) continue
    if (/^[\p{L}\p{M}\p{N}_-]$/u.test(character)) slug += character
  }
  return slug
}

export function stripSupportedExplicitAnchorLines(markdown = '') {
  let fence = null
  const lines = String(markdown || '').split(/\r?\n/u)
  return lines
    .map((line, index) => {
      if (fence) {
        if (closesFence(line, fence)) fence = null
        return line
      }
      const nextFence = readFenceStart(line)
      if (nextFence) {
        fence = nextFence
        return line
      }
      return explicitAnchorId(line) && anchorsFollowingHeading(lines, index)
        ? ''
        : line
    })
    .join('\n')
}

export function extractMarkdownHeadings(source = '', levels = [2]) {
  const normalizedLevels = new Set(
    levels
      .map((level) => Number(level || 0))
      .filter((level) => Number.isInteger(level) && level > 0 && level <= 6)
  )
  const headingCounts = new Map()
  const headings = []
  let headingOrdinal = 0
  let fence = null
  let pendingAliases = []

  for (const line of String(source || '').split(/\r?\n/u)) {
    if (fence) {
      if (closesFence(line, fence)) fence = null
      continue
    }

    const nextFence = readFenceStart(line)
    if (nextFence) {
      fence = nextFence
      pendingAliases = []
      continue
    }

    const anchorId = explicitAnchorId(line)
    if (anchorId) {
      if (!pendingAliases.includes(anchorId)) pendingAliases.push(anchorId)
      continue
    }

    const trimmed = line.trim()
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(trimmed)
    if (!heading) {
      if (trimmed) pendingAliases = []
      continue
    }

    headingOrdinal += 1
    const level = heading[1].length
    const title = stripMarkdownHeading(heading[2])
    if (!title) {
      pendingAliases = []
      continue
    }

    const baseId = slugifyMarkdownHeading(title) || `section-${headingOrdinal}`
    const duplicateCount = headingCounts.get(baseId) || 0
    headingCounts.set(baseId, duplicateCount + 1)
    const id = duplicateCount > 0 ? `${baseId}-${duplicateCount}` : baseId
    const aliases = pendingAliases.filter((alias) => alias !== id)
    pendingAliases = []

    if (normalizedLevels.has(level)) {
      headings.push({ aliases, id, level, title })
    }
  }

  return headings
}

export function extractMarkdownAnchorIds(markdown = '') {
  const ids = new Set()
  for (const heading of extractMarkdownHeadings(markdown, [1, 2, 3, 4, 5, 6])) {
    ids.add(heading.id)
    heading.aliases.forEach((alias) => ids.add(alias))
  }
  return ids
}
