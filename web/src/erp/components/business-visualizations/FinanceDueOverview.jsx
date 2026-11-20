import React from 'react'
import { operationalFactStatusText } from '../operational-facts/OperationalFactForms.jsx'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { VisualizationStatus } from './BusinessVisualizationFrame.jsx'

export function FinanceDueQuickFilters({ options, value, onChange, disabled, statusLabel, onClearStatus }) {
  return (
    <>
      <FilterChipGroup
        aria-label="到期情况"
        options={options.filter((option) => !option.additional || option.value === value)}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {statusLabel && (
        <FilterChip selected removable aria-label={`清除单据状态：${statusLabel}`} onClick={onClearStatus}>
          单据状态：{statusLabel}
        </FilterChip>
      )}
    </>
  )
}

const dueColumnPriority = {
  counterparty: 1,
  outstanding_amount: 2,
  currency: 3,
  due_at: 4,
  fact_no: 6,
  amount: 7,
}

export function financeDueColumns(columns) {
  return [
    ...columns.map((column) => ({
      ...column,
      ...(column.dataIndex === 'status' ? { render: operationalFactStatusText, defaultHidden: true } : {}),
      ...(column.key === 'cancellation' ? { defaultHidden: true } : {}),
      defaultPriority: dueColumnPriority[column.dataIndex || column.key] ?? column.defaultPriority,
      // 到期优先级作用于全部结果，分页后保持同一顺序。
      sorter: undefined,
    })),
    {
      title: '到期情况',
      dataIndex: 'dueStatus',
      defaultPriority: 5,
      width: 140,
      render: (status) => status ? <VisualizationStatus status={status} /> : '—',
      exportValue: (record) => record.dueStatus?.label || '',
    },
  ]
}

export function financeDueRowProps(record, onOpen) {
  return {
    tabIndex: 0,
    title: '查看账款详情',
    onClick: () => onOpen(record),
    onKeyDown: (event) => {
      if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
        event.preventDefault()
        onOpen(record)
      }
    },
  }
}
