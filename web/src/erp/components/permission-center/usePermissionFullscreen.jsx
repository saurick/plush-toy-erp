import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// Keep the same editor mounted so fullscreen shares its draft and filters.
export function usePermissionFullscreen({ enabled, dismissPopup }) {
  const [open, setOpen] = useState(false)
  const workspaceRef = useRef(null)
  const enterRef = useRef(null)
  const exitRef = useRef(null)
  const scrollPositionsRef = useRef([])
  const dismissPopupRef = useRef(dismissPopup)
  const fullscreen = enabled && open
  const restoreFocus = useCallback(() => {
    enterRef.current?.focus({ preventScroll: true })
  }, [])

  const enterFullscreen = () => {
    const workspace = workspaceRef.current
    const table = workspace?.querySelector('.erp-permission-checklist')
    if (!table) return
    const positions = [[table, table.scrollTop, table.scrollLeft]]
    for (let node = workspace; node; node = node.parentElement) {
      positions.push([node, node.scrollTop, node.scrollLeft])
    }
    scrollPositionsRef.current = positions
    setOpen(true)
  }

  useLayoutEffect(() => {
    dismissPopupRef.current = dismissPopup
  })

  useLayoutEffect(() => {
    if (!enabled) setOpen(false)
  }, [enabled])

  useLayoutEffect(() => {
    if (!fullscreen) return undefined
    const workspace = workspaceRef.current
    if (!workspace) return undefined
    const table = workspace.querySelector('.erp-permission-checklist')
    const scrollPositions = scrollPositionsRef.current
    const background = []
    const scrollLocks = []
    // Body portals stay available to the data-scope modal and its selectors.
    for (
      let node = workspace;
      node.parentElement && node.parentElement !== document.body;
      node = node.parentElement
    ) {
      const parent = node.parentElement
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        scrollLocks.push([parent, parent.style.overflow])
        parent.style.overflow = 'hidden'
      }
      for (const sibling of parent.children) {
        if (sibling !== node) {
          background.push([sibling, sibling.inert])
          sibling.inert = true
        }
      }
    }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    exitRef.current?.focus({ preventScroll: true })

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing) return
      // Nested Ant Design dialogs own their keyboard handling and focus trap.
      if (event.target.closest?.('.ant-modal-wrap')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!dismissPopupRef.current?.()) setOpen(false)
      }
      if (event.key !== 'Tab' || !workspace.contains(event.target)) return
      const controls = [
        ...workspace.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex]'
        ),
      ].filter(
        (node) =>
          !node.disabled && node.tabIndex >= 0 && node.getClientRects().length
      )
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    // Resolve popup priority before its own Escape handler clears open state.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      scrollLocks.forEach(([node, previous]) => {
        node.style.overflow = previous
      })
      background.forEach(([node, inert]) => {
        node.inert = inert
      })
      requestAnimationFrame(() => {
        if (!table?.isConnected) return
        scrollPositions.forEach(([node, top, left]) => {
          node.scrollTop = top
          node.scrollLeft = left
        })
        restoreFocus()
      })
    }
  }, [fullscreen, restoreFocus])

  return {
    fullscreen,
    setFullscreen: setOpen,
    enterFullscreen,
    workspaceRef,
    enterRef,
    exitRef,
  }
}
