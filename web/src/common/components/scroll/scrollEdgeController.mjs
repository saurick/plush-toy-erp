const SCROLL_OVERFLOW = /^(auto|scroll|overlay)$/u
const CLIP_OVERFLOW = /^(auto|scroll|overlay|hidden|clip)$/u
const EXCLUDED =
  'input,textarea,select,iframe,canvas,svg,img,video,audio,[contenteditable]:not([contenteditable="false"]),[data-scroll-edges="off"],.app-scroll-edges'
const DIRECTIONS = ['left', 'right', 'top', 'bottom']

export function getScrollEdgeState(
  element,
  { x = true, y = true, rtl = false } = {}
) {
  const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth)
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
  const left = Math.min(
    maxLeft,
    Math.max(0, rtl ? maxLeft + element.scrollLeft : element.scrollLeft)
  )
  const top = Math.min(maxTop, Math.max(0, element.scrollTop))
  return {
    left: x && element.clientWidth > 0 && left > 1,
    right: x && element.clientWidth > 0 && maxLeft - left > 1,
    top: y && element.clientHeight > 0 && top > 1,
    bottom: y && element.clientHeight > 0 && maxTop - top > 1,
  }
}

function clientBox(element) {
  const rect = element.getBoundingClientRect()
  const scaleX = element.offsetWidth ? rect.width / element.offsetWidth : 1
  const scaleY = element.offsetHeight ? rect.height / element.offsetHeight : 1
  const left = rect.left + element.clientLeft * scaleX
  const top = rect.top + element.clientTop * scaleY
  return {
    left,
    top,
    right: left + element.clientWidth * scaleX,
    bottom: top + element.clientHeight * scaleY,
  }
}

function visibleBox(element, view) {
  const viewport = element === element.ownerDocument.scrollingElement
  const box = viewport
    ? { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight }
    : clientBox(element)
  box.left = Math.max(0, box.left)
  box.top = Math.max(0, box.top)
  box.right = Math.min(view.innerWidth, box.right)
  box.bottom = Math.min(view.innerHeight, box.bottom)
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = view.getComputedStyle(parent)
    if (
      !CLIP_OVERFLOW.test(style.overflowX) &&
      !CLIP_OVERFLOW.test(style.overflowY)
    ) {
      continue
    }
    const clip = clientBox(parent)
    if (CLIP_OVERFLOW.test(style.overflowX)) {
      box.left = Math.max(box.left, clip.left)
      box.right = Math.min(box.right, clip.right)
    }
    if (CLIP_OVERFLOW.test(style.overflowY)) {
      box.top = Math.max(box.top, clip.top)
      box.bottom = Math.min(box.bottom, clip.bottom)
    }
  }
  return box
}

function surfaceColor(element, view) {
  for (let node = element; node; node = node.parentElement) {
    const color = view.getComputedStyle(node).backgroundColor
    if (
      color &&
      color !== 'transparent' &&
      !/rgba\([^)]*,\s*0\s*\)$/u.test(color)
    ) {
      return color
    }
  }
  return 'var(--erp-page-bg)'
}

// One application lifecycle owns discovery and observation, including portal
// content. Scroll frames stay in their container's stacking context and do not
// change its positioning, dimensions, native scrollbar or focus behavior.
export function mountScrollEdges(doc = document) {
  const view = doc.defaultView
  const regions = new Map()
  const sticky = new Set()
  const pending = new Set([doc.body])
  const observations = new Map()
  let animationFrame = 0
  let disposed = false

  const schedule = () => {
    if (!disposed && !animationFrame) {
      animationFrame = view.requestAnimationFrame(update)
    }
  }
  const resize = new view.ResizeObserver(schedule)
  const retain = (node) => {
    const count = observations.get(node) || 0
    if (!count) resize.observe(node)
    observations.set(node, count + 1)
  }
  const release = (node) => {
    const count = observations.get(node) - 1
    if (count > 0) observations.set(node, count)
    else {
      observations.delete(node)
      resize.unobserve(node)
    }
  }
  const observeContent = (element, region) => {
    const next = new Set(
      [element, ...element.children].filter(
        (node) => !node.matches('.app-scroll-edges')
      )
    )
    region.observed.forEach((node) => {
      if (!next.has(node)) release(node)
    })
    next.forEach((node) => {
      if (!region.observed.has(node)) retain(node)
    })
    region.observed = next
  }
  const remove = (element, region) => {
    region.frame?.remove()
    region.observed.forEach(release)
    regions.delete(element)
  }
  const inspect = (element) => {
    if (!(element instanceof view.HTMLElement) || element.closest(EXCLUDED)) {
      return
    }
    const style = view.getComputedStyle(element)
    if (style.position === 'sticky' || style.position === 'fixed') {
      sticky.add(element)
    } else sticky.delete(element)
    const viewport = element === doc.scrollingElement
    const x = viewport || SCROLL_OVERFLOW.test(style.overflowX)
    const y = viewport || SCROLL_OVERFLOW.test(style.overflowY)
    if (!x && !y) {
      const old = regions.get(element)
      if (old) remove(element, old)
      return
    }
    const region = regions.get(element) || {
      observed: new Set(),
      frame: null,
      left: 0,
      top: 0,
    }
    region.axes = { x, y, rtl: style.direction === 'rtl' }
    regions.set(element, region)
    observeContent(element, region)
  }
  const discover = (root) => {
    if (
      !(root instanceof view.HTMLElement) ||
      !root.isConnected ||
      root.closest(EXCLUDED)
    ) {
      return
    }
    inspect(root)
    const walker = doc.createTreeWalker(root, view.NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) =>
        node.matches(EXCLUDED)
          ? view.NodeFilter.FILTER_REJECT
          : view.NodeFilter.FILTER_ACCEPT,
    })
    while (walker.nextNode()) inspect(walker.currentNode)
  }
  const createFrame = (element, region) => {
    const frame = doc.createElement('span')
    frame.className = 'app-scroll-edges'
    frame.setAttribute('aria-hidden', 'true')
    DIRECTIONS.forEach((direction) => {
      const edge = doc.createElement('span')
      edge.className = `app-scroll-edge app-scroll-edge--${direction}`
      frame.append(edge)
    })
    ;(element === doc.scrollingElement ? doc.body : element).append(frame)
    region.frame = frame
    region.left = 0
    region.top = 0
    return frame
  }
  const insetsFor = (element, box) => {
    const insets = { left: 0, right: 0, top: 0, bottom: 0 }
    sticky.forEach((node) => {
      if (node === element || !element.contains(node)) return
      const rect = node.getBoundingClientRect()
      if (
        rect.right <= box.left ||
        rect.left >= box.right ||
        rect.bottom <= box.top ||
        rect.top >= box.bottom
      ) {
        return
      }
      const style = view.getComputedStyle(node)
      if (style.position !== 'sticky' && style.position !== 'fixed') return
      const width = box.right - box.left
      const height = box.bottom - box.top
      // Full-width toolbars may also have left:0; that does not make them a
      // frozen column. Floating action buttons do not define a page boundary.
      const inlineBoundary =
        rect.width < width - 2 &&
        (style.position === 'sticky' || rect.height >= height - 2)
      const blockBoundary =
        rect.height < height - 2 &&
        (rect.width >= width * 0.8 || node.tagName === 'TH')
      if (
        inlineBoundary &&
        style.left !== 'auto' &&
        rect.left <= box.left + (parseFloat(style.left) || 0) + 1
      ) {
        insets.left = Math.max(insets.left, rect.right - box.left)
      }
      if (
        inlineBoundary &&
        style.right !== 'auto' &&
        rect.right >= box.right - (parseFloat(style.right) || 0) - 1
      ) {
        insets.right = Math.max(insets.right, box.right - rect.left)
      }
      if (
        blockBoundary &&
        style.top !== 'auto' &&
        rect.top <= box.top + (parseFloat(style.top) || 0) + 1
      ) {
        insets.top = Math.max(insets.top, rect.bottom - box.top)
      }
      if (
        blockBoundary &&
        style.bottom !== 'auto' &&
        rect.bottom >= box.bottom - (parseFloat(style.bottom) || 0) - 1
      ) {
        insets.bottom = Math.max(insets.bottom, box.bottom - rect.top)
      }
    })
    return insets
  }

  function update() {
    animationFrame = 0
    pending.forEach(discover)
    pending.clear()
    inspect(doc.scrollingElement)
    sticky.forEach((node) => {
      if (!node.isConnected) sticky.delete(node)
    })
    const plans = []
    regions.forEach((region, element) => {
      if (!element.isConnected || element.closest(EXCLUDED)) {
        remove(element, region)
        return
      }
      observeContent(element, region)
      const edges = getScrollEdgeState(element, region.axes)
      const box = visibleBox(element, view)
      if (
        !Object.values(edges).some(Boolean) ||
        box.right - box.left < 4 ||
        box.bottom - box.top < 4
      ) {
        if (region.frame) {
          plans.push(() => {
            region.frame.hidden = true
          })
        }
        return
      }
      const insets = insetsFor(element, box)
      if (
        element.querySelector(
          '[data-scroll-edge-owner="top"][data-visible="true"]'
        )
      ) {
        edges.top = false
      }
      const frame = region.frame?.isConnected
        ? region.frame
        : createFrame(element, region)
      frame.hidden = false
      const frameBox = frame.getBoundingClientRect()
      const scaleX = frame.offsetWidth ? frameBox.width / frame.offsetWidth : 1
      const scaleY = frame.offsetHeight
        ? frameBox.height / frame.offsetHeight
        : 1
      const left = region.left + (box.left - frameBox.left) / (scaleX || 1)
      const top = region.top + (box.top - frameBox.top) / (scaleY || 1)
      const values = {
        left: `${left}px`,
        top: `${top}px`,
        width: `${(box.right - box.left) / (scaleX || 1)}px`,
        height: `${(box.bottom - box.top) / (scaleY || 1)}px`,
        '--scroll-edge-surface': surfaceColor(element, view),
      }
      DIRECTIONS.forEach((direction) => {
        values[`--scroll-edge-${direction}-inset`] =
          `${insets[direction] / ((direction === 'left' || direction === 'right' ? scaleX : scaleY) || 1)}px`
      })
      plans.push(() => {
        frame.hidden = false
        DIRECTIONS.forEach((direction) => {
          const value = String(edges[direction])
          if (frame.dataset[direction] !== value) {
            frame.dataset[direction] = value
          }
        })
        Object.entries(values).forEach(([key, value]) => {
          if (frame.style.getPropertyValue(key) !== value) {
            frame.style.setProperty(key, value)
          }
        })
        region.left = left
        region.top = top
      })
    })
    plans.forEach((apply) => apply())
  }

  const mutation = new view.MutationObserver((records) => {
    let changed = false
    records.forEach((record) => {
      if (
        record.target instanceof view.Element &&
        record.target.closest('.app-scroll-edges')
      ) {
        return
      }
      if (record.type === 'attributes') pending.add(record.target)
      if (record.type === 'childList') {
        const nodes = [...record.addedNodes, ...record.removedNodes]
        if (
          nodes.length &&
          nodes.every(
            (node) =>
              node instanceof view.Element && node.matches('.app-scroll-edges')
          )
        ) {
          return
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof view.HTMLElement) pending.add(node)
        })
      }
      changed = true
    })
    if (changed) schedule()
  })
  mutation.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'class',
      'style',
      'hidden',
      'data-scroll-edges',
      'data-visible',
      'data-erp-theme',
    ],
  })
  doc.addEventListener('scroll', schedule, { capture: true, passive: true })
  doc.addEventListener('transitionend', schedule, true)
  doc.addEventListener('animationend', schedule, true)
  const onResize = () => {
    pending.add(doc.body)
    schedule()
  }
  view.addEventListener('resize', onResize)
  view.visualViewport?.addEventListener('resize', schedule)
  view.visualViewport?.addEventListener('scroll', schedule)
  retain(doc.body)
  schedule()

  return () => {
    disposed = true
    view.cancelAnimationFrame(animationFrame)
    mutation.disconnect()
    resize.disconnect()
    doc.removeEventListener('scroll', schedule, true)
    doc.removeEventListener('transitionend', schedule, true)
    doc.removeEventListener('animationend', schedule, true)
    view.removeEventListener('resize', onResize)
    view.visualViewport?.removeEventListener('resize', schedule)
    view.visualViewport?.removeEventListener('scroll', schedule)
    regions.forEach((region) => region.frame?.remove())
    regions.clear()
    sticky.clear()
    observations.clear()
    pending.clear()
  }
}
