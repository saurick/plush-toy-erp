import { useCallback, useEffect, useRef } from 'react'
import { revealBusinessLineItemElement } from './businessLineItemDisclosure.mjs'

function canFocusLineInput(input) {
  const rect = input.getBoundingClientRect()
  return (
    !input.matches(':disabled') &&
    (!input.readOnly || input.getAttribute('role') === 'combobox') &&
    input.tabIndex >= 0 &&
    !input.closest('[inert], [aria-hidden="true"], [aria-disabled="true"]') &&
    rect.width > 0 &&
    rect.height > 0 &&
    window.getComputedStyle(input).visibility === 'visible'
  )
}

export function useLineItemAppendScroll(itemCount, { initialFocusSelector } = {}) {
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

    if (target?.isConnected) {
      revealBusinessLineItemElement(target, pendingIndex)
      if (target.closest('[data-line-item-collapsed="true"]') && attempt < 3) {
        scrollFrameRef.current = window.requestAnimationFrame(() => flushPendingScroll(attempt + 1))
        return
      }
    }
    pendingScrollIndexRef.current = null
    scrollFrameRef.current = null
    if (!target?.isConnected) return

    const inputs = Array.from(
      target.querySelectorAll('input:not([type="hidden"]), textarea, select')
    ).filter(canFocusLineInput)
    const initialInput = initialFocusSelector ? target.querySelector(initialFocusSelector) : null
    // 保留表单已指定的焦点；身份入口移至操作列时仍从该入口录入。
    const focusTarget = inputs.includes(document.activeElement)
      ? document.activeElement
      : inputs.includes(initialInput) ? initialInput : inputs[0]
    const scrollOptions = {
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    }
    target.classList.remove('erp-line-item--appended')
    target.addEventListener(
      'animationend',
      () => target.classList.remove('erp-line-item--appended'),
      { once: true }
    )
    target.classList.add('erp-line-item--appended')
    target.scrollIntoView(scrollOptions)
    focusTarget?.focus({ preventScroll: true })
    focusTarget?.scrollIntoView(scrollOptions)
  }, [initialFocusSelector])

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
