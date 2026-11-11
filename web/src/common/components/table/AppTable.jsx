import React, { useImperativeHandle, useMemo, useRef } from 'react'
import { Table } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { normalizeTableColumns, resolveTableColumnSizing } from './tableColumns.mjs'
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
    { columns, className = '', locale, components, rowSelection, style, scrollToolbar = false, scrollControlsOnEmpty = false, ...props },
    ref
  ) => {
    const tableRef = useRef(null)
    const loading = typeof props.loading === 'object' ? props.loading?.spinning === true : Boolean(props.loading)
    const pagination = useAppPagination(props.pagination)
    const hasRowSelection = Boolean(rowSelection)
    useImperativeHandle(ref, () => tableRef.current)
    const sizing = useMemo(
      () => hasRowSelection ? resolveTableColumnSizing(columns, {
        controlsWidth: TABLE_SELECTION_COLUMN_WIDTH + (props.expandable?.columnWidth || 0),
        scrollX: props.scroll?.x,
      }) : null,
      [columns, hasRowSelection, props.scroll?.x, props.expandable?.columnWidth]
    )
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns, { hasRowSelection, sizing }),
      [columns, hasRowSelection, sizing]
    )
    // 固定布局不采用列 minWidth，横向滚动至少保留完整列宽预算。
    const scroll = useMemo(
      () => sizing ? { ...props.scroll, x: sizing.scrollX } : props.scroll,
      [sizing, props.scroll]
    )
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
        props.tableLayout,
      ],
      [
        alignedColumns,
        props.dataSource,
        props.loading,
        scroll,
        props.pagination,
        props.tableLayout,
      ]
    )
    return (
      <>
        <Table
          {...props}
          pagination={pagination}
          ref={tableRef}
          className={`app-table${sizing?.growth ? ' app-table--column-grow' : ''} ${className}`.trim()}
          columns={alignedColumns}
          rowSelection={selection}
          scroll={scroll}
          style={{ ...style, '--app-table-selection-column-width': `${TABLE_SELECTION_COLUMN_WIDTH}px` }}
          components={tableComponents}
          locale={{
            ...locale,
            emptyText: loading ? null : typeof locale?.emptyText === 'string'
              ? <Empty description={locale.emptyText} />
              : locale?.emptyText === undefined ? <Empty /> : locale.emptyText,
          }}
        />
        <TableScrollControls
          tableRef={tableRef}
          revision={scrollRevision}
          loading={props.loading}
          hasRows={Boolean(props.dataSource?.length)}
          useToolbar={scrollToolbar}
          allowEmpty={scrollControlsOnEmpty}
        />
      </>
    )
  }
)

AppTable.displayName = 'AppTable'
AppTable.Summary = Table.Summary

export default AppTable
