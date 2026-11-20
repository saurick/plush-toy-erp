import React from 'react'
import './horizontalScroll.css'

export default function HorizontalScroll({
  className = '',
  children,
  onFocusCapture,
  ...props
}) {
  return (
    <div
      {...props}
      className={`erp-horizontal-scroll ${className}`}
      onFocusCapture={(event) => {
        onFocusCapture?.(event)
        if (!event.defaultPrevented && event.target.matches(':focus-visible')) {
          event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }}
    >
      {children}
    </div>
  )
}
