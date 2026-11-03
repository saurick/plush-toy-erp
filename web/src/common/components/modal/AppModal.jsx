import React from 'react'
import { Modal } from 'antd'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import ScopedOverlayDialog, { useOverlayContainer } from '../overlay/ScopedOverlayDialog.jsx'
import { canRestoreOverlayFocus, OverlayDialogOpenContext, useOverlayScope } from '../overlay/OverlayScopeContext.mjs'

function ScopedModal({ getContainer, modalRender, afterOpenChange, focusTriggerAfterClose = true, ...props }) {
  const scoped = useOverlayContainer(props.open, getContainer)
  const trigger = React.useRef(null)
  const previous = React.useRef(false)
  if (props.open && !previous.current && typeof document !== 'undefined') trigger.current = document.activeElement
  previous.current = props.open
  return (
    <OverlayDialogOpenContext.Provider value={props.open}>
      <Modal
        {...props}
        getContainer={scoped.getContainer}
        focusTriggerAfterClose={scoped.scope ? false : focusTriggerAfterClose}
        afterOpenChange={(open) => {
          if (!open && scoped.scope && focusTriggerAfterClose && canRestoreOverlayFocus(scoped.scope) && trigger.current?.isConnected) trigger.current.focus?.({ preventScroll: true })
          afterOpenChange?.(open)
        }}
        modalRender={(content) => {
          const body = scoped.scope ? <ScopedOverlayDialog open={props.open} mask={props.mask !== false}>{content}</ScopedOverlayDialog> : content
          return modalRender ? modalRender(body) : body
        }}
      />
    </OverlayDialogOpenContext.Provider>
  )
}

const backgroundIsolationStates = new WeakMap()

function setOptionalAttribute(element, name, value) {
  if (!element) return
  if (value) {
    element.setAttribute(name, value)
    return
  }
  element.removeAttribute(name)
}

function acquireBackgroundIsolation() {
  const appRoot = document.getElementById('root')
  if (!(appRoot instanceof HTMLElement)) return () => {}

  let state = backgroundIsolationStates.get(appRoot)
  if (state) {
    state.count += 1
  } else {
    state = {
      count: 1,
      hadInert: appRoot.hasAttribute('inert'),
      ariaHidden: appRoot.getAttribute('aria-hidden'),
    }
    backgroundIsolationStates.set(appRoot, state)
    appRoot.setAttribute('inert', '')
    appRoot.setAttribute('aria-hidden', 'true')
  }

  let released = false
  return () => {
    if (released) return
    released = true

    const activeState = backgroundIsolationStates.get(appRoot)
    if (!activeState) return
    activeState.count -= 1
    if (activeState.count > 0) return

    if (!activeState.hadInert) appRoot.removeAttribute('inert')
    if (activeState.ariaHidden === null) {
      appRoot.removeAttribute('aria-hidden')
    } else {
      appRoot.setAttribute('aria-hidden', activeState.ariaHidden)
    }
    backgroundIsolationStates.delete(appRoot)
  }
}

function PanelModal({
  open,
  onClose,
  children,
  className = '',
  role = 'dialog',
  ariaLabel = '',
  ariaLabelledBy = '',
  ariaDescribedBy = '',
  initialFocusSelector = '',
  busy = false,
}) {
  const scope = useOverlayScope()
  const dialogRef = React.useRef(null)
  const openRef = React.useRef(open)
  const releaseBackgroundIsolationRef = React.useRef(null)
  openRef.current = open

  const releaseBackgroundIsolation = React.useCallback(() => {
    releaseBackgroundIsolationRef.current?.()
    releaseBackgroundIsolationRef.current = null
  }, [])

  React.useLayoutEffect(() => {
    if (!open) releaseBackgroundIsolation()
  }, [open, releaseBackgroundIsolation])

  React.useEffect(
    () => () => releaseBackgroundIsolation(),
    [releaseBackgroundIsolation]
  )

  const handlePanelRef = React.useCallback(
    (element) => {
      const dialogElement = element?.closest?.('.ant-modal') || element
      dialogRef.current = dialogElement || null
      if (!dialogElement) return

      dialogElement.setAttribute('role', role)
      setOptionalAttribute(dialogElement, 'aria-label', ariaLabel)
      setOptionalAttribute(dialogElement, 'aria-labelledby', ariaLabelledBy)
      setOptionalAttribute(dialogElement, 'aria-describedby', ariaDescribedBy)
    },
    [ariaDescribedBy, ariaLabel, ariaLabelledBy, role]
  )

  const handleAfterOpenChange = React.useCallback(
    (isOpen) => {
      if (isOpen) {
        if (initialFocusSelector) {
          const initialFocusElement =
            dialogRef.current?.querySelector(initialFocusSelector)
          if (initialFocusElement instanceof HTMLElement) {
            initialFocusElement.focus({ preventScroll: true })
          }
        }
        if (!scope?.host.contains(dialogRef.current) && !releaseBackgroundIsolationRef.current) {
          releaseBackgroundIsolationRef.current = acquireBackgroundIsolation()
        }
        return
      }
      if (!openRef.current) releaseBackgroundIsolation()
    },
    [initialFocusSelector, releaseBackgroundIsolation, scope?.host]
  )

  return (
    <ScopedModal
      open={open}
      onCancel={busy ? undefined : onClose}
      afterOpenChange={handleAfterOpenChange}
      panelRef={handlePanelRef}
      className="app-modal"
      rootClassName="app-modal-root"
      width="min(640px, calc(100vw - 32px))"
      footer={null}
      closable={false}
      centered
      keyboard={!busy}
      maskClosable={!busy}
      focusTriggerAfterClose
      destroyOnHidden
      styles={{
        body: { padding: 0, minHeight: 0, maxHeight: 'calc(var(--erp-overlay-height, 100dvh) - 32px)', overflowY: 'auto' },
        content: {
          padding: 0,
          overflow: 'visible',
          border: 0,
          background: 'transparent',
          boxShadow: 'none',
        },
        mask: {
          background: 'rgb(2 6 23 / 72%)',
          backdropFilter: 'blur(4px)',
        },
      }}
    >
      <SurfacePanel
        className={`relative z-10 w-full max-w-[640px] px-6 py-6 sm:px-8 sm:py-8 ${className}`}
      >
        {children}
      </SurfacePanel>
    </ScopedModal>
  )
}

export default function AppModal({ variant = 'standard', ...props }) {
  if (variant === 'panel') return <PanelModal {...props} />
  return <ScopedModal {...props} />
}
