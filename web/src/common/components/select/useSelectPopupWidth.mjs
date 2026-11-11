import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

const REFERENCE_WIDTH = 560

function measureOptionWidth(element, options, fieldNames, withIcon, emptyLabel) {
  const context = element.ownerDocument.createElement('canvas').getContext('2d')
  if (!context) return 0
  const style = getComputedStyle(element)
  // Measure the widest possible weight so selecting an option never requires a wider menu.
  context.font = `600 ${style.fontSize} ${style.fontFamily}`
  const pixels = (name) => Number.parseFloat(style.getPropertyValue(name)) || 0
  const outerPadding = 2 * pixels('--erp-menu-padding')
  const optionPadding = pixels('--erp-menu-option-padding')
  const groupedPadding = pixels('--erp-select-grouped-option-padding')
  const iconWidth = withIcon ? Number.parseFloat(style.fontSize) + 8 : 0
  const { label = 'label', value = 'value', options: children = 'options', groupLabel = label } = fieldNames || {}
  let width = 0
  function include(text, padding) {
    if (text == null) return true
    if (typeof text !== 'string' && typeof text !== 'number') return false
    const measured = context.measureText(String(text).trim().replace(/\s+/gu, ' ')).width
    width = Math.max(width, measured + padding + outerPadding)
    return true
  }
  function visit(rows, grouped = false) {
    for (const option of rows) {
      if (option[children]) {
        if (!include(option[groupLabel] ?? option.key, optionPadding * 2) || !visit(option[children], true)) return false
      } else {
        const text = typeof option[label] === 'number' ? option[label] : option[label] || option[value]
        if (!include(text, optionPadding + (grouped ? groupedPadding : optionPadding) + iconWidth)) return false
      }
      if (width >= REFERENCE_WIDTH) break
    }
    return true
  }
  const measurable = options.length ? visit(options) : include(emptyLabel, 24)
  return measurable ? Math.ceil(width) + 2 : undefined
}

export function useSelectPopupWidth(selectRef, {
  open, mode, showSearch, hasIdentity, remote, textOptions, fieldNames, withIcon, emptyLabel,
}) {
  const [width, setWidth] = useState()
  const measure = useCallback(() => {
    const element = selectRef.current?.nativeElement
    if (!element || (mode && !hasIdentity)) return
    let preferred = textOptions && measureOptionWidth(element, textOptions, fieldNames, withIcon, emptyLabel)
    if (preferred === undefined) {
      const item = mode ? null : element.querySelector('.ant-select-selection-item')
      const overflow = item && item.scrollWidth > item.clientWidth + 1
      if (remote || hasIdentity) preferred = REFERENCE_WIDTH
      else if (showSearch || overflow) preferred = 360
    }
    setWidth(preferred === undefined ? undefined : Math.min(
      Math.max(element.offsetWidth, Math.min(preferred, REFERENCE_WIDTH)),
      window.innerWidth - 24,
    ))
  }, [selectRef, mode, showSearch, hasIdentity, remote, textOptions, fieldNames, withIcon, emptyLabel])

  useLayoutEffect(() => { if (open) measure() }, [open, measure])
  useEffect(() => {
    if (!open) return undefined
    const element = selectRef.current?.nativeElement
    if (!element || (mode && !hasIdentity)) return undefined
    let frame
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [selectRef, mode, hasIdentity, measure, open])
  return width
}
