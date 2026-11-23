import React, { useId } from 'react'
import { Button, Tag } from 'antd'
import { ArrowRightOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { WorkflowTaskStatus } from '@/common/consts/statuses.generated.mjs'
import {
  progressDelivery,
  progressIdentityPresentation,
  progressMetricDetails,
  progressStages,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'
import {
  ProgressAttention,
  ProgressDocumentNumber,
  ProgressOrderDelivery,
  ProgressProductIdentity,
} from './ProgressCompactContent.jsx'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
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
  showOrderConcerns = false,
  onSelectSection,
}) {
  const identity = progressIdentityPresentation(row)
  return (
    <header className="erp-progress-detail-header" aria-label="单据摘要">
      <div className="erp-progress-overview-identity">
        {mobile && (
          <h2 ref={headingRef} tabIndex={-1} aria-label={identity.reference}>
            <ProgressDocumentNumber number={row.order_no} view={row.view}>{identity.reference}</ProgressDocumentNumber>
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
      {showOrderConcerns ? (
        !mobile && (
          <div className="erp-progress-detail-delivery" aria-label="交付进度">
            <ProgressOrderDelivery row={row} onOpenDetails={() => onSelectSection('lines')} />
          </div>
        )
      ) : (
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
        </section>
      )}
    </header>
  )
}

const concernLimit = 4
const impactByTaskGroup = {
  handoff_shipment_quality: '出货放行',
  handoff_purchase_price: '应付结算',
}

function pendingTask(task) {
  return task.status === WorkflowTaskStatus.READY || task.status === WorkflowTaskStatus.BLOCKED
}

function OrderConcerns({ access, tasks, focus, stageID }) {
  const pending = access.tasks ? tasks.filter(pendingTask) : []
  const visible = pending.slice(0, concernLimit)
  return (
    <section className="erp-progress-concerns" aria-label="本单卡点">
      <header className="erp-progress-concerns-heading">
        <h3>本单卡点</h3>
        <Button
          type="link"
          size="small"
          aria-expanded={focus.stagesExpanded}
          aria-controls={stageID}
          onClick={focus.onToggleStages}
        >
          阶段追踪 {focus.stagesExpanded ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
        </Button>
      </header>
      {visible.length > 0 ? (
        <div className="erp-progress-concern-list">
          {visible.map((task) => {
            const impact = impactByTaskGroup[task.task_group]
            const blocked = task.status === WorkflowTaskStatus.BLOCKED
            const label = impact ? (blocked ? `${impact} · 受阻` : impact) : progressStatusLabel(task.status)
            const title = getWorkflowTaskDisplayName({ task_name: task.label, task_group: task.task_group })
            return (
              <article className="erp-progress-concern-row" key={task.id}>
                <span className="erp-progress-concern-status">
                  <Tag color={blocked ? 'red' : impact ? 'orange' : undefined}>{label}</Tag>
                </span>
                <div className="erp-progress-concern-subject">
                  <strong>{title}</strong>
                  {task.note && <span>{task.note}</span>}
                </div>
                <div className="erp-progress-concern-owner">
                  {getWorkflowTaskOwnerRoleLabel({ owner_role_key: task.role })}
                  <span>{task.owner || '未分配处理人'}</span>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="erp-progress-concern-empty">
          {access.tasks ? '暂无可见待处理任务' : '无任务查看权限'}
        </p>
      )}
    </section>
  )
}

function ProgressStages({ row, access, sections, onSelectSection, id, hidden }) {
  return (
    <section className="erp-progress-overview-stages" id={id} hidden={hidden} aria-label="阶段进度">
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
  )
}

export default function BusinessProgressSummary({
  row,
  access,
  sections,
  onSelectSection,
  orderFocus,
}) {
  const stageID = useId()
  const delivery = progressDelivery(row)
  return (
    <div className={`erp-progress-overview${orderFocus ? ' erp-progress-overview--order' : ''}`}>
      {orderFocus && (
        <OrderConcerns access={access} tasks={sections.tasks || []} focus={orderFocus} stageID={stageID} />
      )}
      {(!orderFocus || orderFocus.mobile) && (
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
      )}
      <ProgressStages row={row} access={access} sections={sections} onSelectSection={onSelectSection} id={stageID} hidden={orderFocus && !orderFocus.stagesExpanded} />
    </div>
  )
}
