import React, { useCallback, useState } from 'react'
import { Drawer } from 'antd'
import { useOverlayContainer, useOverlayDialog } from '../overlay/ScopedOverlayDialog.jsx'
import { canRestoreOverlayFocus } from '../overlay/OverlayScopeContext.mjs'

export default function AppDrawer({ panelRef, getContainer, ...props }) {
  const [panel, setPanel] = useState(null)
  const scoped = useOverlayContainer(props.open, getContainer)
  const attach = useCallback((node) => {
    setPanel(node)
    if (typeof panelRef === 'function') panelRef(node)
    else if (panelRef) panelRef.current = node
  }, [panelRef])
  useOverlayDialog(panel, props.open, scoped.scope, props.mask !== false)
  return <Drawer
    {...props}
    panelRef={attach}
    getContainer={scoped.getContainer}
    afterOpenChange={(open) => {
      const active = document.activeElement
      const keepFocus = !open && scoped.scope && !canRestoreOverlayFocus(scoped.scope)
      props.afterOpenChange?.(open)
      if (keepFocus) queueMicrotask(() => { if (active?.isConnected) active.focus?.({ preventScroll: true }) })
    }}
  />
}
