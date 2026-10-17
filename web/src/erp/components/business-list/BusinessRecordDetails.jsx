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

export default function BusinessRecordDetails({ columns = [], record, column = { xs: 1, sm: 2, lg: 3 } }) {
  const detailColumns = columns.filter(
    (column) =>
      column &&
      column.hidden !== true &&
      column.hiddenByEffectiveFieldPolicy !== true &&
      column.detailHidden !== true &&
      getColumnLabel(column)
  )

  return (
    <Descriptions
      bordered
      column={column}
      size="small"
      items={detailColumns.map((column, index) => {
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
        })}
    />
  )
}
