import React from 'react'
import { Select } from 'antd'
import FilterChip from '@/common/components/navigation/FilterChip'
import { businessStatusCount } from '../../utils/businessStatusCounts.mjs'
import './business-status-filter.css'

export default function BusinessStatusFilter({
  value = '',
  options = [],
  counts = null,
  loading = false,
  exact = false,
  removable = false,
  inline = false,
  allLabel = '不限状态',
  onChange,
  'aria-label': label = '业务状态',
}) {
  const statusOptions = options.some((option) => option.value === '')
    ? options
    : [{ value: '', label: allLabel }, ...options]
  // Long desktop queues share the command row with search and page actions.
  // Task/mobile filters keep their direct choices and touch targets.
  if (inline && statusOptions.length > 3) {
    return (
      <div className="erp-business-status-filter-compact-wrap" role="group" aria-label={label} aria-busy={loading}>
        <Select
          className="erp-business-status-filter--compact"
          aria-label={label}
          aria-busy={loading}
          value={value}
          loading={loading}
          disabled={loading || exact}
          title={exact ? '当前查看指定记录，清空筛选后可按状态查找' : undefined}
          options={statusOptions.map((option) => {
            const count = loading ? null : businessStatusCount(counts, option.value)
            const text = option.value === '' ? allLabel : option.label
            return { ...option, label: `${text} ${count === null ? '—' : count.toLocaleString('zh-CN')}` }
          })}
          onChange={onChange}
        />
      </div>
    )
  }
  return (
    <div
      className="erp-business-status-filters"
      role="group"
      aria-label={label}
      aria-busy={loading}
    >
      {statusOptions.map((option) => {
        const count = loading ? null : businessStatusCount(counts, option.value)
        const text = option.value === '' ? allLabel : option.label
        const countText = count === null ? '—' : count.toLocaleString('zh-CN')
        return (
          <FilterChip
            key={option.value}
            selected={value === option.value}
            removable={removable && option.value !== ''}
            disabled={loading || exact || option.disabled}
            count={countText}
            aria-label={`${text}，${count === null ? '数量暂不可用' : `共 ${count} 条`}`}
            title={
              exact
                ? '当前查看指定记录，清空筛选后可按状态查找'
                : `${text}：当前查询范围内${count === null ? '数量暂不可用' : `共 ${count} 条记录`}`
            }
            onClick={() => {
              if (removable && value === option.value && option.value !== '') {
                onChange?.('')
              } else if (value !== option.value) onChange?.(option.value)
            }}
          >
            {text}
          </FilterChip>
        )
      })}
    </div>
  )
}
