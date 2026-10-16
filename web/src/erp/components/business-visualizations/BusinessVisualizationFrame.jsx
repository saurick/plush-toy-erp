import React, { useLayoutEffect, useRef } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { Button, Empty, Pagination } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import FilterChip from '@/common/components/navigation/FilterChip'

export function VisualizationPagination({ pagination, onChange }) {
  return (
    <div className="erp-business-visual-pagination">
      <Pagination
        current={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showSizeChanger={false}
        showTotal={(total) => `共 ${total} 条，每页 ${pagination.pageSize} 条`}
        onChange={onChange}
      />
    </div>
  )
}

export function BusinessViewSwitch({ value, onChange, options }) {
  return (
    <div className="erp-business-visual-switch">
      <Segmented
        aria-label="页面展示方式"
        value={value}
        options={options}
        onChange={onChange}
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
}) {
  const rootRef = useRef(null)
  const context = useOutletContext()
  const { pathname } = useLocation()
  const localPositions = useRef(new Map())
  const positions = context?.pageUIState?.values || localPositions.current
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !activeView || loading) return undefined
    const key = `${pathname}:scroll:${activeView}`
    const targets = [
      document.scrollingElement,
      root.closest('.erp-admin-content'),
      ...root.querySelectorAll('.ant-table-body, .ant-table-content'),
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
      {children}
    </div>
  )
}

export function BusinessVisualizationFrame({
  switcher,
  title,
  metrics = [],
  loading = false,
  error = '',
  children,
  className = '',
}) {
  return (
    <section
      className={`erp-business-visual-frame ${className}`.trim()}
      aria-label={title}
      aria-busy={loading || undefined}
    >
      {switcher}
      {metrics.length > 0 ? (
        <div className="erp-business-visual-frame__heading">
          <div className="erp-business-visual-metrics" aria-label="概览数字">
            {metrics.map((metric) =>
              metric.onClick ? (
                <FilterChip
                  key={metric.key}
                  selected={metric.selected}
                  count={loading || error ? '—' : metric.value}
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
                  <strong>{loading || error ? '—' : metric.value}</strong>
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
