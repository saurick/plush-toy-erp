import React from 'react'
import { Modal } from 'antd'
import SurfacePanel from '@/common/components/layout/SurfacePanel'

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

export default function AppModal({
  open,
  onClose,
  children,
  className = '',
  role = 'dialog',
  ariaLabel = '',
  ariaLabelledBy = '',
  ariaDescribedBy = '',
  initialFocusSelector = '',
}) {
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
        if (!releaseBackgroundIsolationRef.current) {
          releaseBackgroundIsolationRef.current = acquireBackgroundIsolation()
        }
        return
      }
      if (!openRef.current) releaseBackgroundIsolation()
    },
    [initialFocusSelector, releaseBackgroundIsolation]
  )

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={handleAfterOpenChange}
      panelRef={handlePanelRef}
      className="app-modal"
      rootClassName="app-modal-root"
      width="min(640px, calc(100vw - 32px))"
      footer={null}
      closable={false}
      centered
      keyboard
      maskClosable
      focusTriggerAfterClose
      destroyOnHidden
      styles={{
        body: { padding: 0 },
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
    </Modal>
  )
}
