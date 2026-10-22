import React, { useImperativeHandle, useMemo, useRef } from 'react'
import { Empty, Table } from 'antd'
import { normalizeTableColumns } from './tableColumns.mjs'
import TableScrollControls from './TableScrollControls.jsx'
import { useAppPagination } from '../pagination/AppPagination'
import './app-table.css'

const AppTable = React.forwardRef(
  (
    { columns, className = '', locale, scrollToolbar = false, ...props },
    ref
  ) => {
    const tableRef = useRef(null)
    const pagination = useAppPagination(props.pagination)
    useImperativeHandle(ref, () => tableRef.current)
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns),
      [columns]
    )
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
