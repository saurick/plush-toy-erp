import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { canRestoreOverlayFocus, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { isolateOverlaySiblings, lockOverlayScroll } from '@/common/components/overlay/ScopedOverlayDialog.jsx'

// Keep the same editor mounted so fullscreen shares its draft and filters.
export function usePermissionFullscreen({ enabled, dismissPopup }) {
  const overlay = useOverlayScope()
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const [open, setOpen] = useState(false)
  const workspaceRef = useRef(null)
  const enterRef = useRef(null)
  const exitRef = useRef(null)
  const scrollPositionsRef = useRef([])
  const dismissPopupRef = useRef(dismissPopup)
  const fullscreen = enabled && open
  const restoreFocus = useCallback(() => {
    if (canRestoreOverlayFocus(overlayRef.current)) enterRef.current?.focus({ preventScroll: true })
  }, [])

  const enterFullscreen = () => {
    const workspace = workspaceRef.current
    const table = workspace?.querySelector('.erp-role-policy, .erp-permission-checklist')
    if (!table) return
    const positions = [[table, table.scrollTop, table.scrollLeft]]
    for (let node = workspace; node; node = node.parentElement) {
      positions.push([node, node.scrollTop, node.scrollLeft])
      if (overlay?.enabled && node === overlay.containerRef.current) break
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
    if (!fullscreen || overlay?.visible === false) return undefined
    const workspace = workspaceRef.current
    if (!workspace) return undefined
    const table = workspace.querySelector('.erp-role-policy, .erp-permission-checklist')
    const scrollPositions = scrollPositionsRef.current
    const boundary = overlay?.enabled ? overlay.containerRef.current : document.body
    const releases = [isolateOverlaySiblings(workspace, boundary), lockOverlayScroll(boundary)]
    // Body portals stay available to the data-scope modal and its selectors.
    for (
      let node = workspace;
      node.parentElement && node !== boundary && node.parentElement !== document.body;
      node = node.parentElement
    ) {
      const parent = node.parentElement
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        releases.push(lockOverlayScroll(parent))
      }
    }
    exitRef.current?.focus({ preventScroll: true })

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing) return
      if (overlay?.enabled && !workspace.contains(event.target) && !overlay.host.contains(event.target)) return
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
      releases.toReversed().forEach((release) => release())
      requestAnimationFrame(() => {
        if (!table?.isConnected) return
        scrollPositions.forEach(([node, top, left]) => {
          node.scrollTop = top
          node.scrollLeft = left
        })
        restoreFocus()
      })
    }
  }, [fullscreen, overlay, restoreFocus])

  return {
    fullscreen,
    fullscreenAriaModal: fullscreen ? overlay?.enabled ? 'false' : 'true' : undefined,
    setFullscreen: setOpen,
    enterFullscreen,
    workspaceRef,
    enterRef,
    exitRef,
  }
}
