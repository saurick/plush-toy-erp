import { Remarkable } from 'remarkable'

const renderer = new Remarkable({ html: false })
// Company notes are text documents. Images never initiate requests from previews or offline HTML.
renderer.renderer.rules.image = () => '[图片]'

export function renderHelpSupplement(markdown = '') {
  return renderer.render(normalizeSupplementMarkdown(markdown))
}

export function normalizeSupplementMarkdown(markdown = '') {
  let fence = ''
  return String(markdown)
    .split('\n')
    .map((line) => {
      const match = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)
      if (match) {
        const [, marker] = match
        if (!fence) {
          fence = marker.charAt(0)
        } else if (marker.charAt(0) === fence) {
          fence = ''
        }
        return line
      }
      return fence
        ? line
        : line.replace(
            /^(#{1,6})\s+/u,
            (_, hashes) => `${'#'.repeat(Math.min(6, hashes.length + 3))} `
          )
    })
    .join('\n')
}

export function publishedSupplementFor(items, documentId) {
  return (
    items.find(
      (item) => item.document_id === documentId && item.published_version > 0
    ) || null
  )
}

export function supplementMarkdown(supplement) {
  if (!supplement?.markdown?.trim()) return ''
  return `### 企业补充\n\n发布人：${supplement.published_by} · ${supplement.published_at?.slice(0, 10) || ''}\n\n${normalizeSupplementMarkdown(supplement.markdown.trim())}\n`
}

export function withPublishedSupplements(references, items) {
  return references.map((reference) => ({
    ...reference,
    supplement: publishedSupplementFor(items, reference.id),
  }))
}

export function supplementSearchText(supplement) {
  return supplement?.markdown ? `企业补充 ${supplement.markdown}` : ''
}
