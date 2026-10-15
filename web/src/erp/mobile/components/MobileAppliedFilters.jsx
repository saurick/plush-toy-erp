import React from 'react'
import FilterChip from '@/common/components/navigation/FilterChip'
import './mobileFilterPopover.css'

export default function MobileAppliedFilters({ label = '当前筛选', items = [], onClear }) {
  const selected = items.filter(Boolean)
  if (!selected.length) return null
  return (
    <div className="mobile-applied-filters" role="group" aria-label={label}>
      {selected.map(({ key, label: text }) => (
        <FilterChip
          key={key}
          selected
          removable
          aria-label={`清除${text}`}
          onClick={() => onClear(key)}
        >
          {text}
        </FilterChip>
      ))}
    </div>
  )
}
