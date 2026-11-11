function visibleLeafColumns(columns, includeFixed = true) {
  return columns.flatMap((column) =>
    column.hidden || (!includeFixed && column.fixed)
      ? []
      : column.children ? visibleLeafColumns(column.children, includeFixed) : [column]
  )
}

const columnWidthBudget = (column) => Math.max(column.width, column.minWidth || 0)
const columnGrowth = (column) =>
  Number.isFinite(column.widthGrow) && column.widthGrow > 0 ? column.widthGrow : 0

export function tableColumnsMinimumWidth(columns = []) {
  const leaves = visibleLeafColumns(columns)
  return leaves.length && leaves.every((column) => Number.isFinite(column.width))
    ? leaves.reduce((total, column) => total + columnWidthBudget(column), 0)
    : null
}

export function resolveTableColumnSizing(columns, { controlsWidth, scrollX }) {
  const columnsWidth = tableColumnsMinimumWidth(columns)
  if (columnsWidth === null || typeof scrollX === 'string') return null
  const budget = columnsWidth + controlsWidth
  return {
    budget,
    scrollX: Math.max(Number(scrollX) || 0, budget),
    growth: visibleLeafColumns(columns, false).reduce((total, column) => total + columnGrowth(column), 0),
  }
}

export function normalizeTableColumns(columns = [], { hasRowSelection = false, sizing } = {}) {
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
  if (sizing?.growth > 0) {
    const surplus = `max(${sizing.scrollX - sizing.budget}px, 100cqw - ${sizing.budget}px)`
    for (const column of visibleLeafColumns(normalized)) column.width = columnWidthBudget(column)
    for (const column of visibleLeafColumns(normalized, false)) {
      const weight = columnGrowth(column)
      if (weight) column.width = `calc(${column.width}px + ${surplus} * ${weight / sizing.growth})`
    }
  } else if (hasRowSelection && tableColumnsMinimumWidth(normalized) !== null) {
    const visibleColumns = visibleLeafColumns(normalized)
    const unfixed = visibleColumns.filter((column) => !column.fixed)
    const flexible = unfixed.at(-1) || visibleColumns.at(-1)
    flexible.minWidth = columnWidthBudget(flexible)
    delete flexible.width
  }
  return normalized
}
