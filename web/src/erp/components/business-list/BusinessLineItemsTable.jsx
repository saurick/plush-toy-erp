/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The shared wide table region supports keyboard scrolling. */
import React from 'react'

export default function BusinessLineItemsTable({
  columns,
  children,
  label = '单据明细',
}) {
  return (
    <div
      className="erp-sales-order-lines-form__list"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table
        className="erp-line-item-table"
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
            <col key={index} style={{ width: column.width }} />
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
    </div>
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
}) {
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
            <details className="erp-line-item-details">
              <summary>
                补充信息
                {status ? (
                  <span className="erp-line-item-details__status">
                    {status}
                  </span>
                ) : null}
              </summary>
              <div className="erp-line-item-details__fields">{children}</div>
            </details>
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
