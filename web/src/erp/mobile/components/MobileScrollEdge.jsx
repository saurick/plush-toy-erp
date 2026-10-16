import React, { useEffect, useRef, useState } from 'react'

export default function MobileScrollEdge({
  scrollContainerRef,
  enabled = true,
}) {
  const edgeRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scroll = scrollContainerRef?.current
    const controls = edgeRef.current?.parentElement
    if (!enabled || !scroll || !controls) {
      setVisible(false)
      return undefined
    }
    let frame = 0
    let shown = false
    const update = () => {
      frame = 0
      // 只区分内容是否经过吸顶栏，回看和停留时保持同一层次。
      const next =
        scroll.clientHeight > 0 &&
        scroll.scrollHeight > scroll.clientHeight + 1 &&
        getComputedStyle(controls).position === 'sticky' &&
        scroll.scrollTop > (shown ? 1 : 4)
      if (shown !== next) {
        shown = next
        setVisible(next)
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(scroll)
    resize.observe(controls)
    scroll.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    setVisible(false)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      scroll.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [enabled, scrollContainerRef])

  return (
    <span
      ref={edgeRef}
      className="mobile-scroll-edge"
      data-visible={enabled && visible}
      aria-hidden="true"
    />
  )
}
