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
          const label = getColumnLabel(column)
          const key =
            column.key ||
            (Array.isArray(column.dataIndex)
              ? column.dataIndex.join('.')
              : column.dataIndex) ||
            `${label}-${index}`
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
            wide: Boolean(copyText) || Boolean(emptyValue?.text) || (typeof value === 'string' && value.length > 24),
            children: emptyValue?.text ? (
              <>
                <span className="mobile-task-facts__status" data-missing-tone={emptyValue.tone === 'warning' ? 'warning' : 'neutral'}>{emptyValue.text}</span>
                {emptyValue.reason ? <p className="mobile-task-facts__note">{emptyValue.reason}</p> : null}
              </>
            ) : copyText ? (
              <span className="erp-business-details-modal__copy-value">
                <span className="erp-business-details-modal__copy-text">{value}</span>
                <BusinessCopyButton
                  label={resolveBusinessTableCopyLabel(column)}
                  value={copyText}
                />
              </span>
            ) : (
              value
            ),
          }
        })

  if (presentation === 'mobile-task') {
    const populated = items.filter((item) => !item.empty)
    const fields = (rows) => <dl className="mobile-task-facts__grid">{rows.map((item) => <div key={item.key} className={item.wide ? 'mobile-task-facts__field mobile-task-facts__field--wide' : 'mobile-task-facts__field'}><dt>{item.label}</dt><dd>{item.children}</dd></div>)}</dl>
    return <section className="mobile-task-facts" aria-label={title}><h3>{title}</h3>{fields(populated)}</section>
  }

  return <Descriptions bordered column={column} size="small" items={items.map(({ key, label, children }) => ({ key, label, children }))} />
}
