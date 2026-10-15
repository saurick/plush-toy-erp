export function normalizeTableColumns(columns = []) {
  return columns.map((column) => {
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
}
