import React, { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Popover, theme } from 'antd'
import { canRestoreOverlayFocus, OverlayDialogOpenContext, useOverlayPopupAlign, useOverlayScope } from '../overlay/OverlayScopeContext.mjs'
import './supplementalHelp.css'

// 每个文档只保留一处补充说明；不让已固定的旧气泡遮住新说明。
let activeHelp = null

export default function SupplementalHelp({
  label,
  disabled = false,
  title,
  content,
  renderContent,
  children,
  open: controlledOpen,
  onOpenChange,
  placement = 'top',
  width,
  className = '',
  popoverClassName = '',
  contentClassName = '',
  'aria-label': ariaLabel,
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const dialogOpen = useContext(OverlayDialogOpenContext)
  const scope = useOverlayScope()
  const open = (controlledOpen ?? localOpen) && !disabled && dialogOpen !== false && scope?.visible !== false
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  const pinned = useRef(false)
  const explicitlyClosed = useRef(false)
  const restoringFocus = useRef(false)
  const onChangeRef = useRef(onOpenChange)
  onChangeRef.current = onOpenChange
  const controlled = controlledOpen !== undefined
  const id = useId()
  const { token } = theme.useToken()
  const [layout, setLayout] = useState({ placement, maxHeight: 400, maxWidth: 420, shiftX: 0, narrow: false })

  const changeOpen = useCallback((nextOpen) => {
    if (!controlled) setLocalOpen(nextOpen)
    onChangeRef.current?.(nextOpen)
  }, [controlled])
  const close = useCallback(({ restoreFocus = true } = {}) => {
    explicitlyClosed.current = true
    pinned.current = false
    if (restoreFocus && canRestoreOverlayFocus(scope)) {
      restoringFocus.current = true
      triggerRef.current?.focus({ preventScroll: true })
      restoringFocus.current = false
    }
    changeOpen(false)
  }, [changeOpen, scope])
  const closeRef = useRef(close)
  closeRef.current = close
  const dismiss = useCallback(() => closeRef.current({ restoreFocus: false }), [])

  const updateLayout = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect()
    if (!box) return
    const pane = scope?.enabled ? scope.host.getBoundingClientRect() : null
    const bounds = {
      left: Math.max(0, pane?.left || 0),
      right: Math.min(window.innerWidth, pane?.right ?? window.innerWidth),
      top: Math.max(0, pane?.top || 0),
      bottom: Math.min(window.innerHeight, pane?.bottom ?? window.innerHeight),
    }
    const narrow = bounds.right - bounds.left <= 767
    const below = bounds.bottom - box.bottom - 16
    const above = box.top - bounds.top - 16
    const nextPlacement = narrow ? (below >= above ? 'bottom' : 'top') : placement
    const maxWidth = Math.max(160, Math.min(width || 420, bounds.right - bounds.left - 32))
    const popupWidth = Math.min(width || contentRef.current?.closest('.ant-popover')?.getBoundingClientRect().width || maxWidth, maxWidth)
    const centeredLeft = box.left + box.width / 2 - popupWidth / 2
    const shiftX = narrow ? Math.max(bounds.left + 16, Math.min(bounds.right - popupWidth - 16, centeredLeft)) - centeredLeft : 0
    const maxHeight = Math.max(80, Math.min(500, (narrow ? Math.max(above, below) : bounds.bottom - bounds.top - 32) - 64))
    setLayout((previous) => previous.placement === nextPlacement && previous.maxHeight === maxHeight && previous.maxWidth === maxWidth && previous.shiftX === shiftX && previous.narrow === narrow ? previous : { placement: nextPlacement, maxHeight, maxWidth, shiftX, narrow })
  }, [placement, scope?.enabled, scope?.host, width])
  const show = () => {
    updateLayout()
    changeOpen(true)
  }

  useEffect(() => {
    if (disabled || dialogOpen === false || scope?.visible === false) dismiss()
  }, [disabled, dialogOpen, scope?.visible, dismiss])

  useLayoutEffect(() => {
    if (!open) {
      pinned.current = false
      if (activeHelp === dismiss) activeHelp = null
      return undefined
    }
    if (activeHelp !== dismiss) activeHelp?.()
    activeHelp = dismiss
    updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)
    const observer = new ResizeObserver(updateLayout)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
      observer.disconnect()
      if (activeHelp === dismiss) activeHelp = null
    }
  }, [open, updateLayout, dismiss])

  useEffect(() => {
    if (!open) return undefined
    const outside = (event) => {
      if (triggerRef.current?.contains(event.target) || contentRef.current?.closest('.ant-popover')?.contains(event.target)) return
      dismiss()
    }
    const escape = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      close({ restoreFocus: contentRef.current?.contains(document.activeElement) })
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, close, dismiss])

  const align = useOverlayPopupAlign(layout.narrow ? {
    offset: [layout.shiftX, (token.marginXXS + token.sizePopupArrow / 2) * (layout.placement === 'top' ? -1 : 1)],
  } : undefined)
  return (
    <Popover
      open={open}
      trigger="hover"
      destroyOnHidden
      placement={layout.placement}
      align={align}
      classNames={{ root: `erp-supplemental-help-popover ${popoverClassName}`.trim() }}
      styles={{ root: { width, maxWidth: layout.maxWidth } }}
      title={title}
      onOpenChange={(nextOpen) => {
        if (nextOpen && explicitlyClosed.current) return
        if (!nextOpen && (pinned.current || contentRef.current?.contains(document.activeElement) || triggerRef.current === document.activeElement && triggerRef.current.matches(':focus-visible'))) return
        if (nextOpen) show()
        else changeOpen(false)
      }}
      content={
        <div
          ref={contentRef}
          id={id}
          className={`erp-supplemental-help-content ${contentClassName}`.trim()}
          style={{ maxHeight: layout.maxHeight }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) dismiss()
          }}
          onKeyDown={(event) => {
            const first = event.currentTarget.querySelector('a[href], button:not(:disabled), [tabindex="0"]')
            if (event.key === 'Tab' && event.shiftKey && event.target === first) {
              event.preventDefault()
              event.stopPropagation()
              triggerRef.current?.focus({ preventScroll: true })
            }
          }}
        >
          {renderContent ? renderContent(close) : content}
        </div>
      }
    >
      <Button
        ref={triggerRef}
        type="text"
        size="small"
        className={`erp-supplemental-help-trigger ${className}`.trim()}
        icon={<InfoCircleOutlined aria-hidden="true" />}
        disabled={disabled}
        aria-label={ariaLabel || `查看${label}说明`}
        aria-expanded={Boolean(open)}
        aria-controls={open ? id : undefined}
        onMouseEnter={() => { explicitlyClosed.current = false }}
        onPointerDown={() => { explicitlyClosed.current = false }}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) {
            explicitlyClosed.current = false
            show()
          }
        }}
        onBlur={(event) => {
          explicitlyClosed.current = false
          if (!contentRef.current?.contains(event.relatedTarget)) dismiss()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            explicitlyClosed.current = false
            event.stopPropagation()
          } else if (event.key === 'Tab' && !event.shiftKey && open) {
            const first = contentRef.current?.querySelector('a[href], button:not(:disabled), [tabindex="0"]')
            if (first) { event.preventDefault(); first.focus() }
          }
        }}
        onClick={(event) => {
          event.stopPropagation()
          const nextOpen = !open || !pinned.current
          explicitlyClosed.current = !nextOpen
          pinned.current = nextOpen
          if (nextOpen) show()
          else changeOpen(false)
        }}
      >
        {children}
      </Button>
    </Popover>
  )
}
