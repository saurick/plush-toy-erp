import {
  progressDelivery,
  progressStages,
} from '../../utils/businessProgress.mjs'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import ProductIdentity from '../../components/master-data/ProductIdentity.jsx'
import MobileProgressRecentRecords from './MobileProgressRecentRecords.jsx'

export default function MobileProgressSummary({ data }) {
  const { row, access, sections } = data
  const delivery = progressDelivery(row)
  const stages = progressStages(row, access)
  const owner =
    row.attention_owner ||
    (row.attention_role
      ? getWorkflowTaskOwnerRoleLabel({ owner_role_key: row.attention_role })
      : '')
  const attention = !access.tasks
    ? '无查看权限'
    : row.open_tasks > 0
      ? [owner, `${row.open_tasks} 项待处理`].filter(Boolean).join(' · ')
      : '暂无可见待办'
  const task = access.tasks
    ? sections.tasks?.find((item) => item.label === row.attention_task) ||
      sections.tasks?.[0]
    : null

  return (
    <>
      <section
        className="mobile-detail-section mobile-progress-overview"
        aria-label="单据摘要"
      >
        <h2>{row.order_no}</h2>
        <div className="mobile-progress-overview-product">
          <ProductIdentity productId={row.product_id} name={row.product}>
            {row.product}
            {row.product_count > 1 ? ` 等 ${row.product_count} 项` : ''}
          </ProductIdentity>
          {row.customer ? (
            <p className="mobile-detail-identity">{row.customer}</p>
          ) : null}
        </div>
        <dl className="mobile-detail-facts">
          <div className="mobile-detail-fact">
            <dt>{row.view === 'orders' ? '计划交期' : '计划结束'}</dt>
            <dd>
              {row.due_date ? row.due_date.replaceAll('-', '/') : '尚未确定'}
            </dd>
          </div>
          <div className="mobile-detail-fact">
            <dt>当前工序</dt>
            <dd>
              {!access.wip
                ? '无查看权限'
                : row.current_operation
                  ? `${row.current_operation}${row.operation_count > 1 ? ` 等 ${row.operation_count} 道并行工序` : ''}`
                  : '暂无工序记录'}
            </dd>
          </div>
          <div className="mobile-detail-fact">
            <dt>{row.view === 'orders' ? '出货进度' : '完工进度'}</dt>
            <dd>
              {delivery.percent !== undefined
                ? `${Math.round(delivery.percent)}% · `
                : ''}
              {delivery.text}
            </dd>
          </div>
          <div className="mobile-detail-fact">
            <dt>当前关注</dt>
            <dd>{attention}</dd>
          </div>
        </dl>
        {access.tasks && row.attention_reason ? (
          <p className="mobile-progress-attention-reason">
            {row.attention_reason}
          </p>
        ) : null}
      </section>
      <section className="mobile-detail-section" aria-label="阶段进度">
        <h3>阶段进度</h3>
        <div className="mobile-progress-stage-list">
          {stages.map((stage) => (
            <div
              className="mobile-progress-stage-row"
              key={stage.key}
              data-progress-stage={stage.key}
            >
              <span>{stage.label}</span>
              {stage.percent !== undefined ? (
                <div
                  className="mobile-progress-stage-track"
                  role="progressbar"
                  aria-label={`${stage.label}进度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(stage.percent)}
                  aria-valuetext={stage.text}
                >
                  <i style={{ width: `${stage.percent}%` }} />
                </div>
              ) : (
                <span className="mobile-progress-stage-note">
                  {stage.text === '查看批次' ? '按批次核对' : stage.text}
                </span>
              )}
              <strong>
                {stage.percent !== undefined
                  ? `${Math.round(stage.percent)}%`
                  : '—'}
              </strong>
            </div>
          ))}
        </div>
      </section>
      <MobileProgressRecentRecords task={task} canRead={access.tasks} />
    </>
  )
}
