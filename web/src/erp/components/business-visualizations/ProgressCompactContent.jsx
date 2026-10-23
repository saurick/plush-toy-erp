import React from 'react'
import { Tag } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import ProgressMetricHint from './ProgressMetricHint.jsx'
import { WorkflowTaskBlockedTag } from '../workflow/WorkflowTaskBlocker.jsx'
import WorkflowTaskReason from '../workflow/WorkflowTaskReason.jsx'
import {
  progressAttention,
  progressDelivery,
  progressDeliveryDetails,
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

export function ProgressIdentity({ row, onOpen }) {
  const identity = progressIdentityPresentation(row)
  const content = (
    <span className="erp-progress-identity">
      {onOpen ? (
        <button
          type="button"
          className="erp-progress-row-open"
          data-task-entry
          aria-label={`查看 ${row.order_no} 完整进度`}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true })
            onOpen()
          }}
        >
          {identity.product}
        </button>
      ) : <strong>{identity.product}</strong>}
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
        <ProgressMetricHint row={row} metric={progressDeliveryDetails(row)}>
          <span
            className="erp-progress-track"
            role="progressbar"
            aria-label={row.view === 'orders' ? '实际出货比例' : '有效完工比例'}
            aria-valuenow={Math.round(delivery.percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={delivery.text}
          >
            <i style={{ width: `${delivery.percent}%` }} />
          </span>
        </ProgressMetricHint>
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
          {(detail || suffix) && (
            <span className="erp-progress-attention-owner">
              {detail && <span>{detail}</span>}
              {suffix}
            </span>
          )}
        </span>
        <WorkflowTaskReason meta={{ kind: 'blocked', value: attention.reason }} showLabel={false} />
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
