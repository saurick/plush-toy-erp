import React from 'react'
import MobileScrollEdge from './MobileScrollEdge.jsx'

export default function MobileTaskListToolbar({
  children,
  hidden = false,
  scrollContainerRef,
}) {
  return (
    <div
      className="mobile-task-list-toolbar"
      data-testid="mobile-task-list-toolbar"
      hidden={hidden}
    >
      {children}
      <MobileScrollEdge
        scrollContainerRef={scrollContainerRef}
        enabled={!hidden}
      />
    </div>
  )
}
