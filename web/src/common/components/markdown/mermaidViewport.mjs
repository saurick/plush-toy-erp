export const MERMAID_ZOOM = Object.freeze({
  min: 0.01,
  max: 2.4,
  step: 0.2,
  defaultValue: 1,
  preview: 0.9,
  previewMin: 0.75,
})

export function normalizeMermaidZoom(value) {
  const zoom = Number.isFinite(value) ? value : MERMAID_ZOOM.defaultValue
  return (
    Math.round(
      Math.min(MERMAID_ZOOM.max, Math.max(MERMAID_ZOOM.min, zoom)) * 100
    ) / 100
  )
}

// Only the root flowchart declaration changes; labels and subgraph directions stay intact.
const FLOWCHART_HEADER =
  /^(\s*(?:---\s*\r?\n[\s\S]*?\r?\n---\s*)?(?:(?:%%\{[\s\S]*?\}%%|%%[^\n]*)\s*)*(?:flowchart|graph)\s+)(TB|TD|BT|LR|RL)(?=\s|;|$)/u

export function getMermaidDirection(source) {
  return String(source || '').match(FLOWCHART_HEADER)?.[2] || ''
}

export function toggleMermaidDirection(direction) {
  return { LR: 'TB', RL: 'BT', TB: 'LR', TD: 'LR', BT: 'RL' }[direction] || ''
}

export function withMermaidDirection(source, direction) {
  if (!['LR', 'RL', 'TB', 'TD', 'BT'].includes(direction)) return source
  return String(source || '').replace(
    FLOWCHART_HEADER,
    (_, prefix) => `${prefix}${direction}`
  )
}

export function fitMermaidZoom({
  width,
  height,
  viewportWidth,
  viewportHeight,
}) {
  if (
    ![width, height, viewportWidth, viewportHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return MERMAID_ZOOM.defaultValue
  }
  const baseWidth = Math.min(width, viewportWidth)
  const baseHeight = (height * baseWidth) / width
  // Round down so the diagram still fits after the percentage is displayed.
  return Math.max(
    MERMAID_ZOOM.min,
    Math.floor(Math.min(1, viewportHeight / baseHeight) * 100) / 100
  )
}
