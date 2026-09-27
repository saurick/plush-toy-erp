import React from 'react'
import FilterChip from '@/common/components/navigation/FilterChip'
import { businessStatusCount } from '../../utils/businessStatusCounts.mjs'
import './business-status-filter.css'

export default function BusinessStatusFilter({
  value = '',
  options = [],
  counts = null,
  loading = false,
  exact = false,
  onChange,
  'aria-label': label = '业务状态',
}) {
  const statusOptions = options.some((option) => option.value === '')
    ? options
    : [{ value: '', label: '全部' }, ...options]
  return (
    <div
      className="erp-business-status-filters"
      role="group"
      aria-label={label}
      aria-busy={loading}
    >
      {statusOptions.map((option) => {
        const count = loading ? null : businessStatusCount(counts, option.value)
        const text = option.value === '' ? '全部' : option.label
        const countText = count === null ? '—' : count.toLocaleString('zh-CN')
        return (
          <FilterChip
            key={option.value}
            selected={value === option.value}
            disabled={loading || exact || option.disabled}
            count={countText}
            aria-label={`${text}，${count === null ? '数量暂不可用' : `共 ${count} 条`}`}
            title={
              exact
                ? '当前查看指定记录，清空筛选后可按状态查找'
                : `${text}：当前查询范围内${count === null ? '数量暂不可用' : `共 ${count} 条记录`}`
            }
            onClick={() => {
              if (value !== option.value) onChange?.(option.value)
            }}
          >
            {text}
          </FilterChip>
        )
      })}
    </div>
  )
}
