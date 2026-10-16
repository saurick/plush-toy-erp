export function getColorCardBodyRowCount(block) {
  const lineCount = Array.isArray(block?.lines) ? block.lines.length : 0
  const minRows = Number(block?.minRows)
  return Math.max(
    1,
    lineCount,
    Number.isFinite(minRows) && minRows > 0 ? Math.floor(minRows) : 3
  )
}

export function splitColorCardBlocks(blocks = []) {
  const sides = { left: [], right: [] }
  const heights = { left: 0, right: 0 }
  blocks.forEach((block, blockIndex) => {
    const side =
      block.side === 'left' || block.side === 'right'
        ? block.side
        : heights.left <= heights.right
          ? 'left'
          : 'right'
    sides[side].push({ block, blockIndex })
    heights[side] += getColorCardBodyRowCount(block) + 1
  })
  return [sides.left, sides.right]
}
