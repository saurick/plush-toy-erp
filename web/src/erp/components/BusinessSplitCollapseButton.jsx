import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Tooltip } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'

export default function BusinessSplitCollapseButton({ onClick, visible }) {
  const scope = useOverlayScope()
  const anchor = useRef(null)
  const control = useRef(null)
  const [isolated, setIsolated] = useState(false)
  const pane = scope?.containerRef.current
  const enabled = Boolean(scope?.enabled && scope.visible && visible)
  useLayoutEffect(() => {
    if (!enabled || !pane) return undefined
    const update = () => setIsolated(Boolean(anchor.current?.getClientRects().length && anchor.current.closest('[inert]')))
    update()
    const observer = new MutationObserver(update)
    observer.observe(pane, { attributes: true, attributeFilter: ['inert'], subtree: true })
    return () => observer.disconnect()
  }, [enabled, pane])
  useLayoutEffect(() => {
    if (!enabled || !anchor.current || !control.current) return undefined
    const boundary = anchor.current.closest('.erp-business-page-header-card, .erp-business-form-page__header, .erp-split-fallback-header') || anchor.current.parentElement
    return scope.registerChromeControl(anchor.current, control.current, boundary)
  }, [enabled, isolated, scope])
  const button = (ref) => <Tooltip title="收起分栏"><Button ref={ref} icon={<CloseOutlined />} aria-label="收起分栏" onClick={onClick} /></Tooltip>
  return (
    <>
      {button(anchor)}
      {scope ? createPortal(<div ref={control} className="app-overlay-chrome-control" hidden={!enabled || !isolated}>{button()}</div>, scope.chromeHost) : null}
    </>
  )
}
