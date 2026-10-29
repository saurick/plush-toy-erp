import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BusinessEditorPaneContext } from './BusinessFormPageContext.js'

export function BusinessEditorPane({ value, label, active, children }) {
  const presentation = useMemo(() => ({ active, value }), [active, value])
  return (
    <BusinessEditorPaneContext.Provider value={presentation}>
      <section aria-label={label} hidden={!active} data-business-editor-pane={value}>
        {children}
      </section>
    </BusinessEditorPaneContext.Provider>
  )
}

// Contextual entries open complete editors; inactive editors retain their drafts.
export default function BusinessEditorWorkspace({ open, toolbar, children }) {
  const rootRef = useRef(null)
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    if (!open) return undefined
    const root = rootRef.current
    const scroller = root.closest('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
    const steps = scroller?.querySelector('.erp-task-action-drawer__navigation')
    const update = () => setTop(steps?.offsetHeight || 0)
    const resize = new ResizeObserver(update)
    if (steps) resize.observe(steps)
    if (scroller) resize.observe(scroller)
    update()
    return () => resize.disconnect()
  }, [open])
  return (
    <div ref={rootRef} className="erp-business-editor-workspace" data-business-editor-workspace hidden={!open} style={{ '--erp-editor-workspace-top': `${top}px` }}>
      {toolbar ? (
        <div className="erp-business-editor-workspace__navigation" data-business-editor-navigation>
          {toolbar}
        </div>
      ) : null}
      <div className="erp-business-editor-workspace__content">{children}</div>
    </div>
  )
}
