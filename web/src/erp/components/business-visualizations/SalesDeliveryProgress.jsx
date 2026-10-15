import React, { useMemo } from 'react'
import { Progress } from 'antd'
import {
  buildSalesDeliveryModel,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationPagination,
} from './BusinessVisualizationFrame.jsx'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import WorkflowTaskCard from '../workflow/WorkflowTaskCard.jsx'

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
  viewState = {},
  onViewStateChange,
}) {
  const model = useMemo(() => buildSalesDeliveryModel(items), [items])
  const filter = viewState.filter || 'all'
  const filtered = model.rows.filter(
    (row) => filter === 'all' || row.status.key === filter
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const { rows } = pagination
  const changeFilter = (next) =>
    onViewStateChange?.({ ...viewState, filter: next, page: 1 })

  return (
    <BusinessVisualizationFrame
      className="erp-sales-delivery-visual"
      switcher={switcher}
      title="销售交付进度"
      loading={loading}
      error={error}
      metrics={[
        {
          key: 'all',
          label: '全部',
          value: model.counts.total,
          tone: 'neutral',
        },
        {
          key: 'overdue',
          label: '逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'closed',
          label: '关闭未交完',
          value: model.counts.closed,
          tone: 'warning',
        },
        {
          key: 'dueSoon',
          label: '7 天内',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'unscheduled',
          label: '未排交期',
          value: model.counts.unscheduled,
          tone: 'neutral',
        },
        {
          key: 'unknown',
          label: '待核对',
          value: model.counts.unknown,
          tone: 'neutral',
        },
        {
          key: 'delivered',
          label: '已交付',
          value: model.counts.delivered,
          tone: 'success',
        },
      ].map((metric) => ({
        ...metric,
        selected: filter === metric.key,
        onClick: () => changeFilter(metric.key),
      }))}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && filtered.length === 0}
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
            <WorkflowTaskCard
              as="article"
              key={row.id}
              className="erp-business-visual-list__row"
              contentClassName="erp-business-visual-list__row-content"
              label={`打开销售订单 ${row.orderNo}`}
              onOpen={() => onOpen?.(row)}
            >
              <span className="erp-business-visual-identity">
                <strong>{row.orderNo}</strong>
                <span>{row.customerName}</span>
                <ProductIdentity
                  productId={row.productID}
                  name={row.productName}
                  code={row.customerProductNo}
                  compact
                />
              </span>
              <span className="erp-business-visual-date">
                <small className="erp-business-visual-mobile-label">
                  交付日期{' '}
                </small>
                {row.deliveryDate || '未填写'}
              </span>
              <span className="erp-business-visual-progress">
                {row.progressKnown ? (
                  <Progress
                    percent={row.percent}
                    showInfo={false}
                    status={
                      row.status.key === 'overdue' ? 'exception' : 'normal'
                    }
                    size="small"
                  />
                ) : (
                  <span className="erp-business-visual-unknown">—</span>
                )}
                <small>
                  {row.progressKnown
                    ? `${quantityText(row.shipped, row.unitName)} / ${quantityText(row.ordered, row.unitName)}`
                    : '出货数量待核对'}
                </small>
              </span>
              <span className="erp-business-visual-quantity">
                <small className="erp-business-visual-mobile-label">
                  剩余待交{' '}
                </small>
                {quantityText(row.remaining, row.unitName)}
              </span>
              <span
                className={`erp-business-visual-status erp-business-visual-status--${row.status.key}`}
              >
                {row.status.label}
              </span>
            </WorkflowTaskCard>
          ))}
          <VisualizationPagination
            pagination={pagination}
            onChange={(page) => onViewStateChange?.({ ...viewState, page })}
          />
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
