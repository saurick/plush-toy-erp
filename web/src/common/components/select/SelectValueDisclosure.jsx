import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Popover } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

// Keep the Select root and its public ref intact: form layout and focus still belong to Select.
export function useSelectValueDisclosure(selectRef, mode, showSearch, hasPrefix) {
  const [display, setDisplay] = useState({ element: null, text: '', overflow: false, popupWidth: undefined })
  const measured = useRef(display)
  const measure = useCallback(() => {
    const element = selectRef.current?.nativeElement
    const item = mode ? null : element?.querySelector('.ant-select-selection-item')
    const text = item?.textContent?.trim() || ''
    // Test against the space before adding the reader, so near-fit text cannot toggle the affordance repeatedly.
    const reader = element?.querySelector('.app-select__inspect')
    const prefix = element?.querySelector('.ant-select-prefix')
    const reserved = reader ? reader.getBoundingClientRect().width + (hasPrefix ? 4 : parseFloat(getComputedStyle(prefix).marginInlineEnd) || 0) : 0
    const overflow = !!text && item.clientWidth > 0 && item.scrollWidth > item.clientWidth + reserved + 1
    const popupWidth = element && !mode && (showSearch || overflow)
      ? Math.max(element.getBoundingClientRect().width, Math.min(360, window.innerWidth - 24))
      : undefined
    const previous = measured.current
    if (previous.element !== element || previous.text !== text || previous.overflow !== overflow || previous.popupWidth !== popupWidth) {
      measured.current = { element, text, overflow, popupWidth }
      setDisplay(measured.current)
    }
  }, [selectRef, mode, showSearch, hasPrefix])

  useLayoutEffect(() => { measure() })
  useEffect(() => {
    const element = selectRef.current?.nativeElement
    if (!element || mode) return undefined
    let frame
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    const selector = element.querySelector('.ant-select-selector')
    if (selector) resize.observe(selector)
    const mutation = new MutationObserver(schedule)
    mutation.observe(element, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title'] })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [selectRef, mode, measure])
  return display
}

export default function SelectValueDisclosure({ text, label, available, valueKey, children }) {
  const [opened, setOpened] = useState(null)
  const open = available && opened?.text === text && opened?.valueKey === valueKey
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  const title = label ? `${label}完整值` : '完整值'
  const close = () => {
    setOpened(null)
    triggerRef.current?.focus({ preventScroll: true })
  }
  useEffect(() => { setOpened(null) }, [text, valueKey, available])
  useEffect(() => {
    if (!open) return undefined
    const onFocus = (event) => {
      if (!contentRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpened(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape' && (contentRef.current?.contains(event.target) || triggerRef.current?.contains(event.target))) {
        event.preventDefault()
        event.stopPropagation()
        setOpened(null)
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('pointerdown', onFocus)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('pointerdown', onFocus)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  const reader = available ? (
    <button
      type="button"
      className="app-select__inspect"
      ref={triggerRef}
      title={`查看${title}`}
      aria-label={`查看${title}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onMouseDown={(event) => event.stopPropagation()}
      onFocus={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        setOpened(open ? null : { text, valueKey })
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); close() }
      }}
    >
      <InfoCircleOutlined />
    </button>
  ) : null
  return (
    <Popover
      open={open}
      trigger={[]}
      placement="bottomRight"
      classNames={{ root: 'app-select-value-popover' }}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (visible) contentRef.current?.focus({ preventScroll: true })
      }}
      content={(
        <div
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          ref={contentRef}
        >
          <div className="app-select-value-popover__heading">
            <strong>{title}</strong>
            <Button size="small" onClick={close}>关闭</Button>
          </div>
          <div className="app-select-value-popover__text">{text}</div>
        </div>
      )}
    >
      {children(reader)}
    </Popover>
  )
}
