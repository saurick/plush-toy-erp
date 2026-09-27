import React from 'react'
import { Form } from 'antd'
import './businessCompactFieldTable.css'

export default function BusinessCompactFieldTable({
  columns,
  label,
  children,
  className = '',
}) {
  return (
    <div className={`erp-compact-field-table ${className}`.trim()}>
      <table aria-label={label}>
        <colgroup>
          {columns.map((column, index) => (
            <col key={index} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
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
    </div>
  )
}

export function BusinessCompactFieldRow({
  cells,
  actions,
  children,
  label,
  className = '',
  rowRef,
}) {
  return (
    <tbody
      className={`erp-compact-field-table__row ${className}`.trim()}
      aria-label={label}
      ref={rowRef}
    >
      <tr className="erp-compact-field-table__fields">
        {cells.map((cell, index) => (
          <td key={index}>{cell}</td>
        ))}
        {actions !== undefined ? (
          <td className="erp-compact-field-table__actions">{actions}</td>
        ) : null}
      </tr>
      {children ? (
        <tr className="erp-compact-field-table__details">
          <td colSpan={cells.length + (actions !== undefined ? 1 : 0)}>
            {children}
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}

export function BusinessOptionalField({ name, label = '备注', children }) {
  const form = Form.useFormInstance()
  const rootValue = Form.useWatch(name[0], { form, preserve: true })
  const value = name.slice(1).reduce((current, key) => current?.[key], rootValue)
  return (
    <details className="erp-optional-field">
      <summary>
        <span>{label}</span>
        {String(value ?? '').trim() ? (
          <span className="erp-optional-field__summary">{String(value)}</span>
        ) : null}
      </summary>
      <div className="erp-optional-field__body">{children}</div>
    </details>
  )
}

export function BusinessLineItemsEmpty({ children }) {
  return (
    <div className="erp-line-items-empty">
      {children || '暂无明细，请添加一行'}
    </div>
  )
}
