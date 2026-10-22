import React, { useImperativeHandle, useMemo, useRef } from 'react'
import { Empty, Table } from 'antd'
import { normalizeTableColumns } from './tableColumns.mjs'
import TableScrollControls from './TableScrollControls.jsx'
import { useAppPagination } from '../pagination/AppPagination'
import './app-table.css'

function MeasuredHeaderTable({ style, ...props }) {
  // Ant measures the body columns. Keep those widths when content grows beyond
  // scroll.x instead of letting the separate header redistribute them.
  return <table data-table-lines="fixed" {...props} style={{ ...style, tableLayout: 'fixed' }} />
}

const AppTable = React.forwardRef(
  (
    { columns, className = '', locale, components, scrollToolbar = false, ...props },
    ref
  ) => {
    const tableRef = useRef(null)
    const pagination = useAppPagination(props.pagination)
    useImperativeHandle(ref, () => tableRef.current)
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns),
      [columns]
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
        props.scroll,
        props.pagination,
      ],
      [
        alignedColumns,
        props.dataSource,
        props.loading,
        props.scroll,
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
