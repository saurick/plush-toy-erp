import { useCallback, useLayoutEffect, useState } from 'react'
import { useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'

const DESKTOP_QUERY = 'screen and (min-width: 761px) and (min-height: 501px)'

// The page remains the vertical scroller; Ant Table owns column alignment and
// horizontal header/body synchronization. Dialog and bounded tables stay local.
export default function useBusinessListStickyHeader(cardRef, enabled, toolbarRef) {
  const visible = useOverlayScope()?.visible !== false
  const getContainer = useCallback(
    () => cardRef.current?.closest('.erp-admin-content') || window,
    [cardRef]
  )
  // Establish the header structure once; measuring its offset must not replace
  // the table body and mount every row again on desktop entry.
  const [sticky, setSticky] = useState(() => enabled && typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
    ? { offsetHeader: 0, getContainer }
    : false)

  useLayoutEffect(() => {
    if (!visible) return undefined
    const card = cardRef.current
    const scope = card?.closest('[data-table-scroll-scope]')
    const workspace = scope?.matches('.erp-business-toolbar-workspace') ? scope : null
    const sharedToolbar = workspace && toolbarRef?.current
    const page = sharedToolbar ? workspace : card?.closest('[data-page-table-region], .erp-business-page-layout')
    const toolbar = sharedToolbar || page?.querySelector('[data-page-table-toolbar], :scope > .erp-business-operation-panel')
    const container = page?.closest('.erp-admin-content')
    if (!enabled || !toolbar || !container) {
      setSticky((current) => current === false ? current : false)
      return
    }

    const desktop = window.matchMedia(DESKTOP_QUERY)
    let frame = 0
    const measure = () => {
      frame = 0
      const height = Math.ceil(toolbar.getBoundingClientRect().height)
      const paddingTop = Number.parseFloat(getComputedStyle(container).paddingTop) || 0
      const offsetHeader = height - paddingTop
      // Short windows and unusually tall toolbars must leave room to read rows.
      const active = desktop.matches && height > 0 && container.clientHeight - height >= 240
      if (page.style.getPropertyValue('--erp-list-scroll-padding') !== `${paddingTop}px`) {
        page.style.setProperty('--erp-list-scroll-padding', `${paddingTop}px`)
      }
      setSticky((current) => {
        if (!active) return current === false ? current : false
        return current && current.offsetHeader === offsetHeader && current.getContainer === getContainer
          ? current
          : { offsetHeader, getContainer }
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(toolbar)
    observer.observe(container)
    desktop.addEventListener('change', schedule)
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      desktop.removeEventListener('change', schedule)
      page.style.removeProperty('--erp-list-scroll-padding')
    }
  }, [cardRef, enabled, toolbarRef, getContainer, visible])

  return sticky
}
