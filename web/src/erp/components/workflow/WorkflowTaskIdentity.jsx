import React from 'react'
import { Button } from 'antd'
import { FileTextOutlined, FileUnknownOutlined, RightOutlined } from '@ant-design/icons'
import BusinessModal from '../business-list/BusinessModal.jsx'
import WorkflowTaskProductImage from './WorkflowTaskProductImage.jsx'
import { TaskCopyButton, TaskCopyField, WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { formatWorkflowProductCopy } from '../../utils/workflowTaskCopy.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskIdentityCode,
  getWorkflowTaskIdentityPresentation,
} from '../../utils/workflowTaskIdentity.mjs'
import './workflowTaskIdentity.css'

function IdentityField({ label, value }) {
  return <><span className="erp-task-identity__field-label">{label}</span>{' '}<span className="erp-task-identity__field-value">{value}</span></>
}

function IdentityCode({ item, copyable = true }) {
  const material = item.kind === 'material'
  const value = material ? item.supplierItemNo : item.code
  const label = material ? '款号' : '产品编号'
  const content = value ? <IdentityField label={label} value={value} /> : getWorkflowTaskIdentityCode(item)
  if (!copyable) return content
  return (
    <TaskCopyField
      value={value}
      label={label}
    >
      {content}
    </TaskCopyField>
  )
}

function CompactIdentityCodes({ item, sourceNo, copyable, showStyleNo, showReference = true }) {
  return (
    <>
      {showReference ? <span className="erp-task-identity__code"><IdentityCode item={item} copyable={copyable} /></span> : null}
      {showStyleNo && item.kind === 'product' && (!item.styleNo || item.styleNo !== item.code) ? (
        <span className="erp-task-identity__code">
          {item.styleNo ? copyable ? <TaskCopyField value={item.styleNo} label="内部款号"><IdentityField label="内部款号" value={item.styleNo} /></TaskCopyField> : <IdentityField label="内部款号" value={item.styleNo} /> : '内部款号未填写'}
        </span>
      ) : null}
      {item.orderNo && item.orderNo !== sourceNo ? (
        <span className="erp-task-identity__code">
          {copyable ? <TaskCopyField value={item.orderNo} label="订单编号"><IdentityField label="关联订单" value={item.orderNo} /></TaskCopyField> : <IdentityField label="关联订单" value={item.orderNo} />}
        </span>
      ) : null}
    </>
  )
}

function IdentityItem({ item, copyable = true, codeCopyable = copyable, summaryCopyable = copyable, source = null }) {
  return (
    <span className="erp-task-identity__row">
      <WorkflowTaskProductImage item={item} />
      <span className="erp-task-identity__item">
        {source}
        <span className="erp-task-identity__name">
          <strong>
            {item.name ||
              `${item.kind === 'material' ? '物料' : '产品'}名称未填写`}
          </strong>
          {summaryCopyable ? <TaskCopyButton
            text={formatWorkflowProductCopy([item])}
            label={item.kind === 'material' ? '物料信息' : '产品信息'}
            showLabel
          /> : null}
        </span>
        <span className="erp-task-identity__code">
          <IdentityCode item={item} copyable={codeCopyable} />
        </span>
        {item.kind === 'material' && item.code ? (
          <span className="erp-task-identity__code">
            {copyable ? (
              <TaskCopyField value={item.code} label="系统物料编号"><IdentityField label="系统物料编号" value={item.code} /></TaskCopyField>
            ) : <IdentityField label="系统物料编号" value={item.code} />}
          </span>
        ) : null}
        {item.kind === 'product' &&
        item.styleNo &&
        item.styleNo !== item.code ? (
          <span className="erp-task-identity__code">
            {copyable ? (
              <TaskCopyField value={item.styleNo} label="内部款号"><IdentityField label="内部款号" value={item.styleNo} /></TaskCopyField>
            ) : <IdentityField label="内部款号" value={item.styleNo} />}
          </span>
        ) : null}
        {item.orderNo ? (
          <span className="erp-task-identity__code">
            {copyable ? (
              <TaskCopyField value={item.orderNo} label="订单编号"><IdentityField label="关联订单" value={item.orderNo} /></TaskCopyField>
            ) : <IdentityField label="关联订单" value={item.orderNo} />}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export function WorkflowTaskAssociation({ task, keyword = '', copyable = false, showStyleNo = false, emptyLabel = '未关联产品／物料', heading = null }) {
  const identity = getWorkflowTaskIdentityPresentation(task, keyword)
  const sourceKey = JSON.stringify([task?.id, task?.source_type, task?.source_id, identity])
  const [openedSourceKey, setOpenedSourceKey] = React.useState(null)
  const first = identity.available ? identity.first : null
  const open = openedSourceKey === sourceKey
  const renderContent = (content) => heading ? (
    <span className="erp-task-identity__content">{heading}{content}</span>
  ) : content
  if (!first) {
    const Icon = identity.available ? FileTextOutlined : FileUnknownOutlined
    const label = identity.available ? emptyLabel : '关联单据已不可用'
    return (
      <span className="erp-task-identity__card-body erp-task-identity__card-body--empty" aria-label="任务关联内容">
        <span className="erp-task-product-image erp-task-product-image--placeholder" aria-hidden="true"><Icon /></span>
        {renderContent(<span className="erp-task-identity__item"><span className="erp-task-identity__unavailable">{label}</span></span>)}
      </span>
    )
  }
  return (
    <>
      <span className="erp-task-identity__card-body" aria-label="任务关联内容">
        <WorkflowTaskProductImage item={first} />
        {renderContent(
          <span className="erp-task-identity__item">
            {identity.items.length > 1 ? (
              <button
                type="button"
                className="erp-task-identity__association-open"
                aria-label={`查看${identity.associationCountLabel.replace(/^共\s*/u, '')}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}
                onClick={(event) => {
                  event.stopPropagation()
                  event.currentTarget.focus({ preventScroll: true })
                  setOpenedSourceKey(sourceKey)
                }}
              />
            ) : null}
            <span className="erp-task-identity__product">
              {first.name || `${first.kind === 'material' ? '物料' : '产品'}名称未填写`}
              {identity.compactCountLabel ? <span className={`erp-task-identity__count-label${identity.items.length > 1 ? ' erp-task-identity__count-label--link' : ''}`}>{identity.compactCountLabel}{identity.items.length > 1 ? <RightOutlined aria-hidden="true" /> : null}</span> : null}
            </span>
            <CompactIdentityCodes item={first} sourceNo={identity.sourceNo} copyable={copyable} showStyleNo={showStyleNo} />
          </span>
        )}
      </span>
      <BusinessModal key={sourceKey} title={identity.associationTitle} open={open} onCancel={() => setOpenedSourceKey(null)} footer={null} size="recordDetails" destroyOnHidden className="erp-task-linked-items-modal">
        <div className="erp-task-linked-items">
          {identity.sourceLineCount !== null && ['purchase_order', 'purchase-order', 'accessories-purchase'].includes(task?.source_type) ? <p className="erp-task-identity__code">采购明细共 {identity.sourceLineCount} 条 · {identity.associationCountLabel}</p> : null}
          {identity.items.map((item, index) => <IdentityItem key={index} item={item} />)}
        </div>
      </BusinessModal>
    </>
  )
}

export default function WorkflowTaskIdentity({
  task,
  keyword = '',
  compact = false,
  copyable = true,
  summaryCopyable = copyable,
  detailView = false,
  showTaskName = false,
  showStyleNo = false,
  renderCompactTitle,
  source = null,
  layout = 'inline',
  status = null,
}) {
  const identity = getWorkflowTaskIdentityPresentation(task, keyword)
  const sourceKey = `${task?.id}:${task?.source_type}:${task?.source_id}:${identity.available}`
  const [openedSourceKey, setOpenedSourceKey] = React.useState(null)
  React.useEffect(() => setOpenedSourceKey(null), [sourceKey])
  const renderTaskHeading = (title) => (
    <span className="erp-task-identity__heading">
      <strong>{title || getWorkflowTaskDisplayName(task)}</strong>
      {title ? (
        <span className="erp-task-identity__task-name">
          {getWorkflowTaskDisplayName(task)}
        </span>
      ) : null}
    </span>
  )
  const renderTitle = renderCompactTitle || (showTaskName ? renderTaskHeading : null)
  if (compact && (layout === 'card' || layout === 'table')) {
    const title = getWorkflowTaskDisplayName(task)
    const heading = (
      <span className="erp-task-identity__card-heading">
        <span className="erp-task-identity__heading">
          {renderCompactTitle ? renderCompactTitle(title) : <strong>{title}</strong>}
        </span>
        {status ? <span className="erp-task-identity__status">{status}</span> : null}
      </span>
    )
    return (
      <span className={`erp-task-identity erp-task-identity--compact erp-task-identity--card${layout === 'table' ? ' erp-task-identity--table' : ''}`}>
        {layout === 'table' ? null : heading}
        <WorkflowTaskAssociation task={task} keyword={keyword} copyable={copyable} showStyleNo={showStyleNo} heading={layout === 'table' ? heading : null} />
        {source ? <span className="erp-task-identity__source">{source}</span> : null}
      </span>
    )
  }
  if (compact) {
    return (
      <span className="erp-task-identity erp-task-identity--compact">
        {renderTitle ? renderTitle() : null}
        <WorkflowTaskAssociation task={task} keyword={keyword} copyable={copyable} showStyleNo={showStyleNo} />
        {source ? <span className="erp-task-identity__source">{source}</span> : null}
      </span>
    )
  }
  if (!identity.available || !identity.items.length) {
    return (
      <div className={`erp-task-identity${detailView ? ' erp-task-identity--detail' : ''}`} aria-label="任务关联内容">
        {source ? identity.available ? source : <WorkflowTaskSource task={task} copyable={false} showUnavailable={false} /> : null}
        <WorkflowTaskAssociation task={task} keyword={keyword} />
      </div>
    )
  }
  if (detailView) {
    return (
      <div className="erp-task-identity erp-task-identity--detail" aria-label="任务关联内容">
        <div className="erp-task-identity__summary">
          <IdentityItem item={identity.first} copyable={false} codeCopyable={copyable} source={source} />
          {identity.items.length > 1 ? <Button type="link" className="erp-task-identity__count" aria-haspopup="dialog" aria-expanded={openedSourceKey === sourceKey} onClick={(event) => { event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); setOpenedSourceKey(sourceKey) }}>{identity.associationCountLabel}<RightOutlined aria-hidden="true" /></Button> : null}
        </div>
        <BusinessModal key={sourceKey} title={identity.associationTitle} open={openedSourceKey === sourceKey} onCancel={() => setOpenedSourceKey(null)} footer={null} size="recordDetails" destroyOnHidden className="erp-task-linked-items-modal">
          <div className="erp-task-linked-items">
            {identity.items.map((item, index) => <IdentityItem key={index} item={item} />)}
          </div>
        </BusinessModal>
      </div>
    )
  }
  return (
    <div className="erp-task-identity" aria-label="任务关联内容">
      <IdentityItem item={identity.first} copyable={copyable} summaryCopyable={summaryCopyable} />
      {identity.remainingItems.length ? (
        <details key={task?.id} className="erp-task-identity__more">
          <summary>
            展开其余 {identity.remainingItems.length} 项关联内容
          </summary>
          {identity.remainingItems.map((item, index) => (
            <IdentityItem key={index} item={item} copyable={copyable} summaryCopyable={summaryCopyable} />
          ))}
        </details>
      ) : null}
    </div>
  )
}
