import { useLayoutEffect, useRef } from 'react'

function measureScrollableTab(container, item) {
  const strip = container.getBoundingClientRect()
  const tab = item.getBoundingClientRect()
  const style = getComputedStyle(container)
  const stripWidth = parseFloat(style.width)
  const scaleX = strip.width / stripWidth
  const scaleY = strip.height / parseFloat(style.height)
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || !scaleX || !scaleY) return null

  // Preserve fractional positions in local CSS pixels, even inside a scaled
  // surface. Rounding the position and width separately can create overflow.
  const borderLeft = parseFloat(style.borderLeftWidth)
  const visibleWidth = stripWidth - borderLeft - parseFloat(style.borderRightWidth)
  const left = (tab.left - strip.left) / scaleX - borderLeft
  const top = (tab.top - strip.top) / scaleY - parseFloat(style.borderTopWidth)
  const width = tab.width / scaleX
  const { scrollLeft, scrollTop } = container
  if (left < 0) container.scrollLeft = scrollLeft + left
  else if (left + width > visibleWidth) container.scrollLeft = scrollLeft + left + width - visibleWidth
  return [scrollLeft + left, scrollTop + top, width, tab.height / scaleY]
}

// Keep the indicator in its own layout coordinates, including inside opening
// modals. Retargeting a CSS transition preserves its current visual position.
export default function useSlidingIndicator({
  containerSelector,
  itemSelector,
  selectedSelector,
  revealSelected = false,
}) {
  const rootRef = useRef(null)

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

      const geometry = (revealSelected && measureScrollableTab(container, item)) || [
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
    const refresh = (records) => {
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
      if (!records || records.some((record) => record.type === 'childList') || container.querySelector(selectedSelector) !== previousItem) measure()
    }
    const mutationObserver = new MutationObserver(refresh)
    mutationObserver.observe(container, {
      attributes: true,
      attributeFilter: ['aria-selected', 'class'],
      childList: true,
      subtree: true,
    })
    refresh()

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [containerSelector, itemSelector, selectedSelector, revealSelected])

  return rootRef
}
