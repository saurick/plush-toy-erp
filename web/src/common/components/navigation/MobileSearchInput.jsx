import React, { useRef } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import SearchInput from '@/common/components/SearchInput'

// Consumers keep their own query lifecycle; this component owns the touch control.
export default function MobileSearchInput({
  value,
  onClear,
  clearVisible = Boolean(value),
  className = '',
  disabled = false,
  ...props
}) {
  const root = useRef(null)
  return (
    <div ref={root} className={`erp-mobile-search ${className}`.trim()}>
      <SearchInput
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={100}
        {...props}
        value={value}
        disabled={disabled}
        allowClear={false}
        suffix={
          clearVisible ? (
            <button
              type="button"
              className="erp-mobile-search__clear"
              aria-label="清除搜索"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onClear()
                root.current?.querySelector('input')?.focus()
              }}
            >
              <CloseOutlined aria-hidden="true" />
            </button>
          ) : null
        }
      />
    </div>
  )
}
