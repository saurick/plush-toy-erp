import React from 'react'
import { Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  progressAttention,
  progressDelivery,
  progressIdentityPresentation,
  progressMetricDetails,
  progressStages,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'
import {
  ProgressAttention,
  ProgressProductIdentity,
} from './ProgressCompactContent.jsx'
import ProgressMetricHint, { ProgressHint } from './ProgressMetricHint.jsx'
import './businessProgressSummary.css'

export function ProgressBadges({ row }) {
  return (
    <span className="erp-progress-badges">
      <Tag>{progressStatusLabel(row.status)}</Tag>
      {row.overdue && <Tag color="red">已逾期</Tag>}
      {row.due_soon && <Tag color="orange">7 天内到期</Tag>}
    </span>
  )
}

export function BusinessProgressHeader({
  row,
  access,
  headingRef,
  mobile = false,
  onSelectSection,
}) {
  const identity = progressIdentityPresentation(row)
  const attention = progressAttention(row, access)
  return (
    <header className="erp-progress-detail-header" aria-label="单据摘要">
      <div className="erp-progress-overview-identity">
        {mobile && (
          <h2 ref={headingRef} tabIndex={-1}>
            {identity.reference}
          </h2>
        )}
        <div className="erp-progress-overview-product">
          <ProgressProductIdentity row={row}>
            <ProgressHint
              className="erp-progress-product-copy"
              label={`查看产品摘要：${identity.product}`}
              content={
                <div className="erp-progress-attention-hint">
                  {identity.product}
                  <br />
                  {identity.customer}
                </div>
              }
            >
              <strong>{identity.product}</strong>
              <span>{identity.customer}</span>
            </ProgressHint>
          </ProgressProductIdentity>
        </div>
        <div className="erp-progress-header-meta">
          <ProgressBadges row={row} />
          <span className={row.overdue ? 'erp-progress-danger' : ''}>
            {row.view === 'orders' ? '交期' : '计划结束'}{' '}
            {row.due_date || '尚未确定'}
          </span>
        </div>
      </div>
      <section
        className="erp-progress-overview-attention"
        aria-label="当前关注"
      >
        <ProgressHint
          className="erp-progress-attention-summary"
          label="查看完整当前关注"
          content={
            <div className="erp-progress-attention-hint">
              <ProgressAttention row={row} access={access} />
            </div>
          }
        >
          <ProgressAttention row={row} access={access} />
        </ProgressHint>
        {attention.taskCount > 0 && (
          <button
            type="button"
            className="erp-progress-overview-more"
            onClick={() => onSelectSection('tasks')}
          >
            查看任务 <ArrowRightOutlined aria-hidden="true" />
          </button>
        )}
      </section>
    </header>
  )
}

export default function BusinessProgressSummary({
  row,
  access,
  sections,
  onSelectSection,
}) {
  const delivery = progressDelivery(row)
  return (
    <div className="erp-progress-overview">
      <dl className="erp-progress-overview-facts">
        <div>
          <dt>{delivery.label}</dt>
          <dd>{delivery.text}</dd>
        </div>
        <div>
          <dt>当前工序</dt>
          <dd>
            {!access.wip
              ? '无查看权限'
              : row.current_operation
                ? `${row.current_operation}${row.operation_count > 1 ? ` 等 ${row.operation_count} 道并行工序` : ''}`
                : '暂无工序记录'}
          </dd>
        </div>
      </dl>
      <section className="erp-progress-overview-stages" aria-label="阶段进度">
        <h3>阶段进度</h3>
        {progressStages(row, access).map((stage) => {
          const disabled =
            stage.disabled ||
            !onSelectSection ||
            (sections && !sections[stage.section])
          const metric = progressMetricDetails(row, stage.key, access)
          const content = (
            <>
              {stage.percent !== undefined && (
                <span
                  className="erp-progress-overview-track"
                  role="progressbar"
                  aria-label={`${stage.label}进度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(stage.percent)}
                  aria-valuetext={metric.value}
                >
                  <i style={{ width: `${stage.percent}%` }} />
                </span>
              )}
              <span className="erp-progress-overview-stage-text">
                {stage.text}
              </span>
              {stage.percent !== undefined && (
                <strong>{Math.round(stage.percent)}%</strong>
              )}
            </>
          )
          return (
            <div
              key={stage.key}
              data-progress-stage={stage.key}
              className={`erp-progress-overview-stage ${stage.tone || ''}`}
            >
              <span>{stage.label}</span>
              {metric ? (
                <ProgressMetricHint
                  row={row}
                  metric={metric}
                  className="erp-progress-overview-stage-content"
                >
                  {content}
                </ProgressMetricHint>
              ) : (
                <span className="erp-progress-overview-stage-content">
                  {content}
                </span>
              )}
              <button
                type="button"
                className="erp-progress-stage-detail"
                disabled={disabled}
                aria-label={`查看${stage.label}明细`}
                onClick={() => onSelectSection(stage.section)}
              >
                <ArrowRightOutlined aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </section>
    </div>
  )
}
