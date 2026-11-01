import React from 'react'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import SelectPresentationContext from '@/common/components/select/SelectPresentationContext.jsx'
import './businessCompactFieldTable.css'
import './businessLineItemGroups.css'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'

export default function BusinessCompactFieldTable({
  columns,
  label,
  children,
  className = '',
  showSequence = false,
}) {
  return (
    <TableScrollRegion className={`erp-compact-field-table ${className}`.trim()}>
      <table data-table-lines="appearance" aria-label={label}>
        <colgroup>
          {showSequence ? <col style={{ width: 44 }} /> : null}
          {columns.map((column, index) => (
            <col key={index} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {showSequence ? (
              <th
                className="erp-compact-field-table__sequence"
                scope="col"
              >
                序号
              </th>
            ) : null}
            {columns.map((column, index) => (
              <th key={index} scope="col">
                {column.required ? (
                  <span
                    className="erp-compact-field-table__required"
                    aria-hidden="true"
                  >
                    *
                  </span>
                ) : null}
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </TableScrollRegion>
  )
}

export function BusinessCompactFieldRow({
  cells,
  actions,
  children,
  label,
  className = '',
  rowRef,
  sequence,
  lineItemIndex,
}) {
  const disclosure = useBusinessLineItemDisclosure()
  return (
    <tbody
      className={`erp-compact-field-table__row erp-editable-line-group ${className}`.trim()}
      aria-label={label}
      ref={rowRef}
      hidden={disclosure?.hidden}
      data-line-item-collapsed={disclosure?.hidden ? 'true' : undefined}
      data-line-item-index={disclosure?.index ?? lineItemIndex}
      onFocusCapture={disclosure?.onFocus}
    >
      <tr className="erp-compact-field-table__fields">
        {sequence !== undefined ? (
          <td
            className="erp-compact-field-table__sequence erp-editable-line-group__sequence"
            rowSpan={children ? 2 : 1}
            aria-label={`第 ${sequence} 条`}
          >
            <span className="erp-editable-line-group__number">{sequence}</span>
          </td>
        ) : null}
        {cells.map((cell, index) => (
          <td key={index}><SelectPresentationContext.Provider value="reference">{cell}</SelectPresentationContext.Provider></td>
        ))}
        {actions !== undefined ? (
          <td className="erp-compact-field-table__actions">{actions}</td>
        ) : null}
      </tr>
      {children ? (
        <tr className="erp-compact-field-table__details">
          <td
            colSpan={
              cells.length +
              (actions !== undefined ? 1 : 0)
            }
          >
            {children}
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}

export function BusinessLineItemsEmpty({ children }) {
  return (
    <div className="erp-line-items-empty">
      {children || '暂无明细，请添加一行'}
    </div>
  )
}
