import React from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'

export function BusinessViewSwitch({
  value,
  onChange,
  options,
  loading = false,
  onReload,
}) {
  return (
    <div className="erp-business-visual-switch">
      <Segmented
        aria-label="页面展示方式"
        value={value}
        options={options}
        onChange={onChange}
      />
      {onReload ? (
        <Button
          className={`erp-business-visual-switch__reload${
            value === 'list' ? ' is-placeholder' : ''
          }`}
          type="text"
          size="small"
          icon={<ReloadOutlined aria-hidden="true" />}
          loading={value !== 'list' && loading}
          aria-hidden={value === 'list'}
          tabIndex={value === 'list' ? -1 : 0}
          onClick={onReload}
        >
          刷新
        </Button>
      ) : null}
    </div>
  )
}

export function BusinessViewSurface({ switcher, children, className = '' }) {
  if (!switcher) return children

  return (
    <div className={`erp-business-view-surface ${className}`.trim()}>
      <div className="erp-business-view-surface__toolbar">{switcher}</div>
      {children}
    </div>
  )
}

export function BusinessVisualizationFrame({
  switcher,
  title,
  metrics = [],
  children,
  className = '',
}) {
  return (
    <section
      className={`erp-business-visual-frame ${className}`.trim()}
      aria-label={title}
    >
      {switcher}
      {metrics.length > 0 ? (
        <div className="erp-business-visual-frame__heading">
          <div className="erp-business-visual-metrics" aria-label="概览数字">
            {metrics.map((metric) => (
              <div
                key={metric.key}
                className={`erp-business-visual-metric erp-business-visual-metric--${metric.tone || 'neutral'}`}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
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
      <div className="erp-business-visual-state erp-business-visual-state--error">
        <span>{error}</span>
        <Button size="small" onClick={onRetry}>
          重新加载
        </Button>
      </div>
    )
  }
  if (empty) {
    return <div className="erp-business-visual-state">当前筛选暂无数据</div>
  }
  return null
}
