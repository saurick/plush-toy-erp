import React from 'react'
import { Button } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import './businessLineItemCards.css'
import './businessLineItemGroups.css'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import SelectPresentationContext from '@/common/components/select/SelectPresentationContext.jsx'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'
import { useBusinessLineItemGroupErrors } from './useBusinessLineItemGroups.js'

const LineItemCardsContext = React.createContext(null)

export default function BusinessLineItemsTable({
  columns,
  desktopColumns = columns,
  actionsWidth = 160,
  children,
  label = '单据明细',
}) {
  const { taskBusiness } = useBusinessPageContext() || {}
  if (taskBusiness?.device === 'mobile') return <LineItemCardsContext.Provider value={columns}><div className="erp-task-line-cards" role="region" aria-label={label}>{children}</div></LineItemCardsContext.Provider>
  return (
    <TableScrollRegion
      className="erp-sales-order-lines-form__list"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table
        className="erp-line-item-table"
        data-table-lines="appearance"
        style={{
          minWidth: desktopColumns.reduce(
            (total, column) => total + column.width,
            44 + actionsWidth
          ),
        }}
      >
        <colgroup>
          <col style={{ width: 'var(--erp-line-item-sequence-width)' }} />
          {desktopColumns.map((column, index) => (
            <col
              key={index}
              style={column.flexible ? undefined : { width: column.width }}
            />
          ))}
          <col style={{ width: actionsWidth }} />
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
            <th scope="col" className="erp-line-item-table__actions">
              操作
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </TableScrollRegion>
  )
}

export function BusinessLineItemGroupHeading({ children, columnCount, collapsed, onToggle, label, count, countLabel = '条明细', controller, groupId }) {
  const cardColumns = React.useContext(LineItemCardsContext)
  const errors = useBusinessLineItemGroupErrors(controller).get(groupId) || 0
  if (onToggle) {
    const content = (
      <div className={`erp-line-item-disclosure-heading${cardColumns ? '' : ' erp-line-item-identity-group__content'}`}>
        <Button size="small" disabled={false} aria-expanded={!collapsed} aria-label={`${collapsed ? '展开' : '收起'}${label}`} onClick={onToggle}>
          {collapsed ? '展开' : '收起'}
        </Button>
        <div className="erp-line-item-disclosure-heading__title">{children}</div>
        <span className="erp-line-item-identity-group__count">{count} {countLabel}</span>
        {errors ? <span className="erp-line-item-disclosure-heading__errors">{errors} 项待修改</span> : null}
      </div>
    )
    return cardColumns
      ? <div className="erp-line-item-identity-group">{content}</div>
      : <tbody className="erp-line-item-identity-group"><tr><td colSpan={columnCount}>{content}</td></tr></tbody>
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
  showDetailsHeading = true,
  evidence,
}) {
  const cardColumns = React.useContext(LineItemCardsContext)
  const disclosure = useBusinessLineItemDisclosure()
  const [active, setActive] = React.useState(false)
  // React focus events include this row's portals without changing section navigation.
  const focusProps = {
    'data-line-active': active ? 'true' : undefined,
    onFocusCapture: () => { setActive(true); disclosure?.onFocus() },
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(false)
    },
  }
  if (cardColumns) { return (
    <section className="erp-task-line-card erp-editable-line-group" aria-label={`第 ${index + 1} 条明细`} ref={rowRef} hidden={disclosure?.hidden} data-line-item-collapsed={disclosure?.hidden ? 'true' : undefined} data-line-item-index={disclosure?.index} {...focusProps}>
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
      ref={rowRef}
      aria-label={`第 ${index + 1} 条明细`}
      data-line-parity={index % 2 ? 'even' : 'odd'}
      hidden={disclosure?.hidden}
      data-line-item-collapsed={disclosure?.hidden ? 'true' : undefined}
      data-line-item-index={disclosure?.index}
      {...focusProps}
    >
      <tr className="erp-line-item-table__main-row">
        <td
          className="erp-line-item-table__index erp-editable-line-group__sequence"
          rowSpan={children ? 2 : 1}
        >
          <span className="erp-editable-line-group__number">{index + 1}</span>
          {hiddenFields}
        </td>
        {cells.map((cell, cellIndex) => (
          <td className="erp-line-item-table__cell" key={cellIndex}>
            <SelectPresentationContext.Provider value="reference">{cell}</SelectPresentationContext.Provider>
          </td>
        ))}
        <td className="erp-line-item-table__actions">{actions}</td>
      </tr>
      {children ? (
        <tr>
          <td colSpan={cells.length + 1} className="erp-line-item-table__more">
            <div className="erp-line-item-supplement">
              <section
                className="erp-line-item-details"
                aria-label={detailsLabel}
              >
                {showDetailsHeading || status ? (
                  <div className="erp-line-item-details__heading">
                    <span className="erp-line-item-details__label">
                      {detailsLabel}
                    </span>
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
