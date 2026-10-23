import React, { useImperativeHandle, useMemo, useRef } from 'react'
import { Empty, Table } from 'antd'
import { normalizeTableColumns, tableColumnsMinimumWidth } from './tableColumns.mjs'
import TableScrollControls from './TableScrollControls.jsx'
import { useAppPagination } from '../pagination/AppPagination'
import './app-table.css'

export const TABLE_SELECTION_COLUMN_WIDTH = 52

function MeasuredHeaderTable({ style, ...props }) {
  // Ant measures the body columns. Keep those widths when content grows beyond
  // scroll.x instead of letting the separate header redistribute them.
  return <table data-table-lines="fixed" {...props} style={{ ...style, tableLayout: 'fixed' }} />
}

const AppTable = React.forwardRef(
  (
    { columns, className = '', locale, components, rowSelection, style, scrollToolbar = false, ...props },
    ref
  ) => {
    const tableRef = useRef(null)
    const pagination = useAppPagination(props.pagination)
    const hasRowSelection = Boolean(rowSelection)
    useImperativeHandle(ref, () => tableRef.current)
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns, { hasRowSelection, tableLayout: props.tableLayout }),
      [columns, hasRowSelection, props.tableLayout]
    )
    const scroll = useMemo(() => {
      const columnsWidth = hasRowSelection ? tableColumnsMinimumWidth(columns) : null
      if (columnsWidth === null || typeof props.scroll?.x === 'string') return props.scroll
      // 固定布局不采用列 minWidth，必须保留原有列宽预算，避免伸缩列被挤为零。
      const minimumWidth = columnsWidth + TABLE_SELECTION_COLUMN_WIDTH + (props.expandable?.columnWidth || 0)
      return { ...props.scroll, x: Math.max(Number(props.scroll?.x) || 0, minimumWidth) }
    }, [columns, hasRowSelection, props.scroll, props.expandable?.columnWidth])
    const selection = useMemo(
      () => rowSelection && { ...rowSelection, columnWidth: TABLE_SELECTION_COLUMN_WIDTH },
      [rowSelection]
    )
    const tableComponents = useMemo(() => ({
      ...components,
      header: { table: MeasuredHeaderTable, ...components?.header },
    }), [components])
    const scrollRevision = useMemo(
      () => [
        alignedColumns,
        props.dataSource,
        props.loading,
        scroll,
        props.pagination,
      ],
      [
        alignedColumns,
        props.dataSource,
        props.loading,
        scroll,
        props.pagination,
      ]
    )
    return (
      <>
        <Table
          {...props}
          pagination={pagination}
          ref={tableRef}
          className={`app-table ${className}`.trim()}
          columns={alignedColumns}
          rowSelection={selection}
          scroll={scroll}
          style={{ ...style, '--app-table-selection-column-width': `${TABLE_SELECTION_COLUMN_WIDTH}px` }}
          components={tableComponents}
          locale={
            typeof locale?.emptyText === 'string'
              ? {
                  ...locale,
                  emptyText: <Empty description={locale.emptyText} />,
                }
              : locale
          }
        />
        <TableScrollControls
          tableRef={tableRef}
          revision={scrollRevision}
          loading={props.loading}
          useToolbar={scrollToolbar}
        />
      </>
    )
  }
)

AppTable.displayName = 'AppTable'
AppTable.Summary = Table.Summary

export default AppTable
