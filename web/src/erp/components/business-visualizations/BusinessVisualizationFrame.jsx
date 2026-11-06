import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, } from 'react-router-dom'
import { Button } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import Pagination from '@/common/components/pagination/AppPagination'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import FilterChip from '@/common/components/navigation/FilterChip'
import OverlayScopeProvider from '@/common/components/overlay/OverlayScopeProvider.jsx'
import { useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'

export function BusinessViewPanel({ active, viewKey, pending = false, markView = true, children }) {
  const parent = useOverlayScope()
  const rootRef = useRef(null)
  const owner = useRef(Symbol('business-view')).current
  const releaseGuard = useRef(null)
  const registerParentGuard = parent?.registerGuard
  const onGuardChange = useCallback((guard) => {
    releaseGuard.current?.()
    releaseGuard.current = guard ? registerParentGuard?.(owner, guard) : null
  }, [owner, registerParentGuard])
  useEffect(() => () => releaseGuard.current?.(), [])
  const visible = parent?.visible !== false && active && !pending
  return (
    <OverlayScopeProvider enabled={parent?.enabled === true} visible={visible} portalScoped containerRef={parent?.containerRef || rootRef} scopeKey={viewKey} onGuardChange={onGuardChange}>
      <div ref={rootRef} className="erp-business-view-panel" data-business-view-panel={markView ? viewKey : undefined} hidden={!active} inert={!visible ? '' : undefined} aria-hidden={pending || undefined} data-switch-pending={pending || undefined} data-scroll-edges={!visible ? 'off' : undefined}>
        {children}
      </div>
    </OverlayScopeProvider>
  )
}

export function BusinessViewPanels({ activeView, views, children }) {
  const enabled = views.includes(activeView)
  const cached = useRef(new Map())
  const [visited, setVisited] = useState(() => new Set(enabled ? [activeView] : []))
  useLayoutEffect(() => {
    if (!enabled) {
      cached.current.clear()
      setVisited((current) => current.size ? new Set() : current)
      return
    }
    cached.current.set(activeView, children)
    for (const key of cached.current.keys()) {
      if (!views.includes(key)) cached.current.delete(key)
    }
    setVisited((current) => {
      const keys = [...current].filter((key) => views.includes(key))
      return current.has(activeView) && keys.length === current.size
        ? current
        : new Set([...keys, activeView])
    })
  }, [activeView, children, enabled, views])
  if (!enabled) return children
  return views.filter((key) => key === activeView || visited.has(key)).map((key) => (
    <BusinessViewPanel key={key} viewKey={key} active={key === activeView}>
      {key === activeView ? children : cached.current.get(key)}
    </BusinessViewPanel>
  ))
}

export function VisualizationPagination({ pagination, onChange }) {
  return (
    <div className="erp-business-visual-pagination">
      <Pagination
        current={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showSizeChanger={false}
        onChange={onChange}
      />
    </div>
  )
}

export function BusinessViewSwitch({ value, onChange, onReselect, options, appearance = 'tabs', 'aria-label': ariaLabel = '页面展示方式' }) {
  return (
    <div className="erp-business-visual-switch">
      <SlidingTabList
        aria-label={ariaLabel}
        appearance={appearance}
        value={value}
        options={options}
        onChange={onChange}
        onReselect={onReselect}
      />
    </div>
  )
}

export function BusinessViewSurface({
  switcher,
  children,
  className = '',
  activeView,
  loading = false,
  preserveViews,
}) {
  const rootRef = useRef(null)
  const context = useBusinessPageContext()
  const { pathname } = useLocation()
  const localPositions = useRef(new Map())
  const positions = context?.pageUIState?.values || localPositions.current
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !activeView || loading) return undefined
    const key = `${pathname}:scroll:${activeView}`
    const activeRoot = root.querySelector(':scope > [data-business-view-panel]:not([hidden])') || root
    const targets = [
      document.scrollingElement,
      root.closest('.erp-admin-content'),
      ...activeRoot.querySelectorAll('.ant-table-body, .ant-table-content'),
    ].filter(Boolean)
    const saved = positions.get(key)
    if (saved) {
      targets.forEach((element, index) => {
        if (saved[index]) element.scrollTo(saved[index].left, saved[index].top)
      })
    }
    const record = () =>
      positions.set(
        key,
        targets.map((element) => ({
          left: element.scrollLeft,
          top: element.scrollTop,
        }))
      )
    targets.forEach((element) =>
      element.addEventListener('scroll', record, { passive: true })
    )
    return () =>
      targets.forEach((element) =>
        element.removeEventListener('scroll', record)
      )
  }, [activeView, loading, pathname, positions])
  return (
    <div
      ref={rootRef}
      className={`erp-business-view-surface ${className}`.trim()}
    >
      {switcher ? (
        <div className="erp-business-view-surface__toolbar">{switcher}</div>
      ) : null}
      {preserveViews ? <BusinessViewPanels activeView={activeView} views={preserveViews}>{children}</BusinessViewPanels> : children}
    </div>
  )
}

export function BusinessVisualizationFrame({
  switcher,
  title,
  toolbar = null,
  metrics = [],
  metricsLabel = '',
  countUnit = '',
  loading = false,
  error = '',
  children,
  className = '',
}) {
  const formatCount = (value) =>
    loading || error ? '—' : countUnit ? `${value} ${countUnit}` : value
  return (
    <section
      className={`erp-business-visual-frame ${className}`.trim()}
      aria-label={title}
      aria-busy={loading || undefined}
    >
      {switcher}
      {toolbar || metrics.length > 0 ? (
        <div className="erp-business-visual-frame__heading">
          {toolbar ? (
            <div className="erp-business-visual-frame__toolbar">{toolbar}</div>
          ) : null}
          {metricsLabel ? (
            <span className="erp-business-visual-frame__metrics-label">
              {metricsLabel}
            </span>
          ) : null}
          <div
            className="erp-business-visual-metrics"
            aria-label={metricsLabel || '概览数字'}
          >
            {metrics.map((metric) =>
              metric.onClick ? (
                <FilterChip
                  key={metric.key}
                  selected={metric.selected}
                  count={formatCount(metric.value)}
                  disabled={loading || Boolean(error)}
                  onClick={metric.onClick}
                  className={`erp-business-visual-filter erp-business-visual-metric--${metric.tone || 'neutral'}`}
                >
                  {metric.label}
                </FilterChip>
              ) : (
                <div
                  key={metric.key}
                  className={`erp-business-visual-metric erp-business-visual-metric--${metric.tone || 'neutral'}`}
                >
                  <span>{metric.label}</span>
                  <strong>{formatCount(metric.value)}</strong>
                </div>
              )
            )}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function VisualizationState({ loading, error, empty, onRetry }) {
  if (loading) {
    return (
      <div className="erp-business-visual-state" role="status">
        正在读取当前筛选的完整数据…
      </div>
    )
  }
  if (error) {
    return (
      <div
        className="erp-business-visual-state erp-business-visual-state--error"
        role="alert"
      >
        <span>{error}</span>
        <Button size="small" onClick={onRetry}>
          重新加载
        </Button>
      </div>
    )
  }
  if (empty) {
    return <Empty description="当前筛选暂无数据" />
  }
  return null
}
