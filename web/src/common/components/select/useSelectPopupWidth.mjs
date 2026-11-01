import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export function useSelectPopupWidth(selectRef, mode, showSearch, hasIdentity) {
  const [width, setWidth] = useState()
  const measure = useCallback(() => {
    const element = selectRef.current?.nativeElement
    const item = mode ? null : element?.querySelector('.ant-select-selection-item')
    const overflow = item && item.scrollWidth > item.clientWidth + 1
    setWidth(element && (!mode || hasIdentity) && (showSearch || overflow || hasIdentity)
      ? Math.max(element.getBoundingClientRect().width, Math.min(hasIdentity ? 560 : 360, window.innerWidth - 24))
      : undefined)
  }, [selectRef, mode, showSearch, hasIdentity])

  useLayoutEffect(() => { measure() })
  useEffect(() => {
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
  }, [selectRef, mode, hasIdentity, measure])
  return width
}
