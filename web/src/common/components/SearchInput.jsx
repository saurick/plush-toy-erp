import React from 'react'
import { SearchOutlined } from '@ant-design/icons'
import { Input } from 'antd'

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

export default function SearchInput({
  allowClear = false,
  className = '',
  placeholder = '搜索关键词',
  searchHint,
  ...restProps
}) {
  const accessibleLabel = restProps['aria-label'] || searchHint || placeholder
  const title = restProps.title || searchHint || undefined

  return (
    <Input
      {...restProps}
      allowClear={allowClear}
      className={joinClassNames('erp-search-input', className)}
      prefix={<SearchOutlined aria-hidden="true" />}
      placeholder={placeholder}
      aria-label={accessibleLabel}
      title={title}
    />
  )
}
