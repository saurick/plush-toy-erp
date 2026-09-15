import React, { useMemo } from 'react'
import { Table } from 'antd'
import { normalizeTableColumns } from './tableColumns.mjs'
import './app-table.css'

const AppTable = React.forwardRef(({ columns, className = '', ...props }, ref) => {
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
    />
  )
})

AppTable.displayName = 'AppTable'

export default AppTable
