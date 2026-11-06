import React from 'react'
import { CloseOutlined } from '@ant-design/icons'

// A filter changes the current result set; it is not a tab or a status label.
export default function FilterChip({
  selected = false,
  removable = false,
  count,
  help,
  helpLabel,
  children,
  className = '',
  ...props
}) {
  const content = (
    <>
      <span className="erp-filter-chip__label">{children}</span>
      {count !== undefined && (
        <span className="erp-filter-chip__count">{count}</span>
      )}
      {selected && removable && <CloseOutlined className="erp-filter-chip__clear" aria-hidden="true" />}
    </>
  )
  if (help) {
    return (
      <fieldset
        className={`erp-filter-chip erp-filter-chip--with-help ${className}`.trim()}
        data-selected={selected}
        disabled={props.disabled}
        aria-label={helpLabel}
      >
        <button
          {...props}
          type="button"
          aria-pressed={selected}
          className="erp-filter-chip__control"
        >
          {content}
        </button>
        <span className="erp-filter-chip__help">{help}</span>
      </fieldset>
    )
  }
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      className={`erp-filter-chip ${className}`.trim()}
    >
      {content}
    </button>
  )
}
