import { cloneDetailCellMerges } from './detailCellMerge.mjs'

export function movePrintItem(items, index, direction) {
  if (
    !Array.isArray(items) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= items.length
  ) {
    return { ok: false, message: '请先选择要调整的条目。' }
  }
  const selectedIndex =
    index + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)
  if (
    selectedIndex === index ||
    selectedIndex < 0 ||
    selectedIndex >= items.length
  ) {
    return { ok: false, message: '当前条目已在边界。' }
  }
  const next = [...items]
  ;[next[index], next[selectedIndex]] = [next[selectedIndex], next[index]]
  return { ok: true, items: next, selectedIndex }
}

export function getPrintRowBlock(merges, index) {
  let start = index
  let end = index
  let expanded = true
  while (expanded) {
    expanded = false
    for (const merge of merges || []) {
      if (
        !Number.isInteger(merge.rowStart) ||
        !Number.isInteger(merge.rowEnd)
      ) {
        continue
      }
      if (merge.rowStart > end || merge.rowEnd < start) continue
      const nextStart = Math.min(start, merge.rowStart)
      const nextEnd = Math.max(end, merge.rowEnd)
      if (nextStart !== start || nextEnd !== end) {
        start = nextStart
        end = nextEnd
        expanded = true
      }
    }
  }
  return { start, end }
}

export function editPrintTableRow({
  lines,
  merges = [],
  rowIndex,
  action,
  createBlankLine,
}) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= lines.length
  ) {
    return { ok: false, message: '请先选择要调整的行。' }
  }
  const safeMerges = cloneDetailCellMerges(merges)
  if (
    safeMerges.some(
      (merge) =>
        !Number.isInteger(merge.rowStart) ||
        !Number.isInteger(merge.rowEnd) ||
        merge.rowStart < 0 ||
        merge.rowEnd < merge.rowStart ||
        merge.rowEnd >= lines.length
    )
  ) {
    return { ok: false, message: '合并行范围无效，请先检查合并区域后再调整。' }
  }
  const current = getPrintRowBlock(safeMerges, rowIndex)
  if (action === 'clear') {
    return {
      ok: true,
      lines: lines.map((line, index) =>
        index >= current.start && index <= current.end
          ? createBlankLine()
          : line
      ),
      merges: safeMerges,
      selectedIndex: rowIndex,
      message:
        current.start === current.end
          ? '已清空当前行，行位置保留。'
          : '已清空当前合并行块，合并关系和位置保留。',
    }
  }
  if (action !== 'up' && action !== 'down') {
    return { ok: false, message: '请选择有效的行操作。' }
  }
  const neighborIndex = action === 'up' ? current.start - 1 : current.end + 1
  if (neighborIndex < 0 || neighborIndex >= lines.length) {
    return { ok: false, message: '当前行已在边界。' }
  }
  const neighbor = getPrintRowBlock(safeMerges, neighborIndex)
  const order = Array.from({ length: lines.length }, (_, index) => index)
  const start = Math.min(current.start, neighbor.start)
  const end = Math.max(current.end, neighbor.end)
  const first = action === 'up' ? current : neighbor
  const second = action === 'up' ? neighbor : current
  const nextOrder = [
    ...order.slice(0, start),
    ...order.slice(first.start, first.end + 1),
    ...order.slice(second.start, second.end + 1),
    ...order.slice(end + 1),
  ]
  const positions = new Map(
    nextOrder.map((oldIndex, newIndex) => [oldIndex, newIndex])
  )
  return {
    ok: true,
    lines: nextOrder.map((index) => lines[index]),
    merges: safeMerges.map((merge) => ({
      ...merge,
      rowStart: positions.get(merge.rowStart),
      rowEnd: positions.get(merge.rowEnd),
    })),
    selectedIndex: positions.get(rowIndex),
    message:
      current.start === current.end
        ? '已调整当前行顺序。'
        : '已整块调整合并行顺序，合并内容保留。',
  }
}
