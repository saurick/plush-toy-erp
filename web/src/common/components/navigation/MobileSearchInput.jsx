import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import SearchInput from '@/common/components/SearchInput'

export default function MobileSearchInput({
  className = '',
  resetKey,
  ...props
}) {
  const root = useRef(null)
  const input = useRef(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    setExpanded(false)
  }, [resetKey])
  useLayoutEffect(() => {
    const element = root.current
    const row = element?.closest('.erp-mobile-search-row') || element
    if (!row) return undefined
    const measure = () => {
      const width = Math.max(
        element.clientWidth,
        row.getBoundingClientRect().right - element.getBoundingClientRect().left
      )
      const nextWidth = `${width}px`
      if (
        element.style.getPropertyValue('--mobile-search-expanded-width') !==
        nextWidth
      ) {
        element.style.setProperty('--mobile-search-expanded-width', nextWidth)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const collapse = () => {
    setExpanded(false)
    input.current?.blur()
  }
  return (
    <div
      ref={root}
      className={`erp-mobile-search${expanded ? ' erp-mobile-search--expanded' : ''} ${className}`.trim()}
    >
      <SearchInput
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={100}
        {...props}
        ref={input}
        resetKey={resetKey}
        className="erp-mobile-search__control"
        allowClear
        showCancel={expanded}
        onFocus={(event) => {
          setExpanded(true)
          props.onFocus?.(event)
        }}
        onSubmitted={collapse}
        onCancel={collapse}
      />
    </div>
  )
}
