import React from 'react'
import { Descriptions } from 'antd'
import { resolveBusinessDetailCopyText, resolveBusinessTableCopyLabel } from '../../utils/businessTableCopy.mjs'
import { getColumnLabel } from './ColumnOrderModal.jsx'
import BusinessCopyButton from './BusinessCopyButton.jsx'
import { visibleDetailValue } from './BusinessRowItemCards.jsx'

function readDataIndex(record, dataIndex) {
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((current, key) => current?.[key], record)
  }
  if (typeof dataIndex === 'string' && dataIndex.includes('.')) {
    return dataIndex.split('.').reduce((current, key) => current?.[key], record)
  }
  return dataIndex ? record?.[dataIndex] : undefined
}

function detailValue(column, record) {
  if (typeof column.detailValue === 'function') {
    return column.detailValue(record)
  }
  if (typeof column.exportValue === 'function') {
    return column.exportValue(record)
  }
  const rawValue = readDataIndex(record, column.dataIndex)
  if (typeof column.render === 'function') {
    return column.render(rawValue, record)
  }
  return rawValue
}

export default function BusinessRecordDetails({ columns = [], record, column = { xs: 1, sm: 2, lg: 3 }, presentation = 'desktop', title = '本次业务资料' }) {
  const detailColumns = columns.filter(
    (column) =>
      column &&
      column.hidden !== true &&
      column.hiddenByEffectiveFieldPolicy !== true &&
      column.detailHidden !== true &&
      getColumnLabel(column)
  )

  const items = detailColumns.map((column, index) => {
          const columnLabel = getColumnLabel(column)
          const label = column.detailLabel?.(record) || columnLabel
          const key =
            column.key ||
            (Array.isArray(column.dataIndex)
              ? column.dataIndex.join('.')
              : column.dataIndex) ||
            `${columnLabel}-${index}`
          const value = visibleDetailValue(detailValue(column, record || {}))
          const copyText = resolveBusinessDetailCopyText(column, record)
          const empty = value === '-' && !copyText
          const emptyValue = presentation === 'mobile-task'
            ? column.taskDetailEmptyValue?.(record || {})
            : null
          return {
            key,
            label,
            empty: empty && !emptyValue?.text,
            role: ['identity', 'status', 'media'].includes(column.taskDetailRole) ? column.taskDetailRole : 'field',
            order: column.taskDetailOrder ?? 100 + index,
            wide: Boolean(emptyValue?.reason) || copyText.length > 24 || (typeof value === 'string' && value.length > 24),
            children: emptyValue?.text ? (
              <>
                <span className="mobile-task-facts__status" data-missing-tone={emptyValue.tone === 'warning' ? 'warning' : 'neutral'}>{emptyValue.text}</span>
                {emptyValue.reason ? <p className="mobile-task-facts__note">{emptyValue.reason}</p> : null}
              </>
            ) : copyText ? (
              <span className="erp-business-details-modal__copy-value">
                <span className="erp-business-details-modal__copy-text">{value}</span>
                <BusinessCopyButton
                  label={resolveBusinessTableCopyLabel(column, record)}
                  value={copyText}
                />
              </span>
            ) : (
              value
            ),
          }
        })

  if (presentation === 'mobile-task') {
    const populated = items.filter((item) => !item.empty).sort((left, right) => left.order - right.order)
    const fields = (rows, className, hideLabels = false) => rows.length ? (
      <dl className={className}>
        {rows.map((item) => (
          <div key={item.key} data-field-key={item.key} className={item.wide ? 'mobile-task-facts__field mobile-task-facts__field--wide' : 'mobile-task-facts__field'}>
            <dt className={hideLabels ? 'erp-sr-only' : undefined}>{item.label}</dt>
            <dd>{item.children}</dd>
          </div>
        ))}
      </dl>
    ) : null
    return (
      <section className="mobile-task-facts" data-layout="compact" aria-label={title}>
        <div className="mobile-task-facts__heading">
          <h3>{title}</h3>
          {fields(populated.filter((item) => item.role === 'status'), 'mobile-task-facts__state', true)}
        </div>
        {fields(populated.filter((item) => item.role === 'identity'), 'mobile-task-facts__identity')}
        {fields(populated.filter((item) => item.role === 'field'), 'mobile-task-facts__grid')}
        {fields(populated.filter((item) => item.role === 'media'), 'mobile-task-facts__media')}
      </section>
    )
  }

  return <Descriptions bordered column={column} size="small" items={items.map(({ key, label, children }) => ({ key, label, children }))} />
}
