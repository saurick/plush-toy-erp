import React from 'react'

export default function MobileTaskListToolbar({ tabs }) {
  return (
    <div
      className="mobile-task-list-toolbar"
      data-testid="mobile-task-list-toolbar"
    >
      {tabs}
    </div>
  )
}
