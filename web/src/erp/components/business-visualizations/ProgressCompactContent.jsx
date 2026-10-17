import React from 'react'
import { Tag } from 'antd'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import {
  progressAttention,
  progressDelivery,
  progressDue,
  progressProductLabel,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'

export function ProgressIdentity({ row }) {
  const content = (
    <span className="erp-progress-identity">
      <strong>
        {progressProductLabel(row)}
      </strong>
      <span className="erp-progress-reference">{row.order_no}</span>
      <span className="erp-progress-customer">
        {row.customer || (row.unlinked ? '含未关联销售明细' : '客户待补齐')}
        <Tag>{progressStatusLabel(row.status)}</Tag>
      </span>
    </span>
  )
  return row.product_match_count > 0 ? (
    <ProductIdentity productId={row.product_id} name={row.product} preview={false}>
      {content}
    </ProductIdentity>
  ) : content
}

export function ProgressDue({ row, snapshotAt }) {
  const due = progressDue(row, snapshotAt)
  return (
    <span
      className={`erp-progress-due${due.tone ? ` erp-progress-${due.tone}` : ''}`}
    >
      <strong>{due.label}</strong>
      <span>{due.date || '尚未确定'}</span>
    </span>
  )
}

export function ProgressDelivery({
  row,
  showLabel = true,
  showProgress = false,
  onOpenDetails,
}) {
  const delivery = progressDelivery(row)
  return (
    <span className="erp-progress-delivery">
      <span className="erp-progress-delivery-copy">
        {showLabel && <span>{delivery.label}</span>}
        {onOpenDetails &&
        (row.ordered_quantity === null ||
          (row.shipped_quantity === null && row.view === 'orders')) ? (
            <button
              type="button"
              className="erp-progress-quantity-detail"
              onClick={onOpenDetails}
            >
              {delivery.text}
            </button>
        ) : (
          <strong>{delivery.text}</strong>
        )}
      </span>
      {showProgress && delivery.percent > 0 && (
        <span
          className="erp-progress-track"
          role="progressbar"
          aria-label={row.view === 'orders' ? '实际出货比例' : '有效完工比例'}
          aria-valuenow={Math.round(delivery.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${delivery.percent}%` }} />
        </span>
      )}
    </span>
  )
}

export function ProgressAttention({ row, access }) {
  const attention = progressAttention(row, access)
  return (
    <span
      className={`erp-progress-attention${attention.blocked ? ' is-blocked' : ''}`}
    >
      <strong>
        {attention.blocked ? '受阻 · ' : ''}
        {attention.title}
      </strong>
      {attention.reason && (
        <span className="erp-progress-attention-reason">
          {attention.reason}
        </span>
      )}
      {attention.detail && (
        <span>
          {attention.detail}
          {attention.taskCount > 1 ? ` · 共 ${attention.taskCount} 项待办` : ''}
        </span>
      )}
    </span>
  )
}
