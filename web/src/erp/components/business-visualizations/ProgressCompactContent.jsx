import React from 'react'
import { Tag } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import { WorkflowTaskBlockedTag, WorkflowTaskBlockedReason } from '../workflow/WorkflowTaskBlocker.jsx'
import {
  progressAttention,
  progressDelivery,
  progressDue,
  progressIdentityPresentation,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'

export function ProgressProductIdentity({ row, compact = false, children }) {
  const identity = progressIdentityPresentation(row)
  const content = children ?? identity.product
  return identity.hasProduct ? (
    <ProductIdentity className="erp-progress-product" productId={row.product_id} name={row.product} compact={compact}>
      {content}
    </ProductIdentity>
  ) : <span className="erp-progress-product erp-progress-product--empty"><span className="erp-task-product-image erp-task-product-image--placeholder" aria-label="未关联产品／物料"><FileTextOutlined aria-hidden="true" /></span>{content}</span>
}

export function ProgressIdentity({ row }) {
  const identity = progressIdentityPresentation(row)
  const content = (
    <span className="erp-progress-identity">
      <strong>
        {identity.product}
      </strong>
      <span className="erp-progress-reference">{identity.reference}</span>
      <span className="erp-progress-customer">
        {identity.customer}
        <Tag>{progressStatusLabel(row.status)}</Tag>
      </span>
    </span>
  )
  return <ProgressProductIdentity row={row} compact>{content}</ProgressProductIdentity>
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

export function ProgressAttention({ row, access, compact = false, suffix }) {
  const attention = progressAttention(row, access)
  const detail = attention.detail ? `${attention.detail}${attention.taskCount > 1 ? ` · 共 ${attention.taskCount} 项待办` : ''}` : ''
  if (compact) {
    return (
      <span className="erp-progress-attention erp-progress-attention--compact">
        <span className="erp-progress-attention-heading">
          <span className="erp-progress-attention-title">
            <strong>{attention.title}</strong>
            {attention.blocked ? <WorkflowTaskBlockedTag /> : null}
          </span>
          {detail ? <span className="erp-progress-attention-owner">{detail}</span> : <span />}
          {suffix}
        </span>
        <WorkflowTaskBlockedReason reason={attention.reason} />
      </span>
    )
  }
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
        <span>{detail}</span>
      )}
    </span>
  )
}
