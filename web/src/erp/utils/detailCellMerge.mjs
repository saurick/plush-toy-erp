const normalizeMerge = (merge = {}) => ({
  id: String(
    merge.id ||
      `merge_${merge.rowStart}_${merge.rowEnd}_${merge.colStart}_${merge.colEnd}`
  ),
  rowStart: Number(merge.rowStart) || 0,
  rowEnd: Number(merge.rowEnd) || 0,
  colStart: Number(merge.colStart) || 0,
  colEnd: Number(merge.colEnd) || 0,
})

export const cloneDetailCellMerges = (merges = []) =>
  (Array.isArray(merges) ? merges : []).map((merge) => normalizeMerge(merge))

export const normalizeCellSelection = (anchorCell, focusCell = anchorCell) => {
  if (!anchorCell || !focusCell) {
    return null
  }
  const rowStart = Math.min(anchorCell.rowIndex, focusCell.rowIndex)
  const rowEnd = Math.max(anchorCell.rowIndex, focusCell.rowIndex)
  const colStart = Math.min(anchorCell.colIndex, focusCell.colIndex)
  const colEnd = Math.max(anchorCell.colIndex, focusCell.colIndex)
  return { rowStart, rowEnd, colStart, colEnd }
}

export const isCellInsideSelection = (selection, rowIndex, colIndex) => {
  if (!selection) {
    return false
  }
  return (
    rowIndex >= selection.rowStart &&
    rowIndex <= selection.rowEnd &&
    colIndex >= selection.colStart &&
    colIndex <= selection.colEnd
  )
}

export const findMergeAtCell = (merges, rowIndex, colIndex) =>
  cloneDetailCellMerges(merges).find(
    (merge) =>
      rowIndex >= merge.rowStart &&
      rowIndex <= merge.rowEnd &&
      colIndex >= merge.colStart &&
      colIndex <= merge.colEnd
  ) || null

export const isMergeTopLeftCell = (merge, rowIndex, colIndex) =>
  Boolean(merge) && merge.rowStart === rowIndex && merge.colStart === colIndex

const rangesOverlap = (left, right) =>
  left.rowStart <= right.rowEnd &&
  left.rowEnd >= right.rowStart &&
  left.colStart <= right.colEnd &&
  left.colEnd >= right.colStart

export const applyTableCellMerge = ({
  lines = [],
  merges = [],
  selection,
  columnKeys = [],
  cloneLine,
  normalizeLine,
}) => {
  if (!selection) {
    return {
      ok: false,
      message: '请先点“选择单元格”，再在表格里选中要合并的矩形区域。',
    }
  }
  if (
    selection.rowStart === selection.rowEnd &&
    selection.colStart === selection.colEnd
  ) {
    return { ok: false, message: '至少选择 2 个单元格后才能合并。' }
  }
  const safeMerges = cloneDetailCellMerges(merges)
  const conflict = safeMerges.find((merge) => rangesOverlap(merge, selection))
  if (conflict) {
    return {
      ok: false,
      message: '当前选区已命中合并单元格，请先拆分当前后再重新选择。',
    }
  }
  if (typeof cloneLine !== 'function' || typeof normalizeLine !== 'function') {
    return {
      ok: false,
      message: '当前模板未提供合并单元格所需的行克隆逻辑。',
    }
  }

  const nextLines = (Array.isArray(lines) ? lines : []).map((line) =>
    cloneLine(line)
  )
  for (
    let rowIndex = selection.rowStart;
    rowIndex <= selection.rowEnd;
    rowIndex += 1
  ) {
    for (
      let colIndex = selection.colStart;
      colIndex <= selection.colEnd;
      colIndex += 1
    ) {
      if (rowIndex === selection.rowStart && colIndex === selection.colStart) {
        continue
      }
      const fieldKey = columnKeys[colIndex]
      if (fieldKey && nextLines[rowIndex]) {
        nextLines[rowIndex][fieldKey] = ''
      }
    }
    if (nextLines[rowIndex]) {
      nextLines[rowIndex] = normalizeLine(nextLines[rowIndex])
    }
  }

  const nextMerge = normalizeMerge({
    ...selection,
    id: `merge_${Date.now()}_${selection.rowStart}_${selection.colStart}`,
  })

  return {
    ok: true,
    lines: nextLines,
    merges: [...safeMerges, nextMerge],
    message: '已合并选区，按 Excel 规则仅保留左上角内容。',
  }
}

export const splitTableCellMerge = ({ merges, rowIndex, colIndex }) => {
  const targetMerge = findMergeAtCell(merges, rowIndex, colIndex)
  if (!targetMerge) {
    return { ok: false, message: '当前单元格没有命中已合并区域。' }
  }
  return {
    ok: true,
    merges: cloneDetailCellMerges(merges).filter(
      (merge) => merge.id !== targetMerge.id
    ),
    message: '已拆分当前合并单元格。',
  }
}

export const findRowMergeAtLine = (merges, rowIndex) =>
  cloneDetailCellMerges(merges).find(
    (merge) =>
      rowIndex >= merge.rowStart &&
      rowIndex <= merge.rowEnd &&
      merge.rowEnd > merge.rowStart
  ) || null

export const shiftMergesAfterInsert = (merges, insertIndex) =>
  cloneDetailCellMerges(merges).map((merge) => {
    if (merge.rowStart >= insertIndex) {
      return {
        ...merge,
        rowStart: merge.rowStart + 1,
        rowEnd: merge.rowEnd + 1,
      }
    }
    if (merge.rowStart < insertIndex && merge.rowEnd >= insertIndex) {
      return { ...merge, rowEnd: merge.rowEnd + 1 }
    }
    return merge
  })

export const shiftMergesAfterDelete = (merges, deleteStart, deleteEnd) =>
  cloneDetailCellMerges(merges)
    .filter((merge) => merge.rowEnd < deleteStart || merge.rowStart > deleteEnd)
    .map((merge) => {
      if (merge.rowStart > deleteEnd) {
        const offset = deleteEnd - deleteStart + 1
        return {
          ...merge,
          rowStart: merge.rowStart - offset,
          rowEnd: merge.rowEnd - offset,
        }
      }
      return merge
    })
