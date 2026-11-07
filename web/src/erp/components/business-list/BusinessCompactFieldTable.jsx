import React from 'react'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import BusinessLineTable, { useBusinessLineTable } from './BusinessLineTable.jsx'
import SelectPresentationContext from '@/common/components/select/SelectPresentationContext.jsx'
import './businessCompactFieldTable.css'
import './businessLineItemGroups.css'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'
import BusinessLineEditor, { BusinessLineEditorRowControls, useBusinessLineEditor, useBusinessLineEditorRow } from './BusinessLineEditor.jsx'
import { BusinessLineItemsHeader } from './BusinessLineItemsFooter.jsx'
import BusinessLineItemDetailsToggle, { useBusinessLineItemDetails } from './BusinessLineItemDetails.jsx'

export default function BusinessCompactFieldTable({ columns, ...props }) {
  const editor = useBusinessLineEditor()
  const rowActions = columns.some((column) => column.actions)
  return editor ? <CompactFieldTableContent {...props} columns={columns} /> : (
    <BusinessLineEditor rowActions={rowActions} data-table-scroll-scope>
      <CompactFieldTableContent {...props} columns={columns} header={props.header ?? (rowActions ? <BusinessLineItemsHeader scrollControls /> : undefined)} />
    </BusinessLineEditor>
  )
}

function CompactFieldTableContent({
  columns,
  label,
  children,
  header,
  className = '',
  showSequence = false,
  expandableDetails = false,
  scrollControlsInToolbar = false,
  stickyHeader = scrollControlsInToolbar,
}) {
  const editor = useBusinessLineEditor()
  const visibleColumns = editor?.compact ? columns : columns.filter((column) => !column.actions)
  return (
    <BusinessLineTable
      header={header}
      className={`erp-compact-field-table ${className}`.trim()}
      label={label}
      expandableDetails={expandableDetails && showSequence && !editor?.compact}
      columns={[
        ...(showSequence ? [{ key: 'sequence', label: '序号', width: 'var(--erp-line-item-sequence-width)', className: 'erp-compact-field-table__sequence' }] : []),
        ...visibleColumns,
      ]}
      scrollControlsInToolbar={scrollControlsInToolbar}
      stickyHeader={stickyHeader}
    >
      {children}
    </BusinessLineTable>
  )
}

export function BusinessCompactFieldRow({
  cells,
  actions,
  children,
  persistentFields,
  detailsToggleLabel = '补充资料',
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
  const table = useBusinessLineTable()
  const inlineActions = !editor?.rowActions || editor.compact
  const rowHidden = hidden || disclosure?.hidden
  const index = disclosure?.index ?? lineItemIndex ?? (sequence === undefined ? 0 : sequence - 1)
  const collapsible = Boolean(children && sequence !== undefined && table?.expandableDetails)
  const details = useBusinessLineItemDetails({ index, collapsible })
  const columnCount = cells.length + (actions !== undefined && inlineActions ? 1 : 0)
  const selection = useBusinessLineEditorRow({ actions, hidden: rowHidden, rowRef, onFocus: disclosure?.onFocus })
  return (
    <tbody
      className={`erp-compact-field-table__row erp-editable-line-group ${className}`.trim()}
      aria-label={label}
      hidden={rowHidden}
      data-line-item-collapsed={rowHidden ? 'true' : undefined}
      data-line-item-index={disclosure?.index ?? lineItemIndex}
      data-line-item-details={collapsible ? 'collapsible' : undefined}
      {...selection.rowProps}
    >
      <tr className="erp-compact-field-table__fields">
        {table?.expandableDetails ? (
          <td className="erp-line-item-table__disclosure" rowSpan={1 + (persistentFields ? 1 : 0) + (children && details.visible ? 1 : 0)}>
            {collapsible ? <BusinessLineItemDetailsToggle index={index} label={detailsToggleLabel} details={details} /> : null}
          </td>
        ) : null}
        {sequence !== undefined ? (
          <td
            className="erp-compact-field-table__sequence erp-editable-line-group__sequence"
            rowSpan={1 + (persistentFields ? 1 : 0) + (children && details.visible ? 1 : 0)}
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
      {persistentFields ? (
        <tr className="erp-compact-field-table__details">
          <td colSpan={columnCount}>
            {details.errorCount ? <span className="erp-line-item-details__errors" role="status">{details.errorCount} 项待修改</span> : null}
            {persistentFields}
          </td>
        </tr>
      ) : null}
      {children ? (
        <tr id={details.id} hidden={!details.visible} className="erp-compact-field-table__details">
          <td colSpan={columnCount}>
            {!persistentFields && details.errorCount ? <span className="erp-line-item-details__errors" role="status">{details.errorCount} 项待修改</span> : null}
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
