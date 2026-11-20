import React, { useLayoutEffect, useRef } from 'react'
import { Button } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isProductCoreReadingDestination } from '../config/devProductCoreRelations.mjs'
import '../styles/dev-reading-navigation.css'

// Use the flow reader's existing history frames, including its scroll and focus contract.
export function DevReadingLink({ to, fromLabel, children, className = '', ...props }) {
  const location = useLocation()
  const navigate = useNavigate()
  if (!isProductCoreReadingDestination(to)) return <span>{children}（关联待核对）</span>
  return (
    <Link
      {...props}
      to={to}
      className={`erp-dev-reading-link ${className}`.trim()}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        const frame = {
          pathname: location.pathname,
          search: location.search.replace(/^\?/u, ''),
          label: fromLabel,
          scroll: window.scrollY,
          focus: (event.currentTarget.getAttribute('aria-label') || event.currentTarget.textContent).trim(),
          taskScoped: false,
        }
        navigate(to, { state: {
          ...location.state,
          flowReturnFrames: [...(location.state?.flowReturnFrames || []), frame],
          flowRestoreFrame: null,
          flowTaskContext: false,
        } })
      }}
    >
      {children}
    </Link>
  )
}

export function DevReadingReturn({ ready = true }) {
  const location = useLocation()
  const navigate = useNavigate()
  const frames = location.state?.flowReturnFrames || []
  const previous = frames.at(-1)
  const handledFrame = useRef('')
  useLayoutEffect(() => {
    const frame = location.state?.flowRestoreFrame
    if (!ready || !frame || frame.pathname !== location.pathname) return undefined
    const identity = JSON.stringify([frame.pathname, frame.search, frame.scroll, frame.focus])
    if (handledFrame.current === identity) return undefined
    const observer = new ResizeObserver(restore)
    const contentObserver = new MutationObserver(restore)
    const inputs = ['wheel', 'pointerdown', 'keydown']
    let disposed = false
    const expiry = window.setTimeout(stop, 5000)
    function dispose() {
      disposed = true
      observer.disconnect()
      contentObserver.disconnect()
      window.clearTimeout(expiry)
      inputs.forEach((event) => window.removeEventListener(event, stop, true))
    }
    function stop() {
      if (disposed) return
      handledFrame.current = identity
      dispose()
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
        replace: true,
        state: { ...location.state, flowRestoreFrame: null },
      })
    }
    function restore() {
      if (disposed) return
      const pending = [...document.querySelectorAll('[data-mermaid-status="loading"], [data-graph-status="loading"]')]
        .some((element) => element.getClientRects().length)
      if (pending) return
      window.scrollTo({ top: frame.scroll, behavior: 'instant' })
      if (Math.abs(window.scrollY - frame.scroll) > 1) return
      const target = [...document.querySelectorAll('button,a')].find((element) =>
        element.getClientRects().length &&
        (element.getAttribute('aria-label') || element.textContent).trim() === frame.focus)
      if (!target) return
      target.focus({ preventScroll: true })
      stop()
    }
    observer.observe(document.body)
    contentObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mermaid-status', 'data-graph-status'] })
    inputs.forEach((event) => window.addEventListener(event, stop, true))
    restore()
    return dispose
  }, [ready, location.key, location.pathname, location.search, location.hash, location.state, navigate])
  return previous ? (
    <Button
      type="link"
      icon={<LeftOutlined aria-hidden />}
      onClick={() => navigate({ pathname: previous.pathname, search: previous.search ? `?${previous.search}` : '' }, {
        state: {
          ...location.state,
          flowReturnFrames: frames.slice(0, -1),
          flowRestoreFrame: previous,
          flowTaskContext: previous.taskScoped,
        },
      })}
    >
      返回 {previous.label}
    </Button>
  ) : null
}
