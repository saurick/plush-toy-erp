// Click actions come from the caller, never from Mermaid source or global callbacks.
export function bindMermaidNodeActions(canvas, nodes, onSelect, selectedId) {
  if (!canvas || typeof onSelect !== 'function' || !nodes?.length) return () => {}
  const allowed = new Map(nodes.map((node) => [node.id, node]))
  const cleanups = []
  for (const element of canvas.querySelectorAll('g.node[id]')) {
    const id = /(?:^|-)flowchart-([A-Za-z][A-Za-z0-9_]*)-\d+$/u.exec(element.id)?.[1]
    const node = allowed.get(id)
    if (!node) continue
    const attributes = {
      role: 'button',
      tabindex: '0',
      'aria-label': node.label,
      'aria-pressed': String(id === selectedId),
      'data-mermaid-node-id': id,
    }
    const previous = new Map(Object.keys(attributes).map((name) => [name, element.getAttribute(name)]))
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
    const shape = id === selectedId ? element.querySelector('.label-container') : null
    const previousStyle = shape?.getAttribute('style')
    if (shape) {
      // Mermaid scopes theme rules to an SVG id, so selection belongs on the node shape.
      shape.style.fill = 'var(--erp-primary-soft)'
      shape.style.stroke = 'var(--erp-primary)'
      shape.style.strokeWidth = '2px'
    }
    const click = () => onSelect(id)
    const keydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (!event.repeat) onSelect(id)
    }
    element.addEventListener('click', click)
    element.addEventListener('keydown', keydown)
    cleanups.push(() => {
      element.removeEventListener('click', click)
      element.removeEventListener('keydown', keydown)
      for (const [name, value] of previous) {
        if (value === null) element.removeAttribute(name)
        else element.setAttribute(name, value)
      }
      if (shape) {
        if (previousStyle === null) shape.removeAttribute('style')
        else shape.setAttribute('style', previousStyle)
      }
    })
  }
  return () => cleanups.forEach((cleanup) => cleanup())
}
