import React from 'react'
import FilterChip from '@/common/components/navigation/FilterChip'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import { businessStatusCount } from '../../utils/businessStatusCounts.mjs'
import './business-status-filter.css'

export default function BusinessStatusFilter({
  value = '',
  options = [],
  counts = null,
  allCount,
  loading = false,
  disabled = false,
  countUnit = '',
  exact = false,
  removable = true,
  allLabel = '不限状态',
  label,
  onChange,
  'aria-label': ariaLabel = label || '业务状态',
}) {
  const statusOptions = options.some((option) => option.value === '')
    ? options
    : [{ value: '', label: allLabel }, ...options]
  const choices = (
    <div
      className="erp-business-status-filters"
      role="group"
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      {statusOptions.map((option) => {
        const count = loading
          ? null
          : option.value === '' && allCount !== undefined
            ? allCount
            : businessStatusCount(counts, option.value)
        const text = option.value === '' ? allLabel : option.label
        const countText = count === null
          ? '—'
          : `${count.toLocaleString('zh-CN')}${countUnit ? ` ${countUnit}` : ''}`
        const countDescription = count === null
          ? '数量暂不可用'
          : `共 ${count} ${countUnit || '条'}`
        return (
          <FilterChip
            key={option.value}
            selected={value === option.value}
            removable={removable && option.value !== ''}
            disabled={disabled || loading || exact || option.disabled}
            count={countText}
            aria-label={`${text}，${countDescription}`}
            title={
              exact
                ? '当前查看指定记录，清除单据范围后可按状态查找'
                : `${text}：当前查询范围内${countDescription}${count === null || countUnit ? '' : '记录'}`
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
  return label ? <FilterField label={label} disabled={disabled || loading || exact}>{choices}</FilterField> : choices
}
