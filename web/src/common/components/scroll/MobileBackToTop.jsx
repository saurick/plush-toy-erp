import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpOutlined } from '@ant-design/icons'
import './mobileBackToTop.css'

// Place inside the scrolling body and portal into its positioned parent.
// The body's bounds keep the button clear of adjacent headers and footers.
export default function MobileBackToTop({
  enabled = true,
  mobileOnly = false,
}) {
  const markerRef = useRef(null)
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    const target = markerRef.current?.parentElement
    const host = target?.parentElement
    if (!enabled || !host) {
      setPosition(null)
      return undefined
    }
    const narrow = window.matchMedia('(max-width: 767px)')
    const originalTabIndex = target.getAttribute('tabindex')
    if (originalTabIndex === null) target.tabIndex = -1
    let frame = 0
    const update = () => {
      frame = 0
      if (
        (mobileOnly && !narrow.matches) ||
        target.scrollTop < 280 ||
        !target.getClientRects().length
      ) {
        setPosition(null)
        return
      }
      const rect = target.getBoundingClientRect()
      const parent = host.getBoundingClientRect()
      const scale = parent.width / host.offsetWidth || 1
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight
      const bottom = Math.min(rect.bottom, viewportBottom)
      const viewportTop = window.visualViewport?.offsetTop || 0
      // 键盘和浏览器工具栏以实际可视区域避让；保留输入焦点不代表仍在输入。
      if (bottom - Math.max(rect.top, viewportTop) < 72 || rect.width < 72) {
        setPosition(null)
        return
      }
      const next = {
        target,
        host,
        left: (rect.right - parent.left) / scale - host.clientLeft - 60,
        top: (bottom - parent.top) / scale - host.clientTop - 60,
      }
      setPosition((previous) =>
        previous?.host === host &&
        previous.left === next.left &&
        previous.top === next.top
          ? previous
          : next
      )
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(target)
    resize.observe(host)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    target.addEventListener('focusin', schedule)
    target.addEventListener('focusout', schedule)
    narrow.addEventListener('change', schedule)
    update()
    return () => {
      window.cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      target.removeEventListener('focusin', schedule)
      target.removeEventListener('focusout', schedule)
      narrow.removeEventListener('change', schedule)
      if (originalTabIndex === null && target.getAttribute('tabindex') === '-1') {
        target.removeAttribute('tabindex')
      }
    }
  }, [enabled, mobileOnly])

  return (
    <>
      <span hidden ref={markerRef} />
      {enabled &&
        position &&
        createPortal(
          <button
            type="button"
            className="erp-mobile-back-top"
            data-testid="mobile-back-to-top"
            aria-label="回到顶部"
            style={{ left: position.left, top: position.top }}
            onClick={() => {
              position.target.focus({ preventScroll: true })
              position.target.scrollTo({
                top: 0,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'instant'
                  : 'smooth',
              })
            }}
          >
            <ArrowUpOutlined aria-hidden="true" />
          </button>,
          position.host
        )}
    </>
  )
}
