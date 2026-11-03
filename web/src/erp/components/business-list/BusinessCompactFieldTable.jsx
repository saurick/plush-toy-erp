import React from 'react'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import SelectPresentationContext from '@/common/components/select/SelectPresentationContext.jsx'
import './businessCompactFieldTable.css'
import './businessLineItemGroups.css'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'
import BusinessLineEditor, { BusinessLineEditorRowControls, useBusinessLineEditor, useBusinessLineEditorRow } from './BusinessLineEditor.jsx'
import { BusinessLineItemsHeader } from './BusinessLineItemsFooter.jsx'

export default function BusinessCompactFieldTable({ columns, ...props }) {
  const editor = useBusinessLineEditor()
  const rowActions = columns.some((column) => column.actions)
  return editor ? <CompactFieldTableContent {...props} columns={columns} /> : (
    <BusinessLineEditor rowActions={rowActions} data-table-scroll-scope>
      {rowActions ? <BusinessLineItemsHeader scrollControls /> : null}
      <CompactFieldTableContent {...props} columns={columns} />
    </BusinessLineEditor>
  )
}

function CompactFieldTableContent({
  columns,
  label,
  children,
  className = '',
  showSequence = false,
  scrollControlsInToolbar = false,
  stickyHeader = scrollControlsInToolbar,
}) {
  const editor = useBusinessLineEditor()
  const visibleColumns = editor?.compact ? columns : columns.filter((column) => !column.actions)
  return (
    <TableScrollRegion className={`erp-compact-field-table ${className}`.trim()} useToolbar={scrollControlsInToolbar} stickyHeader={stickyHeader}>
      <table data-table-lines="fixed" aria-label={label}>
        <colgroup>
          {showSequence ? <col style={{ width: 'var(--erp-line-item-sequence-width)' }} /> : null}
          {visibleColumns.map((column, index) => (
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
            {visibleColumns.map((column, index) => (
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
  identity,
  hidden = false,
}) {
  const disclosure = useBusinessLineItemDisclosure()
  const editor = useBusinessLineEditor()
  const inlineActions = !editor?.rowActions || editor.compact
  const rowHidden = hidden || disclosure?.hidden
  const selection = useBusinessLineEditorRow({ actions, hidden: rowHidden, rowRef, onFocus: disclosure?.onFocus })
  return (
    <tbody
      className={`erp-compact-field-table__row erp-editable-line-group ${className}`.trim()}
      aria-label={label}
      hidden={rowHidden}
      data-line-item-collapsed={rowHidden ? 'true' : undefined}
      data-line-item-index={disclosure?.index ?? lineItemIndex}
      {...selection.rowProps}
    >
      <tr className="erp-compact-field-table__fields">
        {sequence !== undefined ? (
          <td
            className="erp-compact-field-table__sequence erp-editable-line-group__sequence"
            rowSpan={children ? 2 : 1}
            aria-label={`第 ${sequence} 条`}
          >
            <BusinessLineEditorRowControls selection={selection} index={sequence - 1} identity={identity || disclosure?.identity} actions={actions}>
              <span className="erp-editable-line-group__number">{sequence}</span>
            </BusinessLineEditorRowControls>
          </td>
        ) : null}
        {cells.map((cell, index) => (
          <td key={index}><SelectPresentationContext.Provider value="reference">{cell}</SelectPresentationContext.Provider></td>
        ))}
        {actions !== undefined && inlineActions ? (
          <td className="erp-compact-field-table__actions">{actions}</td>
        ) : null}
      </tr>
      {children ? (
        <tr className="erp-compact-field-table__details">
          <td
            colSpan={
              cells.length +
              (actions !== undefined && inlineActions ? 1 : 0)
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
    <Empty variant="inline" className="erp-line-items-empty" description={children ?? '暂无明细，请添加一行'} />
  )
}
