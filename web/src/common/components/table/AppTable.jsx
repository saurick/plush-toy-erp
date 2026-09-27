import React, { useMemo } from 'react'
import { Empty, Table } from 'antd'
import { normalizeTableColumns } from './tableColumns.mjs'
import './app-table.css'

const AppTable = React.forwardRef(
  ({ columns, className = '', locale, ...props }, ref) => {
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns),
      [columns]
    )
    return (
      <Table
        {...props}
        ref={ref}
        className={`app-table ${className}`.trim()}
        columns={alignedColumns}
        locale={
          typeof locale?.emptyText === 'string'
            ? { ...locale, emptyText: <Empty description={locale.emptyText} /> }
            : locale
        }
      />
    )
  }
)

AppTable.displayName = 'AppTable'

export default AppTable
