import React from 'react'
import { Button, Drawer, Select } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole } from '../../../erp/utils/workflowFulfillment.mjs'
import './taskFulfillmentGuide.css'

function ApprovalDetails({ approval }) {
  return (
    <div className="erp-dev-fulfillment-guide__approval">
      <strong>{approval.label}</strong>
      <p>{approval.condition}</p>
      <p>通过：{approval.passed}</p>
      <p>未通过：{approval.rejected}</p>
    </div>
  )
}

export default function TaskFulfillmentGuide({ onExploreStage }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeFulfillmentRole(searchParams.get('flow_role'))
  const roleSelectID = React.useId()
  const detailID = React.useId()
  const detailRef = React.useRef(null)
  const [view, setView] = React.useState('main')
  const [selection, setSelection] = React.useState({ role: 'all', stage: 'sales_order' })
  const [decision, setDecision] = React.useState('原厂返工')
  const current = selection.role === role ? catalog.fulfillment_flow.find((step) => step.stage === selection.stage) : catalog.fulfillment_flow.find((step) => fulfillmentStepMatchesRole(step, role))
  const changeRole = (value) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    if (value === 'all') next.delete('flow_role')
    else next.set('flow_role', value)
    return next
  })
  const links = fulfillmentTaskLinks(current)
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide" aria-label="岗位履约流程">
      <div className="erp-dev-fulfillment-guide__heading">
        <div><h2>订单全流程</h2><p>从销售接单到实际出货，按岗位查看交接、审批和异常。</p></div>
        <div className="erp-dev-fulfillment-guide__role">
          <label htmlFor={roleSelectID}>关注岗位</label>
          <Select id={roleSelectID} aria-label="关注岗位" value={role} options={fulfillmentRoleOptions} onChange={changeRole} />
        </div>
      </div>
      <SlidingSegmented
        aria-label="履约流程视图"
        value={view}
        options={[
        { label: '完整流程', value: 'main' }, { label: '异常处理', value: 'exception' },
      ]}
        onChange={setView}
      />
      {view === 'main' ? (
        <div className="erp-dev-fulfillment-guide__body">
          <ol className="erp-dev-fulfillment-guide__steps">
            {catalog.fulfillment_flow.map((step, index) => (
              <li key={step.stage} data-role-match={fulfillmentStepMatchesRole(step, role)}>
                <button
                  type="button"
                  aria-pressed={current.stage === step.stage}
                  aria-controls={detailID}
                  onClick={() => {
                  setSelection({ role, stage: step.stage })
                  if (window.matchMedia('(max-width: 800px)').matches) {
                    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
                  }
                }}
                >
                  <span>{index + 1}</span><strong>{step.label}</strong><small>{step.role}</small>
                  {step.approvals?.length ? <small className="erp-dev-fulfillment-guide__marker">含审批</small> : null}
                  {step.exception ? <small className="erp-dev-fulfillment-guide__marker">可查看异常处理</small> : null}
                </button>
              </li>
            ))}
          </ol>
          <div className="erp-dev-fulfillment-guide__result" id={detailID} ref={detailRef} aria-live="polite">
            <strong>{current.label}</strong><span>{current.role}</span>
            <p>{current.result}</p>
            {current.handoffs ? <ol>{current.handoffs.map((text) => <li key={text}>{text}</li>)}</ol> : null}
            {current.approvals?.map((approval) => <ApprovalDetails key={approval.label} approval={approval} />)}
            {current.exception ? <div className="erp-dev-fulfillment-guide__exception"><strong>异常交接</strong><p>{current.exception}</p><Button size="small" onClick={() => setView('exception')}>查看异常处理过程</Button></div> : null}
            <div className="erp-dev-fulfillment-guide__links"><strong>查找任务</strong>{links.map((link) => <a key={link.key} href={link.href}>{link.label}</a>)}</div>
            {onExploreStage ? <Button onClick={() => onExploreStage(current.business_chain)}>查看相关单据与规则</Button> : null}
          </div>
        </div>
      ) : (
        <div className="erp-dev-fulfillment-guide__exception-body">
          <p><strong>来料不合格：</strong>IQC 记录问题 → 采购联系供应商退厂或补换 → 仓库交接 → 新到货重新清点、检验。</p>
          <p><strong>裁片、皮套或成品不合格：</strong>从原环节分出处理，保留原批次和质检记录。</p>
          <ol className="erp-dev-fulfillment-guide__exceptions">{catalog.exception_flow.map((label) => <li key={label}>{label}</li>)}</ol>
          <SlidingSegmented aria-label="异常处理方案" value={decision} options={catalog.exception_options} onChange={setDecision} />
          <ApprovalDetails approval={catalog.exception_approval} />
          <p>{decision === '报废放弃'
            ? '批准后由仓库或生产实际执行报废，保留原批次、数量和处置记录；该批次不再回归生产，订单是否补做另行决定。'
            : `${decision}由业务提出，按规则审批；仓库或生产执行后，经过回货点数和 IQC 复检，合格后恢复原环节的后续主链。${decision === '补料重做' ? '重新发布料，从裁片开始重做。' : '保留原货来源、原厂商及后续加工批次。'}`}
          </p>
          <p>再次不合格继续提出新方案；审批通过、待执行、待复检与已闭环分别记录。</p>
          <a href="/erp/task-board?view=exceptions">打开异常记录与统计</a>
        </div>
      )}
      <p className="erp-dev-fulfillment-guide__boundary">业务流程说明；实际岗位分派以任务为准。手工完成后先正式入库，规定检验与查货包装完成后才可发货；工序委外回货按整批实点。</p>
    </section>
  )
}

export function TaskFulfillmentGuideButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>岗位流程与异常分支</Button>
      <Drawer rootClassName="erp-dev-fulfillment-drawer" title="订单全流程" width={1120} open={open} closable={{ placement: 'start' }} closeIcon={<LeftOutlined />} onClose={() => setOpen(false)}>
        <TaskFulfillmentGuide />
      </Drawer>
    </>
  )
}
