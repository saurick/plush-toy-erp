import React, { useMemo, useState } from 'react'
import { Button, Progress } from 'antd'
import { buildSalesDeliveryModel } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

const INITIAL_VISIBLE_ROWS = 12

function quantityText(value, unitName) {
  return value === null ? '—' : `${value} ${unitName}`
}

export default function SalesDeliveryProgress({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  switcher,
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS)
  const model = useMemo(() => buildSalesDeliveryModel(items), [items])
  const rows = model.rows.slice(0, visibleCount)

  return (
    <BusinessVisualizationFrame
      className="erp-sales-delivery-visual"
      switcher={switcher}
      title="销售交付进度"
      metrics={[
        {
          key: 'overdue',
          label: '逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'due-soon',
          label: '7 天内',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'unknown',
          label: '待核对',
          value: model.counts.unknown,
        },
        {
          key: 'delivered',
          label: '已交付',
          value: model.counts.delivered,
          tone: 'success',
        },
      ]}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && model.rows.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && rows.length > 0 ? (
        <div className="erp-business-visual-list">
          <div className="erp-business-visual-list__columns" aria-hidden="true">
            <span>订单 / 客户 / 产品</span>
            <span>交付日期</span>
            <span>出货进度</span>
            <span>剩余待交</span>
            <span>状态</span>
          </div>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="erp-business-visual-list__row"
              onClick={() => onOpen?.(row)}
            >
              <span className="erp-business-visual-identity">
                <strong>{row.orderNo}</strong>
                <span>{row.customerName}</span>
                <small>
                  {row.productName}
                  {row.customerProductNo ? ` · ${row.customerProductNo}` : ''}
                </small>
              </span>
              <span className="erp-business-visual-date">
                {row.deliveryDate || '未填写'}
              </span>
              <span className="erp-business-visual-progress">
                <Progress
                  percent={row.percent || 0}
                  showInfo={false}
                  status={row.status.key === 'overdue' ? 'exception' : 'normal'}
                  size="small"
                />
                <small>
                  {row.progressKnown
                    ? `${quantityText(row.shipped, row.unitName)} / ${quantityText(row.ordered, row.unitName)}`
                    : '出货数量待核对'}
                </small>
              </span>
              <span className="erp-business-visual-quantity">
                {quantityText(row.remaining, row.unitName)}
              </span>
              <span
                className={`erp-business-visual-status erp-business-visual-status--${row.status.key}`}
              >
                {row.status.label}
              </span>
            </button>
          ))}
          {model.rows.length > rows.length ? (
            <Button
              type="text"
              className="erp-business-visual-more"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              再显示 {Math.min(20, model.rows.length - rows.length)} 条
            </Button>
          ) : null}
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
