import React, { useCallback, useEffect, useRef, useState } from 'react'
import MobileTaskListOptions from './MobileTaskListOptions.jsx'
import { updateMobileTaskToolbar } from '../utils/mobileTaskToolbar.mjs'

export default function MobileTaskListToolbar({
  tabs,
  scrollContainerRef,
  resetKey,
  ...optionsProps
}) {
  const toolbarRef = useRef(null)
  const optionsRef = useRef(null)
  const menuOpenRef = useRef(false)
  const scrollStateRef = useRef({
    top: 0,
    anchor: 0,
    direction: 0,
    visible: true,
  })
  const [visible, setVisible] = useState(true)

  const handleMenuOpenChange = useCallback((open) => {
    menuOpenRef.current = open
    if (open) {
      scrollStateRef.current = { ...scrollStateRef.current, visible: true }
      setVisible(true)
    }
  }, [])

  // 详情返回会重建列表，订阅前须等父滚动容器的 ref 就绪。
  useEffect(() => {
    const container = scrollContainerRef.current
    const toolbar = toolbarRef.current
    if (!container || !toolbar) return undefined

    const readPosition = () => ({
      scrollTop: container.scrollTop,
      maxScrollTop: container.scrollHeight - container.clientHeight,
      pinned:
        toolbar.getBoundingClientRect().top <=
        container.getBoundingClientRect().top + 1,
    })
    const position = readPosition()
    scrollStateRef.current = {
      top: Math.max(0, position.scrollTop),
      anchor: Math.max(0, position.scrollTop),
      direction: 0,
      visible: !position.pinned,
    }
    setVisible(!position.pinned)

    const handleScroll = () => {
      const focused = document.activeElement
      const locked =
        menuOpenRef.current ||
        (optionsRef.current?.contains(focused) &&
          focused.matches(':focus-visible'))
      const next = updateMobileTaskToolbar(scrollStateRef.current, {
        ...readPosition(),
        locked,
      })
      if (next.visible !== scrollStateRef.current.visible) {
        setVisible(next.visible)
      }
      scrollStateRef.current = next
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [resetKey, scrollContainerRef])

  return (
    <div
      ref={toolbarRef}
      className="mobile-task-list-toolbar"
      data-testid="mobile-task-list-toolbar"
    >
      {tabs}
      <div
        ref={optionsRef}
        className={`mobile-task-list-toolbar__options bg-white${visible ? '' : ' mobile-task-list-toolbar__options--hidden'}`}
        data-testid="mobile-task-list-toolbar-options"
        aria-hidden={!visible}
      >
        <MobileTaskListOptions
          {...optionsProps}
          onOpenChange={handleMenuOpenChange}
        />
      </div>
    </div>
  )
}
