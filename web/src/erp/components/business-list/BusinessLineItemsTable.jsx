import React from 'react'
import { Form } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import './businessLineItemCards.css'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'

const LineItemCardsContext = React.createContext(null)

function LineItemSummary({ name, fields }) {
  const form = Form.useFormInstance()
  const values = Form.useWatch(name[0], { form, preserve: true })
  const row = name.slice(1).reduce((value, key) => value?.[key], values)
  const text = fields
    .map(({ key, label, options }) => {
      const value = row?.[key]
      const display = options
        ? options.find((option) => String(option.value) === String(value))
            ?.label
        : value
      return String(display ?? '').trim() ? `${label}：${display}` : ''
    })
    .filter(Boolean)
    .join('；')
  return text ? (
    <span className="erp-line-item-details__summary">{text}</span>
  ) : null
}

export default function BusinessLineItemsTable({
  columns,
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
          minWidth: columns.reduce(
            (total, column) => total + column.width,
            200
          ),
        }}
      >
        <colgroup>
          <col style={{ width: 40 }} />
          {columns.map((column, index) => (
            <col
              key={index}
              style={column.flexible ? undefined : { width: column.width }}
            />
          ))}
          <col style={{ width: 160 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">序号</th>
            {columns.map((column, index) => (
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

export function BusinessLineItemRow({
  index,
  cells,
  actions,
  hiddenFields,
  children,
  rowRef,
  status,
  detailsOpen = false,
  detailsLabel = '补充信息',
  name = ['items', index],
  summaryFields = [],
  evidence,
}) {
  const cardColumns = React.useContext(LineItemCardsContext)
  if (cardColumns) { return (
    <details className="erp-task-line-card erp-line-item-details" open={index === 0 || detailsOpen || undefined} ref={rowRef}>
      <summary><strong>第 {index + 1} 条明细</strong>{summaryFields.length ? <LineItemSummary name={name} fields={summaryFields} /> : null}{status}</summary>
      <div className="erp-task-line-card__fields">
        {hiddenFields}
        {cells.map((cell, cellIndex) => <div className="erp-task-line-card__field" key={cellIndex}><div className="erp-task-line-card__label">{cardColumns[cellIndex]?.label}{cardColumns[cellIndex]?.required ? <span aria-label="必填"> *</span> : null}</div>{cell}</div>)}
        {children ? <details className="erp-line-item-details" open={detailsOpen || undefined}><summary>{detailsLabel}</summary><div className="erp-line-item-details__fields">{children}</div></details> : null}
        {evidence}
        {actions ? <div className="erp-task-line-card__actions">{actions}</div> : null}
      </div>
    </details>
  ) }
  return (
    <tbody
      className="erp-sales-order-lines-form__row"
      ref={rowRef}
      aria-label={`第 ${index + 1} 条明细`}
    >
      <tr className="erp-line-item-table__main-row">
        <td className="erp-line-item-table__index">
          {index + 1}
          {hiddenFields}
        </td>
        {cells.map((cell, cellIndex) => (
          <td className="erp-line-item-table__cell" key={cellIndex}>
            {cell}
          </td>
        ))}
        <td className="erp-line-item-table__actions">{actions}</td>
      </tr>
      {children ? (
        <tr>
          <td colSpan={cells.length + 2} className="erp-line-item-table__more">
            <div className="erp-line-item-supplement">
              <details
                className="erp-line-item-details"
                open={detailsOpen || undefined}
              >
                <summary>
                  <span className="erp-line-item-details__label">
                    {detailsLabel}
                  </span>
                  {summaryFields.length ? (
                    <LineItemSummary name={name} fields={summaryFields} />
                  ) : null}
                  {status ? (
                    <span className="erp-line-item-details__status">
                      {status}
                    </span>
                  ) : null}
                </summary>
                <div className="erp-line-item-details__fields">{children}</div>
              </details>
              {evidence}
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
