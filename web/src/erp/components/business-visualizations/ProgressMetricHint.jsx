import React, { useState } from 'react'
import { Popover } from 'antd'
import './businessProgressSummary.css'

export function ProgressHint({ label, content, children, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={['hover', 'focus', 'click']}
      placement="top"
      content={content}
    >
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          // 触屏会依次触发 focus 和 click，保持首次点按的提示打开。
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        {children}
      </button>
    </Popover>
  )
}

// 数值提示与进入明细分开，触屏点按不会在读到口径前离开当前视图。
export default function ProgressMetricHint({
  row,
  metric,
  children,
  className = '',
}) {
  return (
    <ProgressHint
      className={`erp-progress-metric-trigger ${className}`}
      label={`查看${metric.label}数值与口径`}
      content={
        <div className="erp-progress-metric-hint">
          <strong>
            {row.order_no} · {metric.label}
          </strong>
          <span>{metric.value}</span>
          {metric.percent !== undefined && (
            <span>完成比例 {Math.round(metric.percent)}%</span>
          )}
          <p>{metric.note}</p>
        </div>
      }
    >
      {children}
    </ProgressHint>
  )
}
