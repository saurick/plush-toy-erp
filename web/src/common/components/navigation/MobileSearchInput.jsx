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
  // 将展开状态限制在所属搜索栏，避免长单据输入时重算整页后代样式。
  useLayoutEffect(() => {
    const element = root.current
    const row = element?.closest('.erp-mobile-search-row')
    const holder = row && [...row.children].find((child) => child.contains(element))
    if (!holder) return undefined
    row.dataset.mobileSearchExpanded = String(expanded)
    holder.dataset.mobileSearchActive = String(expanded)
    return () => {
      delete row.dataset.mobileSearchExpanded
      delete holder.dataset.mobileSearchActive
    }
  }, [expanded])
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
