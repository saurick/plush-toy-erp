import React from 'react'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import './businessLineTable.css'

const LineTableContext = React.createContext(null)

export function useBusinessLineTable() {
  return React.useContext(LineTableContext)
}

export function BusinessLineTableSurface({ header, children }) {
  return <div className="erp-business-line-table" data-table-scroll-scope>{header}{children}</div>
}

export default function BusinessLineTable({
  columns,
  children,
  header,
  label = '单据明细',
  className = '',
  tableClassName = '',
  minWidth,
  expandableDetails = false,
  scrollControlsInToolbar = false,
  stickyHeader = scrollControlsInToolbar,
}) {
  const tableColumns = expandableDetails
    ? [{ key: 'details', label: '补充', width: 44, className: 'erp-line-item-table__disclosure' }, ...columns]
    : columns
  const columnCount = tableColumns.length
  const context = React.useMemo(() => ({ expandableDetails, columnCount }), [expandableDetails, columnCount])
  return (
    <LineTableContext.Provider value={context}>
      <BusinessLineTableSurface header={header}>
        <TableScrollRegion
          className={`erp-sales-order-lines-form__list ${className}`.trim()}
          role="region"
          aria-label={label}
          tabIndex={0}
          useToolbar={scrollControlsInToolbar}
          stickyHeader={stickyHeader}
        >
          <table
            className={`erp-line-item-table ${tableClassName}`.trim()}
            data-business-line-table
            data-line-details-column={expandableDetails ? 'true' : undefined}
            data-table-lines="appearance"
            aria-label={label}
            style={minWidth === undefined ? undefined : { minWidth }}
          >
            <colgroup>
              {tableColumns.map((column, index) => (
                <col key={column.key ?? index} className={column.colClassName} style={column.flexible ? undefined : { width: column.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {tableColumns.map((column, index) => (
                  <th key={column.key ?? index} className={column.className} scope="col" title={column.hint}>
                    {column.required ? <span className="erp-line-item-table__required" aria-hidden="true">*{' '}</span> : null}
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            {children}
          </table>
        </TableScrollRegion>
      </BusinessLineTableSurface>
    </LineTableContext.Provider>
  )
}
