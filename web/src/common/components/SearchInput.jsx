import React, { useId, useState } from 'react'
import { SearchOutlined } from '@ant-design/icons'
import { Input, Popover } from 'antd'

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

export default function SearchInput({
  allowClear = false,
  className = '',
  placeholder = '搜索关键词',
  searchHint,
  showSearchScope = false,
  ...restProps
}) {
  const accessibleLabel = restProps['aria-label'] || searchHint || placeholder
  const title = restProps.title || searchHint || undefined
  const hintID = useId()
  const [focused, setFocused] = useState(false)
  const showHint = Boolean(
    showSearchScope && searchHint && focused && !restProps.disabled
  )

  return (
    <Popover
      open={showHint}
      trigger={[]}
      placement="bottomLeft"
      content={
        <div id={hintID} style={{ maxWidth: 'min(360px, calc(100vw - 48px))' }}>
          {searchHint}
        </div>
      }
    >
      <Input
        {...restProps}
        allowClear={allowClear}
        className={joinClassNames('erp-search-input', className)}
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder={placeholder}
        aria-label={accessibleLabel}
        title={title}
        aria-describedby={showHint
          ? [restProps['aria-describedby'], hintID].filter(Boolean).join(' ')
          : restProps['aria-describedby']}
        onFocus={(event) => {
          setFocused(true)
          restProps.onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          restProps.onBlur?.(event)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setFocused(false)
          restProps.onKeyDown?.(event)
        }}
      />
    </Popover>
  )
}
