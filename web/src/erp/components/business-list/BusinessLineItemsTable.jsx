import React from 'react'
import { RightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import './businessLineItemCards.css'
import './businessLineItemGroups.css'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import SelectPresentationContext from '@/common/components/select/SelectPresentationContext.jsx'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'
import { useBusinessLineItemErrorCount, useBusinessLineItemGroupErrors } from './useBusinessLineItemGroups.js'
import BusinessLineEditor, { BusinessLineEditorRowControls, useBusinessLineEditor, useBusinessLineEditorRow } from './BusinessLineEditor.jsx'
import { BusinessLineItemsHeader } from './BusinessLineItemsFooter.jsx'

const LineItemCardsContext = React.createContext(null)

export default function BusinessLineItemsTable({ label, ...props }) {
  const editor = useBusinessLineEditor()
  return editor ? <LineItemsTableContent {...props} label={label} /> : (
    <BusinessLineEditor data-table-scroll-scope>
      <BusinessLineItemsHeader title={label} scrollControls />
      <LineItemsTableContent {...props} label={label} />
    </BusinessLineEditor>
  )
}

function LineItemsTableContent({
  columns,
  desktopColumns = columns,
  children,
  label = '单据明细',
  scrollControlsInToolbar = false,
}) {
  const { taskBusiness } = useBusinessPageContext() || {}
  const editor = useBusinessLineEditor()
  if (editor?.compact || taskBusiness?.device === 'mobile') return <LineItemCardsContext.Provider value={columns}><div className="erp-task-line-cards" role="region" aria-label={label}>{children}</div></LineItemCardsContext.Provider>
  return (
    <TableScrollRegion
      className="erp-sales-order-lines-form__list"
      role="region"
      aria-label={label}
      tabIndex={0}
      useToolbar={scrollControlsInToolbar}
      stickyHeader={scrollControlsInToolbar}
    >
      <table
        className="erp-line-item-table"
        data-table-lines="fixed"
        style={{
          minWidth: desktopColumns.reduce(
            (total, column) => total + (column.width ?? 0),
            82
          ),
        }}
      >
        <colgroup>
          <col style={{ width: 'var(--erp-line-item-sequence-width, 44px)' }} />
          {desktopColumns.map((column, index) => (
            <col
              key={index}
              style={column.flexible ? undefined : { width: column.width }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="erp-line-item-table__index">序号</th>
            {desktopColumns.map((column, index) => (
              <th scope="col" key={index} title={column.hint}>
                {column.required ? (
                  <span
                    className="erp-line-item-table__required"
                    aria-hidden="true"
                  >
                    *{' '}
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

export function BusinessLineItemGroupHeading({ children, columnCount, collapsed, onToggle, label, count, countLabel = '条明细', controller, groupId, standalone = false }) {
  const cardColumns = React.useContext(LineItemCardsContext)
  const errors = useBusinessLineItemGroupErrors(controller).get(groupId) || 0
  if (onToggle || standalone) {
    const content = (
      <div className="erp-line-item-disclosure-heading">
        {/* 整行触发按钮与标题中的图片预览并列，避免嵌套按钮。 */}
        {onToggle ? <button
          type="button"
          className="erp-line-item-disclosure-heading__toggle"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? '展开' : '收起'}${label}`}
          onClick={onToggle}
        /> : null}
        <div className={`erp-line-item-disclosure-heading__summary${cardColumns || standalone ? '' : ' erp-line-item-disclosure-heading__summary--table'}`}>
          {onToggle ? <RightOutlined className="erp-line-item-disclosure-heading__arrow" aria-hidden="true" /> : null}
          <div className="erp-line-item-disclosure-heading__title">{children}</div>
          <span className="erp-line-item-identity-group__count">{count} {countLabel}</span>
          {errors ? <span className="erp-line-item-disclosure-heading__errors">{errors} 项待修改</span> : null}
        </div>
      </div>
    )
    if (standalone) return content
    return cardColumns
      ? <div className="erp-line-item-identity-group">{content}</div>
      : <tbody className="erp-line-item-identity-group"><tr><td className="erp-line-item-disclosure-cell" colSpan={columnCount}>{content}</td></tr></tbody>
  }
  if (cardColumns) return null
  return (
    <tbody className="erp-line-item-identity-group">
      <tr>
        <td colSpan={columnCount}>
          <div className="erp-line-item-identity-group__content">{children}</div>
        </td>
      </tr>
    </tbody>
  )
}

export function BusinessLineItemRow({
  index,
  cells,
  actions,
  hiddenFields,
  children,
  rowRef,
  status,
  detailsLabel = '补充信息',
  showDetailsHeading = false,
  collapsibleDetails = true,
  defaultDetailsOpen = false,
  detailsIdentity,
  detailsToggleLabel = '补充资料',
  evidence,
}) {
  const cardColumns = React.useContext(LineItemCardsContext)
  const disclosure = useBusinessLineItemDisclosure()
  const [active, setActive] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(defaultDetailsOpen)
  const detailsID = React.useId()
  const errorCount = useBusinessLineItemErrorCount(disclosure?.lineErrors, disclosure?.index ?? index)
  React.useLayoutEffect(() => {
    if (collapsibleDetails && errorCount) setDetailsOpen(true)
  }, [collapsibleDetails, errorCount, disclosure?.validationRevision])
  const detailsVisible = !collapsibleDetails || detailsOpen
  // React focus events include this row's portals without changing section navigation.
  const focusProps = {
    'data-line-active': active ? 'true' : undefined,
    onFocusCapture: (event) => {
      if (event.target.closest?.('.erp-line-editor__action-host')) return
      setActive(true)
      disclosure?.onFocus()
    },
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(false)
    },
  }
  const selection = useBusinessLineEditorRow({ actions, hidden: disclosure?.hidden, rowRef, onFocus: focusProps.onFocusCapture })
  if (cardColumns) { return (
    <section className="erp-task-line-card erp-editable-line-group" aria-label={`第 ${index + 1} 条明细`} hidden={disclosure?.hidden} data-line-item-collapsed={disclosure?.hidden ? 'true' : undefined} data-line-item-index={disclosure?.index} {...focusProps} {...selection.rowProps}>
      <div className="erp-task-line-card__heading"><strong>第 <span className="erp-editable-line-group__number">{index + 1}</span> 条明细</strong>{status}</div>
      <div className="erp-task-line-card__fields">
        {hiddenFields}
        {cells.map((cell, cellIndex) => <div className="erp-task-line-card__field" key={cellIndex}><div className="erp-task-line-card__label">{cardColumns[cellIndex]?.label}{cardColumns[cellIndex]?.required ? <span aria-label="必填"> *</span> : null}</div>{cell}</div>)}
        {children ? <section className="erp-line-item-details" aria-label={detailsLabel}><div className="erp-line-item-details__heading">{detailsLabel}</div><div className="erp-line-item-details__fields">{children}</div></section> : null}
        {evidence}
        {actions ? <div className="erp-task-line-card__actions">{actions}</div> : null}
      </div>
    </section>
  ) }
  return (
    <tbody
      className="erp-sales-order-lines-form__row erp-editable-line-group"
      aria-label={`第 ${index + 1} 条明细`}
      data-line-parity={index % 2 ? 'even' : 'odd'}
      hidden={disclosure?.hidden}
      data-line-item-collapsed={disclosure?.hidden ? 'true' : undefined}
      data-line-item-index={disclosure?.index}
      data-line-item-details={collapsibleDetails ? 'collapsible' : undefined}
      {...focusProps}
      {...selection.rowProps}
    >
      <tr className="erp-line-item-table__main-row">
        <td
          className="erp-line-item-table__index erp-editable-line-group__sequence"
          rowSpan={children && detailsVisible ? 2 : 1}
        >
          <BusinessLineEditorRowControls selection={selection} index={index} identity={detailsIdentity || disclosure?.identity} actions={actions}>
            {collapsibleDetails && children ? (
              <Button
                className="erp-line-editor__details-toggle"
                type="text"
                disabled={false}
                aria-expanded={detailsOpen}
                aria-controls={detailsID}
                aria-label={`${detailsOpen ? '收起' : '展开'}第 ${index + 1} 行${detailsToggleLabel}`}
                onClick={() => setDetailsOpen((current) => !current)}
              >
                <span aria-hidden="true">{detailsOpen ? '⌄' : '›'}</span>
                <span className="erp-editable-line-group__number">{index + 1}</span>
              </Button>
            ) : <span className="erp-editable-line-group__number">{index + 1}</span>}
          </BusinessLineEditorRowControls>
          {errorCount ? <span className="erp-line-item-details__errors" role="status">{errorCount} 项待修改</span> : null}
          {hiddenFields}
        </td>
        {cells.map((cell, cellIndex) => (
          <td className="erp-line-item-table__cell" key={cellIndex}>
            <SelectPresentationContext.Provider value="reference">{cell}</SelectPresentationContext.Provider>
          </td>
        ))}
      </tr>
      {children ? (
        <tr id={detailsID} hidden={!detailsVisible} className="erp-line-item-table__details-row">
          <td colSpan={cells.length} className="erp-line-item-table__more">
            <div className="erp-line-item-supplement">
              <section
                className={`erp-line-item-details${collapsibleDetails ? ' erp-line-item-details--expandable' : ''}`}
                aria-label={detailsLabel}
              >
                {showDetailsHeading || status ? (
                  <div className="erp-line-item-details__heading">
                    {showDetailsHeading ? <span className="erp-line-item-details__label">{detailsLabel}</span> : null}
                    {status ? (
                      <span className="erp-line-item-details__status">
                        {status}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="erp-line-item-details__fields">{children}</div>
              </section>
              {evidence}
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
