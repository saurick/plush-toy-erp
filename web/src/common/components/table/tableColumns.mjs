export function normalizeTableColumns(columns = []) {
  return columns.map((column) => {
    const { onHeaderCell, children } = column
    return {
      ...column,
      align: column.align || 'center',
      ...(children ? { children: normalizeTableColumns(children) } : {}),
      onHeaderCell: (...args) => {
        const props = onHeaderCell?.(...args) || {}
        return {
          ...props,
          style: {
            textAlign: 'center',
            verticalAlign: 'middle',
            ...props.style,
          },
        }
      },
    }
  })
}
