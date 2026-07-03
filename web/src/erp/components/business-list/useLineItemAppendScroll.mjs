import { useCallback, useEffect, useRef } from 'react'

export function useLineItemAppendScroll(itemCount) {
  const pendingScrollIndexRef = useRef(null)
  const rowRefs = useRef([])
  const scrollFrameRef = useRef(null)

  const registerLineItemRow = useCallback((index, node) => {
    if (node) {
      rowRefs.current[index] = node
    } else {
      delete rowRefs.current[index]
    }
  }, [])

  const cancelScheduledScroll = useCallback(() => {
    if (scrollFrameRef.current === null) return
    window.cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = null
  }, [])

  const flushPendingScroll = useCallback((attempt = 0) => {
    const pendingIndex = pendingScrollIndexRef.current
    if (pendingIndex === null) {
      scrollFrameRef.current = null
      return
    }

    const target = rowRefs.current[pendingIndex]
    if (!target && attempt < 3) {
      scrollFrameRef.current = window.requestAnimationFrame(() =>
        flushPendingScroll(attempt + 1)
      )
      return
    }

    const fallbackTarget = target || rowRefs.current[rowRefs.current.length - 1]
    pendingScrollIndexRef.current = null
    scrollFrameRef.current = null
    fallbackTarget?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [])

  const requestLineItemScroll = useCallback(
    (index) => {
      const numericIndex = Number(index)
      if (!Number.isFinite(numericIndex) || numericIndex < 0) return
      pendingScrollIndexRef.current = Math.floor(numericIndex)
      cancelScheduledScroll()
      scrollFrameRef.current = window.requestAnimationFrame(() =>
        flushPendingScroll()
      )
    },
    [cancelScheduledScroll, flushPendingScroll]
  )

  useEffect(() => {
    if (Number.isFinite(itemCount) && itemCount >= 0) {
      rowRefs.current.length = itemCount
    }
  }, [itemCount])

  useEffect(() => cancelScheduledScroll, [cancelScheduledScroll])

  return {
    registerLineItemRow,
    requestLineItemScroll,
  }
}
