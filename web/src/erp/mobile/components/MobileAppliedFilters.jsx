import React, { useLayoutEffect, useState } from 'react'
import FilterChip from '@/common/components/navigation/FilterChip'
import './mobileFilterPopover.css'

export default function MobileAppliedFilters({
  label = '当前筛选',
  items = [],
  onClear,
  triggerRef,
}) {
  const [focusRevision, setFocusRevision] = useState(0)
  useLayoutEffect(() => {
    if (focusRevision) triggerRef?.current?.focus({ preventScroll: true })
  }, [focusRevision, triggerRef])
  const selected = items.filter(Boolean)
  if (!selected.length) return null
  const clear = (action) => {
    action()
    setFocusRevision((value) => value + 1)
  }
  return (
    <div className="mobile-applied-filters" role="group" aria-label={label}>
      {selected.map(({ key, label: text }) => (
        <FilterChip
          key={key}
          selected
          removable
          aria-label={`清除${text}`}
          onClick={() => clear(() => onClear(key))}
        >
          {text}
        </FilterChip>
      ))}
    </div>
  )
}
