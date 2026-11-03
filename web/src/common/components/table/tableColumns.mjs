function visibleLeafColumns(columns) {
  return columns.flatMap((column) =>
    column.hidden ? [] : column.children ? visibleLeafColumns(column.children) : [column]
  )
}

export function tableColumnsMinimumWidth(columns = []) {
  const leaves = visibleLeafColumns(columns)
  return leaves.length && leaves.every((column) => Number.isFinite(column.width))
    ? leaves.reduce((total, column) => total + Math.max(column.width, column.minWidth || 0), 0)
    : null
}

export function normalizeTableColumns(columns = [], { hasRowSelection = false } = {}) {
  const normalized = columns.map((column) => {
    const { onHeaderCell, children } = column
    return {
      ...column,
      align: column.align || 'left',
      ...(children ? { children: normalizeTableColumns(children) } : {}),
      onHeaderCell: (...args) => {
        const props = onHeaderCell?.(...args) || {}
        return {
          ...props,
          'data-column-align': column.align || 'left',
          style: {
            ...props.style,
            textAlign: column.align || 'left',
            verticalAlign: 'middle',
          },
        }
      },
    }
  })
  if (hasRowSelection && tableColumnsMinimumWidth(normalized) !== null) {
    const visibleColumns = visibleLeafColumns(normalized)
    const unfixed = visibleColumns.filter((column) => !column.fixed)
    // 只留末列承接余量；其他列的预算在空结果和加载期间同样有效。
    const flexible = [unfixed.at(-1) || visibleColumns.at(-1)]
    for (const column of flexible) {
      column.minWidth = Math.max(column.minWidth || 0, column.width)
      delete column.width
    }
  }
  return normalized
}
