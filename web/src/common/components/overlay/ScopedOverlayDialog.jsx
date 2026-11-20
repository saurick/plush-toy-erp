import React, { useContext, useLayoutEffect, useRef, useState } from 'react'
import { OverlayDialogOpenContext, useOverlayScope } from './OverlayScopeContext.mjs'
import { message } from '../../utils/antdApp.js'

const isolation = new WeakMap()
const scrolling = new WeakMap()

function isolate(element) {
  if (!element) return () => {}
  let state = isolation.get(element)
  if (state) state.count += 1
  else {
    state = { count: 1, inert: element.hasAttribute('inert'), hidden: element.getAttribute('aria-hidden') }
    isolation.set(element, state)
    element.setAttribute('inert', '')
    element.setAttribute('aria-hidden', 'true')
  }
  return () => {
    state.count -= 1
    if (state.count) return
    if (!state.inert) element.removeAttribute('inert')
    if (state.hidden === null) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', state.hidden)
    isolation.delete(element)
  }
}

export function lockOverlayScroll(element) {
  if (!element) return () => {}
  let state = scrolling.get(element)
  if (state) state.count += 1
  else {
    state = { count: 1, overflow: element.style.overflow }
    scrolling.set(element, state)
    element.style.overflow = 'hidden'
  }
  return () => {
    state.count -= 1
    if (state.count) return
    element.style.overflow = state.overflow
    scrolling.delete(element)
  }
}

export function isolateOverlaySiblings(element, boundary) {
  const releases = []
  if (!boundary?.contains(element)) return () => {}
  for (let node = element; node && node !== boundary; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling !== node && sibling.tagName !== 'STYLE') releases.push(isolate(sibling))
    }
  }
  return () => releases.toReversed().forEach((release) => release())
}

export function useOverlayDialog(node, open, scope, mask = true) {
  const enabled = scope?.enabled
  const visible = scope?.visible
  useLayoutEffect(() => {
    if (!node || !open || !scope) return undefined
    return scope.registerGuard(node, () => {
      const dialog = node.closest('[role="dialog"]') || node.querySelector('[role="dialog"]')
      if (dialog?.querySelector('.ant-btn-loading')) {
        message.info('正在保存，请稍候')
        return false
      }
      return true
    })
  }, [node, open, scope])
  useLayoutEffect(() => {
    const dialog = node?.closest('[role="dialog"]') || node?.querySelector('[role="dialog"]')
    if (!scope || !open || !dialog || !scope.host.contains(dialog)) return undefined
    dialog.setAttribute('aria-modal', enabled ? 'false' : 'true')
    if (!visible || !mask) return undefined
    const background = enabled ? scope.containerRef.current : document.getElementById('root')
    const portal = [...scope.host.children].find((child) => child.contains(dialog))
    const otherOverlays = [...scope.host.children].filter((child) => child !== portal && child.tagName !== 'STYLE')
    const releases = [isolate(background), ...otherOverlays.map(isolate), lockOverlayScroll(enabled ? background : document.body)]
    return () => releases.toReversed().forEach((release) => release())
  }, [node, open, scope, enabled, visible, mask])
}

export default function ScopedOverlayDialog({ children, open = true, mask = true, scoped = true }) {
  const inherited = useOverlayScope()
  const inheritedOpen = useContext(OverlayDialogOpenContext)
  const [node, setNode] = useState(null)
  useOverlayDialog(node, inheritedOpen ?? open, scoped ? inherited : null, mask)
  return <div ref={setNode} className="app-scoped-dialog-content">{children}</div>
}

// 打开期间固定 portal 节点，切换布局不重建正在填写的弹窗。
export function useOverlayContainer(open, explicitContainer) {
  const scope = useOverlayScope()
  const previous = useRef({ open: false, target: undefined, scoped: false })
  if (open && !previous.current.open) {
    const scoped = scope && (scope.portalScoped || scope.enabled || !scope.visible)
    previous.current.target = scoped ? scope.host : scope ? document.body : undefined
    previous.current.scoped = Boolean(scoped)
  }
  previous.current.open = Boolean(open)
  return {
    scope: explicitContainer === undefined && previous.current.scoped ? scope : null,
    getContainer: explicitContainer === undefined ? previous.current.target : explicitContainer,
  }
}
