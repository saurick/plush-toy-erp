// Click actions come from the caller, never from Mermaid source or global callbacks.
const focusedTabStops = new WeakMap()

export function bindMermaidNodeActions(
  canvas,
  nodes,
  onSelect,
  selectedId,
  { edges = [], onInspect } = {}
) {
  if (!canvas || !nodes?.length) {
    return () => {}
  }
  const allowed = new Map(nodes.map((node) => [node.id, node]))
  const canSelect = typeof onSelect === 'function'
  const cleanups = []
  const bind = (element, node, selectId, pressed, interactive = true) => {
    const pendingTabStop = focusedTabStops.get(element)
    if (pendingTabStop) {
      element.removeEventListener('blur', pendingTabStop.restore)
      focusedTabStops.delete(element)
    }
    const attributes = {
      ...(interactive
        ? { role: 'button', tabindex: '0', 'aria-label': node.label }
        : {}),
      ...(pressed !== undefined ? { 'aria-pressed': String(pressed) } : {}),
      ...(node.expanded !== undefined
        ? { 'aria-expanded': String(node.expanded) }
        : {}),
      ...(node.controls ? { 'aria-controls': node.controls } : {}),
      ...Object.fromEntries(
        Object.entries(node.data || {})
          .filter(
            ([key, value]) =>
              /^[a-z][a-z0-9-]*$/u.test(key) &&
              value !== undefined &&
              value !== null
          )
          .map(([key, value]) => [`data-${key}`, String(value)])
      ),
    }
    const previous = new Map(
      Object.keys(attributes).map((name) => [name, element.getAttribute(name)])
    )
    if (pendingTabStop) previous.set('tabindex', null)
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value)
    }
    const inspect = () => onInspect?.(node, element)
    const click = () => {
      inspect()
      if (selectId) onSelect(selectId)
    }
    const keydown = (event) => {
      if (event.key === 'Escape') {
        onInspect?.(null)
        event.stopPropagation()
        return
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (!event.repeat) click()
    }
    if (interactive) {
      element.addEventListener('click', click)
      element.addEventListener('keydown', keydown)
      element.addEventListener('pointerenter', inspect)
      element.addEventListener('focus', inspect)
    }
    cleanups.push(() => {
      element.removeEventListener('click', click)
      element.removeEventListener('keydown', keydown)
      element.removeEventListener('pointerenter', inspect)
      element.removeEventListener('focus', inspect)
      for (const [name, value] of previous) {
        // Removing the active SVG tab stop blurs it during React's cleanup/rebind.
        // Keep it until the next binding or until focus actually leaves the node.
        if (
          name === 'tabindex' &&
          value === null &&
          element.isConnected &&
          element.ownerDocument.activeElement === element
        ) {
          const restore = () => {
            element.removeAttribute('tabindex')
            focusedTabStops.delete(element)
          }
          focusedTabStops.set(element, { restore })
          element.addEventListener('blur', restore, { once: true })
          continue
        }
        if (value === null) element.removeAttribute(name)
        else element.setAttribute(name, value)
      }
    })
  }
  for (const element of canvas.querySelectorAll('g.node[id]')) {
    const id = /(?:^|-)flowchart-([A-Za-z][A-Za-z0-9_]*)-\d+$/u.exec(
      element.id
    )?.[1]
    const node = allowed.get(id)
    if (!node) continue
    bind(
      element,
      { ...node, data: { ...node.data, 'mermaid-node-id': id } },
      id,
      canSelect ? id === selectedId : undefined,
      canSelect
    )
    const highlighted =
      id === selectedId ||
      node.data?.['role-match'] ||
      node.data?.['runtime-current']
    const shape =
      canSelect && (highlighted || node.data?.risk)
        ? element.querySelector('.label-container')
        : null
    const previousStyle = shape?.getAttribute('style')
    if (shape) {
      // Mermaid scopes theme rules to an SVG id, so selection belongs on the node shape.
      if (highlighted) {
        shape.style.fill =
          id === selectedId
            ? 'var(--erp-primary-soft)'
            : 'var(--erp-surface-bg-soft)'
      }
      shape.style.stroke = highlighted
        ? 'var(--erp-primary)'
        : 'var(--erp-warning-text)'
      shape.style.strokeWidth =
        id === selectedId || node.data?.['runtime-current'] ? '3px' : '2px'
    }
    cleanups.push(() => {
      if (shape) {
        if (previousStyle === null) shape.removeAttribute('style')
        else shape.setAttribute('style', previousStyle)
      }
    })
  }
  const labels = [...canvas.querySelectorAll('.edgeLabel')]
  for (const edge of edges) {
    const path = [...canvas.querySelectorAll('path[data-id]')].find(
      (element) => element.getAttribute('data-id') === edge.id
    )
    if (path) {
      bind(
        path,
        { ...edge, data: { ...edge.data, 'graph-wire': edge.key } },
        undefined,
        undefined,
        false
      )
    }
    const label = labels.find(
      (element) =>
        element.getAttribute('data-id') === edge.id ||
        element.querySelector('[data-id]')?.getAttribute('data-id') === edge.id
    )
    if (canSelect && label && edge.description) bind(label, edge, edge.selectId)
  }
  return () => cleanups.forEach((cleanup) => cleanup())
}
