import React from 'react'
import WorkflowTaskProductImage from './WorkflowTaskProductImage.jsx'
import { TaskCopyButton, TaskCopyField } from './WorkflowTaskCopy.jsx'
import { formatWorkflowProductCopy } from '../../utils/workflowTaskCopy.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskIdentityCode,
  getWorkflowTaskIdentityPresentation,
} from '../../utils/workflowTaskIdentity.mjs'
import './workflowTaskIdentity.css'

function IdentityCode({ item, copyable = true }) {
  const material = item.kind === 'material'
  if (!copyable) return getWorkflowTaskIdentityCode(item)
  return (
    <TaskCopyField
      value={material ? item.supplierItemNo : item.code}
      label={material ? '款号' : '产品编号'}
    >
      {getWorkflowTaskIdentityCode(item)}
    </TaskCopyField>
  )
}

function IdentityItem({ item }) {
  return (
    <span className="erp-task-identity__row">
      <WorkflowTaskProductImage item={item} />
      <span className="erp-task-identity__item">
        <span className="erp-task-identity__name">
          <strong>
            {item.name ||
              `${item.kind === 'material' ? '物料' : '产品'}名称未填写`}
          </strong>
          <TaskCopyButton
            text={formatWorkflowProductCopy([item])}
            label={item.kind === 'material' ? '物料信息' : '产品信息'}
            showLabel
          />
        </span>
        <span className="erp-task-identity__code">
          <IdentityCode item={item} />
        </span>
        {item.kind === 'material' && item.code ? (
          <span className="erp-task-identity__code">
            <TaskCopyField value={item.code} label="系统物料编号">
              系统物料编号 {item.code}
            </TaskCopyField>
          </span>
        ) : null}
        {item.kind === 'product' &&
        item.styleNo &&
        item.styleNo !== item.code ? (
          <span className="erp-task-identity__code">
            <TaskCopyField value={item.styleNo} label="内部款号">
              内部款号 {item.styleNo}
            </TaskCopyField>
          </span>
        ) : null}
        {item.orderNo ? (
          <span className="erp-task-identity__code">
            <TaskCopyField value={item.orderNo} label="订单编号">
              关联订单 {item.orderNo}
            </TaskCopyField>
          </span>
        ) : null}
      </span>
    </span>
  )
}

export default function WorkflowTaskIdentity({
  task,
  compact = false,
  copyable = true,
  showTaskName = false,
  showStyleNo = false,
  renderCompactTitle,
}) {
  const identity = getWorkflowTaskIdentityPresentation(task)
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
  if (!identity.available) {
    return (
      <>
        {compact ? renderTitle?.() : null}
        <span className="erp-task-identity__unavailable">关联单据已不可用</span>
      </>
    )
  }
  if (!identity.items.length) {
    return compact ? renderTitle?.() || null : null
  }
  if (compact) {
    const { first } = identity
    const title = (
      <>
        {first.name ||
          (renderTitle ? (
            `${first.kind === 'material' ? '物料' : '产品'}名称未填写`
          ) : (
            <IdentityCode item={first} copyable={copyable} />
          ))}
        {identity.compactCountLabel ? `（${identity.compactCountLabel}）` : ''}
      </>
    )
    return (
      <span className="erp-task-identity erp-task-identity--compact erp-task-identity__row">
        <WorkflowTaskProductImage item={first} />
        <span className="erp-task-identity__item">
          {renderTitle ? (
            renderTitle(title)
          ) : (
            <strong>{title}</strong>
          )}
          {first.name || renderTitle ? (
            <span className="erp-task-identity__code">
              <IdentityCode item={first} copyable={copyable} />
            </span>
          ) : null}
          {showStyleNo && first.kind === 'product' && first.styleNo && first.styleNo !== first.code ? (
            <span className="erp-task-identity__code">
              {copyable ? <TaskCopyField value={first.styleNo} label="内部款号">内部款号 {first.styleNo}</TaskCopyField> : `内部款号 ${first.styleNo}`}
            </span>
          ) : null}
          {first.orderNo && first.orderNo !== identity.sourceNo ? (
            <span className="erp-task-identity__code">
              {copyable ? (
                <TaskCopyField value={first.orderNo} label="订单编号">
                  关联订单 {first.orderNo}
                </TaskCopyField>
              ) : (
                `关联订单 ${first.orderNo}`
              )}
            </span>
          ) : null}
        </span>
      </span>
    )
  }
  return (
    <div className="erp-task-identity" aria-label="任务关联内容">
      <IdentityItem item={identity.first} />
      {identity.remainingItems.length ? (
        <details className="erp-task-identity__more">
          <summary>
            展开其余 {identity.remainingItems.length} 项关联内容
          </summary>
          {identity.remainingItems.map((item, index) => (
            <IdentityItem key={index} item={item} />
          ))}
        </details>
      ) : null}
    </div>
  )
}
