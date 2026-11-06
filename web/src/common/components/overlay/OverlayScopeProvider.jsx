import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ConfigProvider, Modal } from 'antd'
import { canRestoreOverlayFocus, OverlayScopeContext } from './OverlayScopeContext.mjs'
import ScopedOverlayDialog from './ScopedOverlayDialog.jsx'
import { createCenteredModalApi } from '../../utils/antdApp.js'
import './overlay-scope.css'

export default function OverlayScopeProvider({ enabled, visible, portalScoped = false, containerRef, layoutKey, scopeKey, onInteract, onGuardChange, children }) {
  const parent = useContext(ConfigProvider.ConfigContext)
  const inheritedPopup = parent.getPopupContainer
  const [host] = useState(() => document.createElement('div'))
  const latest = useRef(null)
  latest.current = { enabled, visible, portalScoped, onInteract, onGuardChange }
  const [nativeModal, holder] = Modal.useModal()
  const handles = useRef(new Set())
  const guards = useRef(new Map())
  const confirmingLeave = useRef(false)
  const confirmLeave = useCallback(async (options) => {
    if (confirmingLeave.current) return false
    confirmingLeave.current = true
    try {
      for (const guard of [...guards.current.values()].toReversed()) if (!(await guard(options))) return false
      return true
    } finally {
      confirmingLeave.current = false
    }
  }, [])
  const registerGuard = useCallback((owner, guard) => {
    guards.current.set(owner, guard)
    latest.current.onGuardChange?.(confirmLeave)
    return () => {
      if (guards.current.get(owner) === guard) guards.current.delete(owner)
      latest.current.onGuardChange?.(guards.current.size ? confirmLeave : null)
    }
  }, [confirmLeave])
  const focusScope = useRef(null)
  const measureGeometry = useRef(null)
  focusScope.current = { enabled, visible, containerRef, host }
  // 容器已经创建，初次挂载浮层不必等待触发元素；参数仍用于继承外层容器规则。
  const getPopupContainer = useCallback((...args) => {
    const [trigger] = args
    const pane = containerRef.current
    if ((portalScoped || latest.current.enabled || !latest.current.visible) && (!trigger || pane?.contains(trigger) || host.contains(trigger))) return host
    return inheritedPopup?.(trigger) || document.body
  }, [containerRef, host, inheritedPopup, portalScoped])
  useLayoutEffect(() => {
    host.className = 'app-overlay-scope'
    document.body.append(host)
    const interact = () => latest.current.onInteract?.()
    host.addEventListener('pointerdown', interact)
    host.addEventListener('focusin', interact)
    return () => {
      host.removeEventListener('pointerdown', interact)
      host.removeEventListener('focusin', interact)
      host.remove()
    }
  }, [host])
  useLayoutEffect(() => {
    const pane = containerRef.current
    const setGeometry = (name, value) => {
      for (const target of [host, pane]) {
        if (!target) continue
        const property = `--app-overlay-${name}`
        if (value === undefined) target.style.removeProperty(property)
        else if (target.style.getPropertyValue(property) !== value) target.style.setProperty(property, value)
      }
    }
    host.hidden = !visible
    if (!enabled || !visible) {
      for (const name of ['left', 'top', 'width', 'height']) setGeometry(name)
      return undefined
    }
    let frame = 0
    const measure = () => {
      frame = 0
      const rect = enabled && pane ? pane.getBoundingClientRect() : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
      host.hidden = !visible
      for (const [name, value] of Object.entries({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })) {
        setGeometry(name, `${value}px`)
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const flush = () => {
      cancelAnimationFrame(frame)
      measure()
    }
    const scroll = (event) => {
      const { target } = event
      if (target === document || target === window || (target instanceof Element && target !== pane && target.contains(pane))) schedule()
    }
    measureGeometry.current = flush
    measure()
    const resize = new ResizeObserver(schedule)
    if (containerRef.current) resize.observe(containerRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', scroll, true)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', scroll, true)
      cancelAnimationFrame(frame)
      measureGeometry.current = null
      for (const name of ['left', 'top', 'width', 'height']) setGeometry(name)
    }
  }, [containerRef, host, enabled, visible])
  useLayoutEffect(() => { measureGeometry.current?.() }, [layoutKey])
  const modal = useMemo(() => createCenteredModalApi(Object.fromEntries([
    ...['confirm', 'info', 'success', 'warning', 'error'].map((method) => [method, (config = {}) => {
      const scoped = (latest.current.portalScoped || latest.current.enabled || !latest.current.visible) && config.getContainer === undefined
      const trigger = document.activeElement
      const instance = nativeModal[method]({
        ...config,
        getContainer: config.getContainer ?? (scoped ? host : document.body),
        focusTriggerAfterClose: scoped ? false : config.focusTriggerAfterClose,
        modalRender: (content) => {
          const body = scoped ? <ScopedOverlayDialog mask={config.mask !== false}>{content}</ScopedOverlayDialog> : content
          return config.modalRender ? config.modalRender(body) : body
        },
        afterClose: () => {
          handles.current.delete(instance)
          if (scoped && config.focusTriggerAfterClose !== false && canRestoreOverlayFocus(focusScope.current) && trigger?.isConnected) trigger.focus?.({ preventScroll: true })
          config.afterClose?.()
        },
      })
      handles.current.add(instance)
      return instance
    }]),
    ['destroyAll', () => { handles.current.forEach((instance) => instance.destroy()); handles.current.clear() }],
  ])), [host, nativeModal])
  useEffect(() => () => modal.destroyAll(), [modal, scopeKey])
  const value = useMemo(() => ({ enabled, visible, portalScoped, containerRef, host, modal, registerGuard, scopeKey }), [enabled, visible, portalScoped, containerRef, host, modal, registerGuard, scopeKey])
  const modalConfig = useMemo(() => enabled ? ({
    ...parent.modal,
    style: { ...parent.modal?.style, maxWidth: 'calc(var(--erp-overlay-width, 100vw) - 32px)' },
    styles: {
      ...parent.modal?.styles,
      content: { ...parent.modal?.styles?.content, maxHeight: 'calc(var(--erp-overlay-height, 100dvh) - var(--erp-modal-viewport-gap, 32px))', display: 'flex', flexDirection: 'column' },
      body: { ...parent.modal?.styles?.body, minHeight: 0, overflowY: 'auto' },
    },
  }) : parent.modal, [enabled, parent.modal])
  const drawerConfig = useMemo(() => enabled ? ({ ...parent.drawer, styles: { ...parent.drawer?.styles, wrapper: { ...parent.drawer?.styles?.wrapper, maxWidth: '100%' } } }) : parent.drawer, [enabled, parent.drawer])
  return (
    <OverlayScopeContext.Provider value={value}>
      <ConfigProvider getPopupContainer={getPopupContainer} modal={modalConfig} drawer={drawerConfig}>
        {children}
        {holder}
      </ConfigProvider>
    </OverlayScopeContext.Provider>
  )
}
