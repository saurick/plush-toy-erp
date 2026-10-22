import { useLayoutEffect, useState } from 'react'

// The page remains the vertical scroller; Ant Table owns column alignment and
// horizontal header/body synchronization. Dialog and bounded tables stay local.
export default function useBusinessListStickyHeader(cardRef, enabled) {
  const [sticky, setSticky] = useState(false)

  useLayoutEffect(() => {
    const card = cardRef.current
    const page = card?.closest('[data-page-table-region], .erp-business-page-layout')
    const toolbar = page?.querySelector('[data-page-table-toolbar], :scope > .erp-business-operation-panel')
    const container = page?.closest('.erp-admin-content')
    if (!enabled || !toolbar || !container) {
      setSticky((current) => current === false ? current : false)
      return
    }

    const desktop = window.matchMedia('screen and (min-width: 761px) and (min-height: 501px)')
    const getContainer = () => container
    const measure = () => {
      const height = Math.ceil(toolbar.getBoundingClientRect().height)
      const paddingTop = Number.parseFloat(getComputedStyle(container).paddingTop) || 0
      const offsetHeader = height - paddingTop
      page.style.setProperty('--erp-list-scroll-padding', `${paddingTop}px`)
      // Short windows and unusually tall toolbars must leave room to read rows.
      const active = desktop.matches && height > 0 && container.clientHeight - height >= 240
      setSticky((current) => {
        if (!active) return current === false ? current : false
        return current && current.offsetHeader === offsetHeader && current.getContainer === getContainer
          ? current
          : { offsetHeader, getContainer }
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(toolbar)
    observer.observe(container)
    desktop.addEventListener('change', measure)
    measure()
    return () => {
      observer.disconnect()
      desktop.removeEventListener('change', measure)
      page.style.removeProperty('--erp-list-scroll-padding')
    }
  }, [cardRef, enabled])

  return sticky
}
