import React, { useState } from 'react'
import { flushSync } from 'react-dom'
import { Input } from 'antd'
import { formatBOMSourceNumber } from '../../utils/bomSourceValues.mjs'
import './bomSourceValue.css'

export function BOMQuantityInput({ value, onChange, source, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      {...props}
      value={!focused ? formatBOMSourceNumber(value, source?.quantity_format) || value : value}
      onFocus={(event) => {
        // Select the complete decimal before the first edit can replace it.
        flushSync(() => setFocused(true))
        event.target.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}
