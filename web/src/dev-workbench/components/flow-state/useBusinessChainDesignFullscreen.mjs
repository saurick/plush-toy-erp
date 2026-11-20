import { useLayoutEffect, useRef, useState } from 'react'
import { hasVisibleOverlayPopup } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { isolateOverlaySiblings, lockOverlayScroll } from '@/common/components/overlay/ScopedOverlayDialog.jsx'

export default function useBusinessChainDesignFullscreen() {
  const [fullscreen, setFullscreen] = useState(false)
  const workspaceRef = useRef(null)
  const buttonRef = useRef(null)
  const positionsRef = useRef([])

  const toggleFullscreen = () => {
    const workspace = workspaceRef.current
    if (!fullscreen) {
      const positions = [...workspace.querySelectorAll('.erp-chain-design__viewport, .erp-chain-design__library-list')]
      for (let node = workspace; node; node = node.parentElement) positions.push(node)
      positionsRef.current = positions.map((node) => [node, node.scrollTop, node.scrollLeft])
    }
    setFullscreen((current) => !current)
  }

  useLayoutEffect(() => {
    if (!fullscreen) return undefined
    const workspace = workspaceRef.current
    const button = buttonRef.current
    const releases = [
      isolateOverlaySiblings(workspace, document.getElementById('root')),
      lockOverlayScroll(document.body),
    ]
    for (let node = workspace.parentElement; node && node !== document.body; node = node.parentElement) {
      if (/auto|scroll/u.test(getComputedStyle(node).overflowY)) releases.push(lockOverlayScroll(node))
    }
    button?.focus({ preventScroll: true })
    let popupEscape = null
    const captureEscape = (event) => {
      if (event.key !== 'Escape') return
      const popup = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden), .ant-dropdown:not(.ant-dropdown-hidden)')]
        .some((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      popupEscape = hasVisibleOverlayPopup() || popup ? event : null
    }
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing || (!workspace.contains(event.target) && event.target !== document.body)) return
      if (event.key === 'Escape' && event !== popupEscape) {
        event.preventDefault()
        setFullscreen(false)
      }
      if (event.key !== 'Tab') return
      const controls = [...workspace.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length)
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
    window.addEventListener('keydown', captureEscape, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', captureEscape, true)
      window.removeEventListener('keydown', onKeyDown)
      releases.toReversed().forEach((release) => release())
      // Keep the same canvas mounted and restore the view clipped by expansion.
      requestAnimationFrame(() => {
        if (!workspace.isConnected) return
        positionsRef.current.forEach(([node, top, left]) => {
          node.scrollTop = top
          node.scrollLeft = left
        })
        button?.focus({ preventScroll: true })
      })
    }
  }, [fullscreen])

  return { fullscreen, toggleFullscreen, workspaceRef, buttonRef }
}
