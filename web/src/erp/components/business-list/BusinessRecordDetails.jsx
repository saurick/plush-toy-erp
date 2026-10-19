import React from 'react'
import { Descriptions } from 'antd'
import { DownOutlined } from '@ant-design/icons'
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

export default function BusinessRecordDetails({ columns = [], record, column = { xs: 1, sm: 2, lg: 3 }, presentation = 'desktop' }) {
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
          return {
            key,
            label,
            empty: value === '-' && !copyText,
            wide: Boolean(copyText) || (typeof value === 'string' && value.length > 24),
            children: copyText ? (
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
    const empty = items.filter((item) => item.empty)
    const fields = (rows) => <dl className="mobile-task-facts__grid">{rows.map((item) => <div key={item.key} className={item.wide ? 'mobile-task-facts__field mobile-task-facts__field--wide' : 'mobile-task-facts__field'}><dt>{item.label}</dt><dd>{item.children}</dd></div>)}</dl>
    return <section className="mobile-task-facts" aria-label="本次业务资料"><h3>本次业务资料</h3>{fields(populated)}{empty.length ? <details className="mobile-task-facts__empty"><summary>未填写信息（{empty.length} 项）<DownOutlined aria-hidden="true" /></summary>{fields(empty)}</details> : null}</section>
  }

  return <Descriptions bordered column={column} size="small" items={items.map(({ key, label, children }) => ({ key, label, children }))} />
}
