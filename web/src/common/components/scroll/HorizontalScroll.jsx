import React, { useLayoutEffect, useRef } from 'react'
import './horizontalScroll.css'

export default function HorizontalScroll({
  className = '',
  children,
  onFocusCapture,
  ...props
}) {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const measure = () => {
      root.toggleAttribute(
        'data-scrollable-end',
        root.clientWidth > 0 &&
          root.scrollWidth - root.clientWidth - Math.max(0, root.scrollLeft) > 1
      )
    }
    const resizeObserver = new ResizeObserver(measure)
    const observeContent = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(root)
      // Counts and labels can change width without resizing the scroll viewport.
      Array.from(root.children).forEach((child) =>
        resizeObserver.observe(child)
      )
      measure()
    }
    const mutationObserver = new MutationObserver(observeContent)
    mutationObserver.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    root.addEventListener('scroll', measure, { passive: true })
    observeContent()

    return () => {
      root.removeEventListener('scroll', measure)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  return (
    <div
      {...props}
      ref={rootRef}
      className={`erp-horizontal-scroll ${className}`}
      onFocusCapture={(event) => {
        onFocusCapture?.(event)
        if (!event.defaultPrevented && event.target.matches(':focus-visible')) {
          event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }}
    >
      {children}
    </div>
  )
}
