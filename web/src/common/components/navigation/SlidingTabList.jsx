import React from 'react'
import useSlidingIndicator from './useSlidingIndicator'

export default function SlidingTabList({ className = '', children, ...props }) {
  const ref = useSlidingIndicator({
    itemSelector: ':scope > [role="tab"]',
    selectedSelector: ':scope > [role="tab"][aria-selected="true"]',
  })
  return (
    <div
      {...props}
      ref={ref}
      role="tablist"
      className={`erp-sliding-tab-list ${className}`}
    >
      {children}
    </div>
  )
}
