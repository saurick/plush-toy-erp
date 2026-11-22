import React, { useCallback, useEffect, useRef } from 'react'
import { Button, Popover } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import './anchoredControlPopover.css'

const overflow = { adjustX: true, adjustY: true, shiftX: true, shiftY: true }

export default function AnchoredControlPopover({ classNames, afterOpenChange, ...props }) {
  const overlay = useRef(null)
  const frame = useRef(null)
  const alignPointer = useCallback(() => {
    window.cancelAnimationFrame(frame.current)
    frame.current = window.requestAnimationFrame(() => {
      const { nativeElement: trigger, popupElement: popup } = overlay.current ?? {}
      if (!trigger || !popup?.offsetWidth) return
      const anchor = trigger.getBoundingClientRect()
      const surface = popup.getBoundingClientRect()
      const scale = surface.width / popup.offsetWidth
      if (scale > 0) {
        const center = (anchor.left + anchor.width / 2 - surface.left) / scale
        popup.style.setProperty('--erp-anchored-control-pointer-x', `${center}px`)
      }
    })
  }, [])
  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  return (
    <Popover
      {...props}
      ref={overlay}
      arrow
      autoAdjustOverflow={overflow}
      classNames={{ ...classNames, root: ['erp-anchored-control-popover', classNames?.root].filter(Boolean).join(' ') }}
      onPopupAlign={alignPointer}
      afterOpenChange={(open) => {
        if (open) alignPointer()
        afterOpenChange?.(open)
      }}
    />
  )
}

export function FilterPopoverLabel({ count, labelClassName }) {
  return (
    <>
      <FilterOutlined aria-hidden="true" />
      <span className={labelClassName}>筛选</span>
      {count > 0 && <span className="erp-control-count" aria-hidden="true">{count}</span>}
    </>
  )
}

export const FilterPopoverButton = React.forwardRef(({ count = 0, className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      aria-haspopup="dialog"
      aria-label={count > 0 ? `筛选，已应用 ${count} 项` : '筛选'}
      {...props}
      className={['erp-anchored-control-trigger', className].filter(Boolean).join(' ')}
      data-active={count > 0 || undefined}
    >
      <FilterPopoverLabel count={count} />
    </Button>
  )
})

FilterPopoverButton.displayName = 'FilterPopoverButton'
