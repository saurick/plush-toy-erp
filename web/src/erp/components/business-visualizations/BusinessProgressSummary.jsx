import React from 'react'
import { Button, Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  progressDelivery,
  progressStages,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import './businessProgressSummary.css'

export function ProgressBadges({ row }) {
  return (
    <span className="erp-progress-badges">
      <Tag>{progressStatusLabel(row.status)}</Tag>
      {row.overdue && <Tag color="red">已逾期</Tag>}
      {row.due_soon && <Tag color="orange">7 天内到期</Tag>}
      {row.blocked && <Tag color="red">任务阻塞</Tag>}
    </span>
  )
}

export default function BusinessProgressSummary({
  row,
  access,
  sections,
  headingRef,
  onSelectSection,
  onOpenDetail,
}) {
  const delivery = progressDelivery(row)
  const hasTask = access?.tasks && Boolean(row.attention_task)
  const attention = hasTask
    ? row.attention_reason ||
      getWorkflowTaskDisplayName({ task_name: row.attention_task })
    : access?.tasks
      ? '暂无可见待办'
      : '任务无查看权限'
  return (
    <div className="erp-progress-overview">
      <header className="erp-progress-overview-identity">
        <h2 ref={headingRef} tabIndex={-1}>
          {row.order_no}
        </h2>
        <div className="erp-progress-overview-product">
          <ProductIdentity productId={row.product_id} name={row.product}>
            {row.product}
            {row.product_count > 1 ? ` 等 ${row.product_count} 项` : ''}
          </ProductIdentity>
          {row.customer ? <p>{row.customer}</p> : null}
        </div>
        <ProgressBadges row={row} />
        <p className={row.overdue ? 'erp-progress-danger' : ''}>
          {row.due_date || '尚未确定'} ·{' '}
          {row.view === 'orders' ? '交付' : '计划结束'}
        </p>
        <div className="erp-progress-overview-quantity">
          <span>{delivery.label}</span>
          <strong>{delivery.text}</strong>
        </div>
      </header>
      <section className="erp-progress-overview-stages" aria-label="阶段进度">
        <h3>阶段进度</h3>
        {progressStages(row, access).map((stage) => {
          const disabled =
            stage.disabled ||
            !onSelectSection ||
            (sections && !sections[stage.section])
          return (
            <button
              type="button"
              key={stage.key}
              data-progress-stage={stage.key}
              className={`erp-progress-overview-stage ${stage.tone || ''}`}
              disabled={disabled}
              aria-label={`${stage.label}：${stage.text}`}
              onClick={() => onSelectSection(stage.section)}
            >
              <span className="erp-progress-overview-stage-label">
                {stage.label}
              </span>
              <span className="erp-progress-overview-stage-content">
                {stage.percent !== undefined && (
                  <span
                    className="erp-progress-overview-track"
                    role="progressbar"
                    aria-label={`${stage.label}进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(stage.percent)}
                    aria-valuetext={stage.text}
                  >
                    <i style={{ width: `${stage.percent}%` }} />
                  </span>
                )}
                <span className="erp-progress-overview-stage-text">
                  {stage.text}
                </span>
              </span>
              <strong>
                {stage.percent !== undefined
                  ? `${Math.round(stage.percent)}%`
                  : !disabled && <ArrowRightOutlined aria-hidden="true" />}
              </strong>
            </button>
          )
        })}
      </section>
      <section
        className="erp-progress-overview-attention"
        aria-label="当前关注"
      >
        <h3>当前关注</h3>
        {hasTask ? (
          <button type="button" onClick={() => onSelectSection('tasks')}>
            {attention}
          </button>
        ) : (
          <p>{attention}</p>
        )}
        {hasTask ? (
          <p>
            {row.attention_owner || '未分配处理人'} ·{' '}
            {row.attention_role
              ? getWorkflowTaskOwnerRoleLabel({
                  owner_role_key: row.attention_role,
                })
              : '未分配岗位'}
          </p>
        ) : row.sales_owner ? (
          <p>业务负责人：{row.sales_owner}</p>
        ) : null}
        {hasTask && row.open_tasks > 1 && (
          <button
            className="erp-progress-overview-more"
            type="button"
            onClick={() => onSelectSection('tasks')}
          >
            另有 {row.open_tasks - 1} 项待办
          </button>
        )}
      </section>
      {onOpenDetail && (
        <Button type="primary" block onClick={onOpenDetail}>
          查看完整进度
        </Button>
      )}
    </div>
  )
}
