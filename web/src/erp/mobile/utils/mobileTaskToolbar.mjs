export function updateMobileTaskToolbar(
  previous,
  { scrollTop, maxScrollTop, pinned, locked = false }
) {
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, maxScrollTop)))
  if (!pinned || locked) {
    return { top, anchor: top, direction: 0, visible: true }
  }
  const delta = top - previous.top
  if (delta === 0) return previous
  const direction = Math.sign(delta)
  const anchor =
    direction === previous.direction ? previous.anchor : previous.top
  const threshold = direction < 0 ? 16 : 24
  return {
    top,
    anchor,
    direction,
    visible:
      Math.abs(top - anchor) >= threshold ? direction < 0 : previous.visible,
  }
}
