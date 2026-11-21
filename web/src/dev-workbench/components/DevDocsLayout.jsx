import React, { useLayoutEffect, useRef, useState } from 'react'

const SIDEBAR_WIDTH_KEY = 'plush_erp_dev_docs_sidebar_width'
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_DEFAULT_MAX = 240
const SIDEBAR_DEFAULT_PERCENT = 23
const READER_MIN_WIDTH = 480
const DIVIDER_WIDTH = 12
const KEYBOARD_STEP = 20

function readSidebarWidth() {
  try {
    const width = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return Number.isFinite(width) && width >= SIDEBAR_MIN_WIDTH ? width : null
  } catch {
    return null
  }
}

export default function DevDocsLayout({ children }) {
  const [sidebar, reader] = children
  const shellRef = useRef(null)
  const dragRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [preferredWidth, setPreferredWidth] = useState(readSidebarWidth)
  const [dragWidth, setDragWidth] = useState(null)

  useLayoutEffect(() => {
    const shell = shellRef.current
    const measure = () => setContainerWidth(shell.getBoundingClientRect().width)
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, containerWidth - DIVIDER_WIDTH - READER_MIN_WIDTH)
  const clampWidth = (width) => Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, width))
  const defaultWidth = Math.min(SIDEBAR_DEFAULT_MAX, containerWidth * SIDEBAR_DEFAULT_PERCENT / 100)
  const requestedWidth = dragWidth ?? preferredWidth
  const sidebarWidth = clampWidth(requestedWidth ?? defaultWidth)

  const commitWidth = (width) => {
    const nextWidth = clampWidth(width)
    if (nextWidth === clampWidth(preferredWidth ?? defaultWidth)) return
    setPreferredWidth(nextWidth)
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth))
    } catch {
      // 存储被禁用时仍可调整本次打开的页面。
    }
  }

  const startDrag = (event) => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: event.pointerId, x: event.clientX, width: sidebarWidth }
    setDragWidth(sidebarWidth)
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (drag?.id !== event.pointerId) return
    setDragWidth(clampWidth(drag.width + (event.clientX - drag.x)))
  }

  const cancelDrag = ({ pointerId }) => {
    if (dragRef.current?.id !== pointerId) return
    dragRef.current = null
    setDragWidth(null)
  }

  const finishDrag = (event) => {
    const drag = dragRef.current
    if (drag?.id !== event.pointerId) return
    cancelDrag(event)
    if (event.currentTarget.getClientRects().length) {
      commitWidth(drag.width + (event.clientX - drag.x))
    }
  }

  const resizeWithKeyboard = (event) => {
    const drag = dragRef.current
    if (drag) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (event.currentTarget.hasPointerCapture(drag.id)) {
          event.currentTarget.releasePointerCapture(drag.id)
        }
        cancelDrag({ pointerId: drag.id })
      }
      return
    }

    const widths = {
      ArrowLeft: sidebarWidth - KEYBOARD_STEP,
      ArrowRight: sidebarWidth + KEYBOARD_STEP,
      Home: SIDEBAR_MIN_WIDTH,
      End: maxWidth,
    }
    const width = widths[event.key]
    if (typeof width !== 'number') return
    event.preventDefault()
    commitWidth(width)
  }

  return (
    <main
      ref={shellRef}
      className="erp-dev-docs-shell"
      style={{
        '--dev-docs-sidebar-min': `${SIDEBAR_MIN_WIDTH}px`,
        '--dev-docs-divider-width': `${DIVIDER_WIDTH}px`,
        '--dev-docs-reader-min': `${READER_MIN_WIDTH}px`,
        '--dev-docs-sidebar-width': requestedWidth === null
          ? `min(${SIDEBAR_DEFAULT_PERCENT}%, ${SIDEBAR_DEFAULT_MAX}px)`
          : `${requestedWidth}px`,
      }}
    >
      {sidebar}
      <div
        className="erp-dev-docs-divider"
        role="slider"
        tabIndex={0}
        aria-label="调整文档列表宽度"
        aria-orientation="horizontal"
        aria-controls={sidebar.props.id}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={sidebarWidth}
        aria-valuetext={`${sidebarWidth} 像素`}
        title="拖动分隔线或用左右方向键调整宽度"
        data-resizing={dragWidth !== null || undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={resizeWithKeyboard}
      />
      {reader}
    </main>
  )
}
