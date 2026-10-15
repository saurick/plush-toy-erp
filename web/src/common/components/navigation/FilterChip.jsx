import React from 'react'
import { CloseOutlined } from '@ant-design/icons'

// A filter changes the current result set; it is not a tab or a status label.
export default function FilterChip({
  selected = false,
  removable = false,
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
      {selected && removable && <CloseOutlined className="erp-filter-chip__clear" aria-hidden="true" />}
    </button>
  )
}
