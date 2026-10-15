import React, { forwardRef, useCallback, useState } from 'react'
import { Segmented } from 'antd'
import useSlidingIndicator from './useSlidingIndicator'

const optionValue = (option) =>
  typeof option === 'object' && option !== null ? option.value : option

const SlidingSegmented = forwardRef(
  (
    {
      options = [],
      value,
      defaultValue,
      onChange,
      className = '',
      style,
      ...props
    },
    forwardedRef
  ) => {
    const [localValue, setLocalValue] = useState(() =>
      defaultValue !== undefined ? defaultValue : optionValue(options[0])
    )
    const selectedValue = value !== undefined ? value : localValue
    const rootRef = useSlidingIndicator({
      containerSelector: '.ant-segmented-group',
      itemSelector: '.ant-segmented-item',
      selectedSelector: '.erp-segmented-item-selected',
    })
    const setRef = useCallback(
      (node) => {
        rootRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef, rootRef]
    )

    return (
      <Segmented
        {...props}
        ref={setRef}
        className={`erp-sliding-segmented ${className}`}
        style={style}
        options={options.map((option) => {
          const normalized =
            typeof option === 'object' && option !== null
              ? option
              : { value: option, label: String(option) }
          return {
            ...normalized,
            className: [
              normalized.className,
              // Ant drops its selected class while its temporary thumb moves.
              // Keep checked styling stable for our persistent indicator.
              normalized.value === selectedValue
                ? 'ant-segmented-item-selected erp-segmented-item-selected'
                : '',
            ]
              .filter(Boolean)
              .join(' '),
          }
        })}
        value={selectedValue}
        onChange={(nextValue) => {
          if (value === undefined) setLocalValue(nextValue)
          onChange?.(nextValue)
        }}
      />
    )
  }
)

SlidingSegmented.displayName = 'SlidingSegmented'

export default SlidingSegmented
