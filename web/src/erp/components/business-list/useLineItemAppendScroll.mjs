import { useCallback, useEffect, useRef } from 'react'

export function useLineItemAppendScroll(itemCount) {
  const pendingScrollIndexRef = useRef(null)
  const rowRefs = useRef([])

  const registerLineItemRow = useCallback((index, node) => {
    if (node) {
      rowRefs.current[index] = node
    } else {
      delete rowRefs.current[index]
    }
  }, [])

  const requestLineItemScroll = useCallback((index) => {
    const numericIndex = Number(index)
    if (!Number.isFinite(numericIndex) || numericIndex < 0) return
    pendingScrollIndexRef.current = Math.floor(numericIndex)
  }, [])

  useEffect(() => {
    rowRefs.current.length = itemCount
    const pendingIndex = pendingScrollIndexRef.current
    if (pendingIndex === null) return undefined

    const target =
      rowRefs.current[pendingIndex] ||
      rowRefs.current[rowRefs.current.length - 1]
    if (!target) return undefined

    pendingScrollIndexRef.current = null
    const frameID = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    })
    return () => window.cancelAnimationFrame(frameID)
  }, [itemCount])

  return {
    registerLineItemRow,
    requestLineItemScroll,
  }
}
