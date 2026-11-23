import React, { useCallback } from 'react'
import { Button, Tag } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import ProductIdentity, { ProductThumbnail } from '../master-data/ProductIdentity.jsx'
import BusinessProductGallery from '../business-list/BusinessProductGallery.jsx'
import { BusinessCopyField } from '../business-list/BusinessCopyButton.jsx'
import { canReadDocumentProductGallery } from '../business-list/BusinessDocumentProductGallery.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { loadDocumentGalleryProducts } from '../../api/documentProductGalleryApi.mjs'
import { DOCUMENT_PRODUCT_SOURCES } from '../../utils/businessProductGallery.mjs'
import ProgressMetricHint from './ProgressMetricHint.jsx'
import { VisualizationStatus } from './BusinessVisualizationFrame.jsx'
import { WorkflowTaskBlockedTag } from '../workflow/WorkflowTaskBlocker.jsx'
import WorkflowTaskImagePlaceholder from '../workflow/WorkflowTaskImagePlaceholder.jsx'
import WorkflowTaskReason from '../workflow/WorkflowTaskReason.jsx'
import {
  progressAttention,
  progressDelivery,
  progressDeliveryDetails,
  progressDue,
  progressIdentityPresentation,
  progressLineStatus,
  progressQuantity,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'

export function ProgressProductIdentity({ row, compact = false, children }) {
  const { adminProfile } = useBusinessPageContext() || {}
  const source = row.view === 'production' ? DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER : DOCUMENT_PRODUCT_SOURCES.SALES_ORDER
  const loadProducts = useCallback((options) => loadDocumentGalleryProducts(source, row.id, { ...options, includeCanceledSalesLines: false }), [source, row.id])
  const identity = progressIdentityPresentation(row)
  const placeholder = identity.hasProduct && !(row.product_id > 0)
    ? <WorkflowTaskImagePlaceholder item={{ name: row.product }} />
    : undefined
  const multiple = row.linked_product_count > 1 && canReadDocumentProductGallery(adminProfile, source)
  const gallery = multiple ? (
    <BusinessProductGallery
      key={`${source}:${row.id}:${row.updated_at}`}
      products={[{ productID: row.product_id, name: row.product }]}
      productCount={row.linked_product_count}
      title={identity.reference}
      loadProducts={loadProducts}
      compact
      renderThumbnail={(product) => <ProductThumbnail productId={product.productID} name={product.name} code={product.code} preview={false} />}
    >
      {placeholder ?? <ProductThumbnail productId={row.product_id} name={row.product} preview={false} />}
    </BusinessProductGallery>
  ) : undefined
  const content = children ?? identity.product
  return identity.hasProduct ? (
    <ProductIdentity className="erp-progress-product" productId={row.product_id} name={row.product} compact={compact} thumbnail={gallery ?? placeholder}>
      {content}
    </ProductIdentity>
  ) : <span className="erp-progress-product erp-progress-product--empty"><span className="erp-task-product-image erp-task-product-image--placeholder" aria-label="未关联产品／物料"><FileTextOutlined aria-hidden="true" /></span>{content}</span>
}

export function ProgressOpenButton({ row, onOpen }) {
  const reference = row.line
    ? `${row.order_no} · ${row.product} · 第 ${row.line.line_no} 行`
    : progressIdentityPresentation(row).reference
  return (
    <Button
      color="primary"
      variant="outlined"
      size="small"
      className="erp-progress-row-open"
      data-task-entry
      aria-label={`查看进度：${reference}`}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true })
        onOpen()
      }}
    >
      查看进度
    </Button>
  )
}

export function ProgressDocumentStatus({ status }) {
  return <Tag>{progressStatusLabel(status)}</Tag>
}

export function ProgressDocumentNumber({ number, view, children, className }) {
  return (
    <BusinessCopyField label={view === 'production' ? '生产单号' : '订单号'} value={number} className={className}>
      {children ?? number?.trim()}
    </BusinessCopyField>
  )
}

export function ProgressIdentity({ row, showStatus = true }) {
  const identity = progressIdentityPresentation(row)
  const content = (
    <span className="erp-progress-identity">
      <strong>{identity.product}</strong>
      <ProgressDocumentNumber number={row.order_no} view={row.view} className="erp-progress-reference">{identity.reference}</ProgressDocumentNumber>
      <span className="erp-progress-customer">
        {identity.customer}
        {showStatus && <ProgressDocumentStatus status={row.status} />}
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

function DeliveryBar({ percent, label, text }) {
  return (
    <span
      className="erp-progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={text}
    >
      <i style={{ width: `${percent}%` }} />
    </span>
  )
}

function deliveryPercentText(percent) {
  if (percent > 0 && percent < 0.1) return '<0.1%'
  if (percent > 99.9 && percent < 100) return '>99.9%'
  return `${Number(percent.toFixed(1))}%`
}

export function ProgressOrderDelivery({ row, onOpenDetails }) {
  const delivery = progressDelivery(row)
  const byLine = row.ordered_quantity == null
  const percent = byLine && row.delivery_known && row.product_count > 0 && Number.isSafeInteger(row.delivered_line_count)
    ? (row.delivered_line_count / row.product_count) * 100
    : delivery.percent
  const label = byLine ? '明细交齐比例' : '实际出货比例'
  return (
    <>
      <div className="erp-progress-order-delivery">
        {byLine ? (
          <>
            <span>{delivery.text}</span>
            <Button size="small" type="link" onClick={onOpenDetails}>查看逐款明细</Button>
          </>
        ) : (
          <>
            <span>订购 {progressQuantity(row.ordered_quantity)} {row.unit}</span>
            <ProgressMetricHint row={row} metric={progressDeliveryDetails(row)}>
              已出 {row.shipped_quantity == null ? '待核对' : `${progressQuantity(row.shipped_quantity)} ${row.unit}`}
            </ProgressMetricHint>
            <span>待交 {row.remaining_quantity == null ? '待核对' : `${progressQuantity(row.remaining_quantity)} ${row.unit}`}</span>
          </>
        )}
      </div>
      {percent !== undefined && (
        <div className="erp-progress-order-ratio">
          <DeliveryBar percent={percent} label={label} text={delivery.text} />
          <span>{byLine ? '明细交齐' : '已出货'} {deliveryPercentText(percent)}</span>
        </div>
      )}
    </>
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
      {showProgress && (delivery.percent > 0 || (row.line && delivery.percent === 0)) && (
        <ProgressMetricHint row={row} metric={progressDeliveryDetails(row)}>
          <DeliveryBar
            percent={delivery.percent}
            text={delivery.text}
            label={row.view === 'orders' ? '实际出货比例' : '有效完工比例'}
          />
        </ProgressMetricHint>
      )}
    </span>
  )
}

export function ProgressLineProduct({ row }) {
  return <ProductIdentity productId={row.product_id} name={row.product} code={row.line.customer_product_no} copyCode={{ label: '客户款号' }} compact />
}

export function ProgressLineRemaining({ row }) {
  return row.line.remaining_quantity === null
    ? '—'
    : `${progressQuantity(row.line.remaining_quantity)} ${row.unit}`
}

export function ProgressLineStatus({ row, snapshotAt }) {
  return <VisualizationStatus status={progressLineStatus(row, snapshotAt)} />
}

export function ProgressAttention({ row, access, compact = false, suffix, onOpenTask, showOwnerWithoutTasks = true }) {
  const attention = progressAttention(row, access)
  const countLabel = attention.taskCount > 1 ? `${attention.taskCount} 项待办` : ''
  if (compact) {
    const detail = attention.detail ? `${attention.detail}${countLabel ? ` · 共 ${countLabel}` : ''}` : ''
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
  const owner = attention.taskCount > 0 || showOwnerWithoutTasks ? attention.detail : ''
  const taskInTitle = attention.taskCount === 1 && Boolean(onOpenTask)
  const taskActionLabel = taskInTitle ? attention.title : countLabel
  const taskAction = onOpenTask && taskActionLabel ? (
    <Button
      type="link"
      size="small"
      className="erp-progress-task-entry"
      aria-label={`${taskActionLabel}（${row.order_no}）`}
      aria-haspopup={attention.taskID ? undefined : 'dialog'}
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true })
        onOpenTask(attention.taskID)
      }}
    >
      {taskActionLabel}
    </Button>
  ) : null
  return (
    <span
      className={`erp-progress-attention${attention.blocked ? ' is-blocked' : ''}`}
    >
      <strong>
        {attention.blocked ? '受阻 · ' : ''}
        {taskInTitle ? taskAction : attention.title}
      </strong>
      {attention.reason && (
        <span className="erp-progress-attention-reason">
          {attention.reason}
        </span>
      )}
      {owner && (
        <span>
          {owner}
          {countLabel && <> · {taskAction || `共 ${countLabel}`}</>}
        </span>
      )}
    </span>
  )
}
