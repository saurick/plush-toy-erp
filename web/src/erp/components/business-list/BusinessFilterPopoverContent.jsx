import React, { useLayoutEffect, useState } from 'react'
import { Button, theme } from 'antd'
import { RollbackOutlined } from '@ant-design/icons'
import { hasVisibleOverlayPopup, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'

export const businessFilterPopoverOverflow = { adjustX: true, adjustY: true, shiftX: true, shiftY: true }

function handleFilterPanelTab(event) {
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

  return (
    <section
      id={id}
      ref={panelRef}
      className="erp-business-filter-popover__content"
      style={{ '--erp-filter-available-height': maxHeight && `${maxHeight}px` }}
      aria-label={label}
      role="dialog"
      tabIndex={-1}
      onKeyDownCapture={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || hasVisibleOverlayPopup(overlay)) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onDismiss()
          return
        }
        handleFilterPanelTab(event)
      }}
    >
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
      <div className="erp-business-operation-panel__filters">
        {children}
      </div>
      <footer>
        <Button type="primary" onClick={onDismiss}>收起</Button>
      </footer>
    </section>
  )
}
