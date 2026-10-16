import React from 'react'
import { Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  progressAttention,
  progressDelivery,
  progressStages,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'
import { ProgressAttention } from './ProgressCompactContent.jsx'
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
}) {
  const delivery = progressDelivery(row)
  const attention = progressAttention(row, access)
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
        {attention.taskCount > 0 ? (
          <button type="button" onClick={() => onSelectSection('tasks')}>
            <ProgressAttention row={row} access={access} />
          </button>
        ) : <ProgressAttention row={row} access={access} />}

      </section>
    </div>
  )
}
