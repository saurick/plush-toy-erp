import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveDevDocsReadingHeading } from '../pages/devDocsNavigation.mjs'

const READING_INSET = 16

export default function useDirectoryReading(ids, contentRef, scrollRef) {
  const [currentId, setCurrentId] = useState(ids[0])
  const landing = useRef(null)

  const jumpTo = useCallback((id) => {
    const heading = document.getElementById(id)
    const scroller = scrollRef?.current || document.scrollingElement
    if (!heading || !contentRef.current?.contains(heading) || !scroller) return
    const viewportTop = scrollRef?.current?.getBoundingClientRect().top || 0
    const top = scroller.scrollTop + heading.getBoundingClientRect().top - viewportTop - READING_INSET
    scroller.scrollTo({ top, behavior: 'instant' })
    landing.current = { id, top: scroller.scrollTop }
    setCurrentId(id)
  }, [contentRef, scrollRef])

  useEffect(() => {
    const content = contentRef.current
    const scroller = scrollRef?.current || document.scrollingElement
    if (!content || !scroller) return undefined
    const source = scrollRef?.current || window
    const anchors = ids.map((id) => document.getElementById(id)).filter((node) => content.contains(node))
    let frame
    const update = () => {
      const { clientHeight, scrollHeight, scrollTop } = scroller
      const viewportTop = scrollRef?.current?.getBoundingClientRect().top || 0
      const positions = anchors.map((heading) => ({
        id: heading.id,
        top: heading.getBoundingClientRect().top - viewportTop + scrollTop,
      }))
      if (landing.current && Math.abs(landing.current.top - scrollTop) > 1) landing.current = null
      setCurrentId(resolveDevDocsReadingHeading(
        positions,
        { clientHeight, scrollHeight, scrollTop, readingInset: READING_INSET + 1 },
        landing.current?.id,
      ))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(content)
    source.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      source.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [contentRef, ids, scrollRef])

  return { currentId, jumpTo }
}
