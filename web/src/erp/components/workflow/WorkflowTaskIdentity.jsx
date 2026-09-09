import React from 'react'
import WorkflowTaskProductImage from './WorkflowTaskProductImage.jsx'
import { TaskCopyButton, TaskCopyField } from './WorkflowTaskCopy.jsx'
import { formatWorkflowProductCopy } from '../../utils/workflowTaskCopy.mjs'
import {
  getWorkflowTaskIdentity,
  getWorkflowTaskIdentityCode,
} from '../../utils/workflowTaskIdentity.mjs'
import './workflowTaskIdentity.css'

function IdentityCode({ item }) {
  const material = item.kind === 'material'
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

export default function WorkflowTaskIdentity({ task, compact = false }) {
  const identity = getWorkflowTaskIdentity(task)
  if (!identity.available) {
    return (
      <span className="erp-task-identity__unavailable">关联单据已不可用</span>
    )
  }
  if (!identity.items.length) return null
  if (compact) {
    const first = identity.items[0]
    return (
      <span className="erp-task-identity erp-task-identity--compact erp-task-identity__row">
        <WorkflowTaskProductImage item={first} />
        <span className="erp-task-identity__item">
          <strong>
            {first.name || <IdentityCode item={first} />}
            {identity.items.length > 1 ? ` 等 ${identity.items.length} 项` : ''}
          </strong>
          {first.name ? (
            <span className="erp-task-identity__code">
              <IdentityCode item={first} />
            </span>
          ) : null}
          {first.orderNo && first.orderNo !== identity.sourceNo ? (
            <span className="erp-task-identity__code">
              <TaskCopyField value={first.orderNo} label="订单编号">
                关联订单 {first.orderNo}
              </TaskCopyField>
            </span>
          ) : null}
        </span>
      </span>
    )
  }
  return (
    <div className="erp-task-identity" aria-label="关联产品与物料">
      <IdentityItem item={identity.items[0]} />
      {identity.items.length > 1 ? (
        <details className="erp-task-identity__more">
          <summary>展开其余 {identity.items.length - 1} 项产品 / 物料</summary>
          {identity.items.slice(1).map((item, index) => (
            <IdentityItem key={index} item={item} />
          ))}
        </details>
      ) : null}
    </div>
  )
}
