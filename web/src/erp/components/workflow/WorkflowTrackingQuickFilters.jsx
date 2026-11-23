import React from 'react'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { TRACKING_ATTENTION_OPTIONS, TRACKING_SCOPE_OPTIONS } from '../../utils/workflowTrackingFilters.mjs'

export function WorkflowTrackingScopeFilter({ value, onChange }) {
  return <FilterChipGroup aria-label="跟踪范围" value={value} options={TRACKING_SCOPE_OPTIONS} onChange={onChange} />
}

export function WorkflowTrackingAttentionFilter({ value, onChange, disabled }) {
  return (
    <div className="erp-filter-chip-group" role="group" aria-label="关注事项">
      {TRACKING_ATTENTION_OPTIONS.map(({ value: option, label }) => (
        <FilterChip
          key={option}
          selected={value === option}
          removable
          disabled={disabled}
          onClick={() => onChange(value === option ? '' : option)}
        >
          {label}
        </FilterChip>
      ))}
    </div>
  )
}
