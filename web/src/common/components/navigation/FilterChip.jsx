import React from 'react'

// A filter changes the current result set; it is not a tab or a status label.
export default function FilterChip({
  selected = false,
  count,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      className={`erp-filter-chip ${className}`.trim()}
    >
      <span className="erp-filter-chip__label">{children}</span>
      {count !== undefined && (
        <span className="erp-filter-chip__count">{count}</span>
      )}
    </button>
  )
}
