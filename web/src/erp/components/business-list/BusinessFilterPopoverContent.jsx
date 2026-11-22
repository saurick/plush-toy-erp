import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, theme } from 'antd'
import { RollbackOutlined } from '@ant-design/icons'
import { canRestoreOverlayFocus, hasVisibleOverlayPopup, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { BusinessFilterPanelContext } from './BusinessFilterPanelContext.mjs'

export function useFilterPopoverMaxHeight(open, triggerRef) {
  const overlay = useOverlayScope()
  const pane = overlay?.enabled ? overlay.host : null
  const { token } = theme.useToken()
  const popupSpacing = token.paddingSM * 2 + token.marginXXS + token.sizePopupArrow / 2 + token.marginXS
  const [maxHeight, setMaxHeight] = useState()

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    if (!open || !trigger) return undefined
    const fitHeight = () => {
      const anchor = trigger.getBoundingClientRect()
      const bounds = pane?.getBoundingClientRect()
      const top = Math.max(0, bounds?.top ?? 0)
      const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight)
      setMaxHeight(Math.max(120, Math.floor(Math.max(anchor.top - top, bottom - anchor.bottom) - popupSpacing)))
    }
    fitHeight()
    const observer = new ResizeObserver(fitHeight)
    observer.observe(trigger)
    if (pane) observer.observe(pane)
    window.addEventListener('resize', fitHeight)
    window.addEventListener('scroll', fitHeight, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fitHeight)
      window.removeEventListener('scroll', fitHeight, true)
    }
  }, [open, pane, popupSpacing, triggerRef])

  return maxHeight
}

export function handleFilterPanelTab(event) {
  if (event.key !== 'Tab') return
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
    .filter((node) => !node.closest('[hidden]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

export default function BusinessFilterPopoverContent({ open, id, panelRef, triggerRef, label = '筛选条件', onClear, clearDisabled, onDismiss, children }) {
  const fieldsRef = useRef(null)
  const overlay = useOverlayScope()
  const maxHeight = useFilterPopoverMaxHeight(open, triggerRef)
  const [detail, setDetail] = useState(null)
  const returnFocus = useRef(null)
  const activeDetail = open ? detail : null
  const openDetail = useCallback((key, title, trigger) => setDetail({ key, title, trigger, scrollTop: fieldsRef.current.scrollTop }), [])
  const closeDetail = useCallback(() => {
    returnFocus.current = activeDetail
    setDetail(null)
  }, [activeDetail])
  const context = useMemo(() => ({ detail: activeDetail, openDetail, closeDetail, panelRef }), [activeDetail, openDetail, closeDetail, panelRef])

  useLayoutEffect(() => {
    if (!open) {
      if (detail) setDetail(null)
      returnFocus.current = null
    } else if (detail) {
      panelRef.current.scrollTop = 0
      panelRef.current.focus({ preventScroll: true })
    } else if (returnFocus.current) {
      const { scrollTop, trigger } = returnFocus.current
      returnFocus.current = null
      fieldsRef.current.scrollTop = scrollTop
      if (canRestoreOverlayFocus(overlay)) trigger.focus({ preventScroll: true })
    }
  }, [detail, open, overlay, panelRef])

  return (
    <section
      id={id}
      ref={panelRef}
      className={`erp-business-filter-popover__content${activeDetail ? ' erp-business-filter-popover__content--date' : ''}`}
      style={{ '--erp-filter-available-height': maxHeight && `${maxHeight}px` }}
      aria-label={activeDetail?.title || label}
      role="dialog"
      tabIndex={-1}
      onKeyDownCapture={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || hasVisibleOverlayPopup(overlay)) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (activeDetail) closeDetail()
          else onDismiss()
          return
        }
        handleFilterPanelTab(event)
      }}
    >
      <BusinessFilterPanelContext.Provider value={context}>
        <div className="erp-business-filter-popover__overview" hidden={Boolean(activeDetail)}>
          <header>
            <strong>筛选条件</strong>
            {onClear ? (
              <Button
                aria-label="清空筛选"
                size="small"
                type="text"
                disabled={clearDisabled}
                icon={<RollbackOutlined aria-hidden />}
                onClick={() => {
                  onClear()
                  panelRef.current.focus({ preventScroll: true })
                }}
              >
                清空筛选
              </Button>
            ) : null}
          </header>
          <div className="erp-business-operation-panel__filters" ref={fieldsRef}>
            {children}
          </div>
          <footer>
            <Button type="primary" onClick={onDismiss}>收起</Button>
          </footer>
        </div>
      </BusinessFilterPanelContext.Provider>
    </section>
  )
}
