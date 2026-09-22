import { useLayoutEffect, useRef } from 'react'

// Keep the indicator in its own layout coordinates, including inside opening
// modals. Retargeting a CSS transition preserves its current visual position.
export default function useSlidingIndicator({
  containerSelector,
  itemSelector,
  selectedSelector,
}) {
  const rootRef = useRef(null)
  const measureRef = useRef(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const container = containerSelector
      ? root?.querySelector(containerSelector)
      : root
    if (!container) return undefined

    let previousItem = null
    let previousGeometry = ''
    const observedItems = new Set()
    const measure = () => {
      const item = container.querySelector(selectedSelector)
      if (!item || !item.offsetWidth || !item.offsetHeight) {
        container.removeAttribute('data-sliding-ready')
        previousItem = null
        previousGeometry = ''
        return
      }

      const geometry = [
        item.offsetLeft,
        item.offsetTop,
        item.offsetWidth,
        item.offsetHeight,
      ]
      const geometryKey = geometry.join(',')
      const snap = !previousItem || previousItem === item
      previousItem = item
      if (previousGeometry === geometryKey) return
      previousGeometry = geometryKey

      // Mounting, resizing and label changes align immediately; only a change
      // of selection slides. A resize must not leave a highlight between tabs.
      if (snap) container.removeAttribute('data-sliding-ready')
      ;['x', 'y', 'width', 'height'].forEach((key, index) => {
        container.style.setProperty(
          `--erp-slider-${key}`,
          `${geometry[index]}px`
        )
      })
      if (snap) {
        window
          .getComputedStyle(container, '::before')
          .getPropertyValue('transform')
      }
      container.dataset.slidingReady = 'true'
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(container)
    const refresh = () => {
      const items = new Set(container.querySelectorAll(itemSelector))
      observedItems.forEach((item) => {
        if (!items.has(item)) {
          resizeObserver.unobserve(item)
          observedItems.delete(item)
        }
      })
      items.forEach((item) => {
        if (!observedItems.has(item)) {
          resizeObserver.observe(item)
          observedItems.add(item)
        }
      })
      measure()
    }
    const mutationObserver = new MutationObserver(refresh)
    mutationObserver.observe(container, {
      attributes: true,
      attributeFilter: ['aria-selected', 'class'],
      childList: true,
      subtree: true,
    })
    measureRef.current = refresh
    refresh()

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      measureRef.current = null
    }
  }, [containerSelector, itemSelector, selectedSelector])

  useLayoutEffect(() => {
    measureRef.current?.()
  })

  return rootRef
}
