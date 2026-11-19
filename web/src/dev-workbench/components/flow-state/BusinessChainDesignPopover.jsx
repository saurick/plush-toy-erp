import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Popover } from 'antd'
import { CloseOutlined, DownOutlined } from '@ant-design/icons'

export default function BusinessChainDesignPopover({ kind, label, title, closeLabel, current, singleChoice = false, dock, children }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const trigger = useRef(null)
  const list = useRef(null)
  const dismiss = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  const focusOption = useCallback((button) => {
    if (!button) return
    button.focus({ preventScroll: true })
    const bounds = list.current.getBoundingClientRect()
    const item = button.getBoundingClientRect()
    if (item.top < bounds.top) list.current.scrollTop += item.top - bounds.top
    else if (item.bottom > bounds.bottom) list.current.scrollTop += item.bottom - bounds.bottom
  }, [])
  const onPanelKey = (event) => {
    if (event.key === 'Escape' || (singleChoice && event.key === 'Tab')) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
      dismiss()
      return
    }
    if (!singleChoice) return
    const items = [...list.current.querySelectorAll('button')]
    const at = items.indexOf(event.target)
    if (at < 0) return
    const to = {
      ArrowDown: at + 1,
      ArrowRight: at + 1,
      ArrowUp: at - 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: items.length - 1,
    }[event.key]
    if (to === undefined) return
    event.preventDefault()
    focusOption(items[Math.max(0, Math.min(items.length - 1, to))])
  }
  const focusCurrent = useCallback(() => focusOption(list.current?.querySelector('input:checked, [aria-pressed="true"]') || list.current?.querySelector('input, button')), [focusOption])
  useLayoutEffect(() => {
    if (open && dock?.current) focusCurrent()
  }, [open, dock, focusCurrent])
  useEffect(() => {
    if (!dock || !open) return undefined
    const outside = (event) => {
      if (!dock.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', outside)
    return () => document.removeEventListener('click', outside)
  }, [dock, open])
  const panel = (
    <section
      id={panelId}
      role="dialog"
      aria-label={title}
      className="erp-chain-design__picker-panel"
      data-picker={kind}
      onKeyDownCapture={onPanelKey}
      onBlur={(event) => {
        if (dock && event.relatedTarget?.closest('.erp-chain-handoffs')) return
        if (!singleChoice && event.relatedTarget !== trigger.current && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <header>
        <strong>{title}</strong>
        <Button type="text" size="small" icon={<CloseOutlined />} aria-label={closeLabel} onClick={dismiss} />
      </header>
      <div ref={list} className="erp-chain-design__picker-options">
        {children(dismiss)}
      </div>
    </section>
  )
  const control = (
    <Button
      ref={trigger}
      onClick={dock ? () => setOpen((previous) => !previous) : undefined}
      id={`${panelId}-trigger`}
      className="erp-chain-design__picker-trigger"
      data-picker={kind}
      aria-label={`${label || title}：${current}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        } else if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          dismiss()
        }
      }}
    >
      {current}<DownOutlined aria-hidden="true" />
    </Button>
  )
  return (
    <div className="erp-chain-design__role-filter">
      {label && <label htmlFor={`${panelId}-trigger`}>{label}</label>}
      {dock ? <>{control}{open && dock.current && createPortal(panel, dock.current)}</> : (
        <Popover
          trigger="click"
          open={open}
          onOpenChange={setOpen}
          placement="bottomLeft"
          arrow={false}
          autoAdjustOverflow={{ shiftX: true, shiftY: true }}
          getPopupContainer={(element) => element.closest('.erp-chain-design-shell')}
          afterOpenChange={(visible) => { if (visible && open) focusCurrent() }}
          content={panel}
        >
          {control}
        </Popover>
      )}
    </div>
  )
}
