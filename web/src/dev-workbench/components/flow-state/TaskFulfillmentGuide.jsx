import React from 'react'
import { Button, Drawer, Select } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildSubflowMermaid } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole, selectFulfillmentExceptionGuide } from '../../../erp/utils/workflowFulfillment.mjs'
import './taskFulfillmentGuide.css'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'

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

function ExceptionGuide({ role, onExploreStage, searchParams, setSearchParams }) {
  const guide = selectFulfillmentExceptionGuide(searchParams.get('flow_exception'), role)
  const { plan, steps } = fulfillmentExceptionPath(guide, searchParams.get('flow_decision'))
  const matchingSteps = steps.filter((step) => fulfillmentStepMatchesRole(step, role))
  const selected = steps.find((step) => step.key === searchParams.get('flow_exception_step')) || matchingSteps[0] || steps[0]
  const sourceID = React.useId()
  const detailID = React.useId()
  const links = fulfillmentTaskLinks(guide)
  const diagram = buildSubflowMermaid({
    nodes: steps.map((step) => ({ ...step, label: `${step.label}${role !== 'all' && fulfillmentStepMatchesRole(step, role) ? ' · 所选岗位' : ''}` })),
    edges: steps.slice(1).map((step, index) => ({ from: steps[index].key, to: step.key })),
  })
  const update = (values) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  })
  return (
    <div className="erp-dev-fulfillment-guide__exception-body" data-exception-guide={guide.key}>
      <div className="erp-dev-fulfillment-guide__exception-source">
        <label htmlFor={sourceID}>异常来源</label>
        <Select
          id={sourceID}
          aria-label="异常来源"
          value={guide.key}
          virtual={false}
          options={catalog.exception_guides.map((item) => ({ value: item.key, label: item.label }))}
          onChange={(value) => update({ flow_exception: value, flow_decision: null, flow_exception_step: null })}
        />
        <p>{guide.source}</p>
      </div>
      <div className="erp-dev-fulfillment-guide__exception-plans">
        <span>处理方案</span>
        <SlidingSegmented
          aria-label="异常处理方案"
          value={plan.key}
          options={guide.plans.map((item) => ({ value: item.key, label: item.label }))}
          onChange={(value) => update({ flow_exception: guide.key, flow_decision: value, flow_exception_step: null })}
        />
      </div>
      {role !== 'all' ? <p className="erp-dev-fulfillment-guide__focus" role="status">{matchingSteps.length ? `本方案有 ${matchingSteps.length} 个环节涉及该岗位，已突出显示；其他岗位的交接继续保留。` : '本方案没有固定登记给该岗位的办理环节，可查看上下游分工；实际审批责任人以任务为准。'}</p> : null}
      <div className="erp-dev-fulfillment-guide__exception-path">
        <div className="erp-dev-fulfillment-guide__exception-diagram">
          <MermaidDiagram
            chart={diagram.chart}
            label={`${guide.label} · ${plan.label}`}
            initialZoom={1}
            nativeSize
            interactiveNodes={diagram.nodes}
            selectedNodeId={diagram.nodes.find((item) => item.key === selected.key).id}
            onNodeSelect={(id) => update({ flow_exception: guide.key, flow_decision: plan.key, flow_exception_step: diagram.nodes.find((item) => item.id === id).key })}
            showSourceOnError={false}
          />
          <details className="erp-dev-fulfillment-guide__substep-list">
            <summary>按文字选择处理步骤</summary>
            <ol className="erp-dev-fulfillment-guide__exception-steps" aria-label="异常处理岗位步骤">
              {steps.map((step, index) => (
                <li key={step.key} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
                  <button
                    className="erp-dev-fulfillment-guide__exception-step"
                    type="button"
                    aria-pressed={selected.key === step.key}
                    aria-controls={detailID}
                    onClick={() => update({ flow_exception: guide.key, flow_decision: plan.key, flow_exception_step: step.key })}
                  >
                    <span>{index + 1}</span><span><strong>{step.label}</strong><small>{step.role}{role !== 'all' && fulfillmentStepMatchesRole(step, role) ? <span className="erp-dev-fulfillment-guide__role-match">所选岗位</span> : null}</small></span>
                  </button>
                </li>
          ))}
            </ol>
          </details>
        </div>
        <div className="erp-dev-fulfillment-guide__exception-detail" id={detailID} aria-live="polite">
          <h3>{selected.label}</h3>
          <span className="erp-dev-fulfillment-guide__owner">办理岗位：{selected.role}</span>
          <p>{selected.result}</p>
          <section className="erp-dev-fulfillment-guide__exception-closure"><h4>这个方案怎样结束</h4><p>{plan.closure}</p></section>
          <section><h4>遇到问题或需要撤销</h4><p>{plan.recovery}</p></section>
          {guide.approval ? <section><h4>审批不通过 / 取消</h4><p>{guide.approval.rejected}</p><p>{guide.approval.withdrawal}</p></section> : null}
          <div className="erp-dev-fulfillment-guide__links">
            {links.length ? <strong>查找任务</strong> : null}
            {links.map((link) => <a key={link.key} href={link.href}>{link.pathLabel}</a>)}
            <a href="/erp/task-board?view=exceptions">查看异常跟踪与统计</a>
          </div>
          {onExploreStage ? <Button onClick={() => onExploreStage(guide.business_chain)}>查看相关单据与规则</Button> : null}
        </div>
      </div>
    </div>
  )
}

export default function TaskFulfillmentGuide({
  onExploreStage,
  onExploreNode,
  steps = catalog.fulfillment_flow,
  scoped = false,
  topics,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeFulfillmentRole(searchParams.get('flow_role'))
  const roleSelectID = React.useId()
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const detailRef = React.useRef(null)
  const requestedView = searchParams.get(queryKeys.roleTab)
  const view = searchParams.get(queryKeys.exception) ? 'exception'
    : !scoped && topics && requestedView === 'topics' ? 'topics' : 'main'
  const setView = (value) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    if (value !== 'main') next.set(queryKeys.roleTab, value)
    else next.delete(queryKeys.roleTab)
    next.delete(queryKeys.exception)
    next.delete(queryKeys.exceptionDecision)
    next.delete(queryKeys.exceptionStep)
    return next
  })
  const matchingSteps = steps.filter((step) => fulfillmentStepMatchesRole(step, role))
  const current = steps.find((step) => step.stage === searchParams.get('flow_stage')) || matchingSteps[0] || steps[0]
  const currentException = catalog.exception_guides.find((guide) => guide.entry_stages.includes(current.stage))
  const openCurrentException = () => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set('flow_stage', current.stage)
    next.set('flow_exception', currentException.key)
    next.delete('flow_decision')
    next.delete('flow_exception_step')
    return next
  })
  const closeException = () => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    next.delete(queryKeys.exception)
    next.delete(queryKeys.exceptionDecision)
    next.delete(queryKeys.exceptionStep)
    return next
  })
  const changeRole = (value) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    if (value === 'all') next.delete('flow_role')
    else next.set('flow_role', value)
    if (view !== 'exception') {
      const first = steps.find((step) => fulfillmentStepMatchesRole(step, value))
      if (first) next.set('flow_stage', first.stage)
      else next.delete('flow_stage')
      next.delete(queryKeys.roleSubstep)
    }
    next.delete('flow_exception_step')
    return next
  })
  const links = fulfillmentTaskLinks(current)
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide" aria-label="岗位履约流程" data-scoped-guide={scoped || undefined}>
      <div className="erp-dev-fulfillment-guide__heading">
        <div><h2>{view === 'exception' ? '异常处理' : scoped ? '岗位分工与交接' : view === 'topics' ? '按业务查阅' : '订单全流程'}</h2><p>{view === 'exception' ? `从“${current.label}”查看异常的分工、处理结果和恢复方式。` : scoped ? '沿同一条业务链查看谁来办、完成条件和交接结果。' : view === 'topics' ? '选择一段业务，查看岗位分工、完成条件和前后交接。' : '选择关注岗位，查看负责的环节、完成条件和前后交接。'}</p></div>
        <div className="erp-dev-fulfillment-guide__navigation">
          <div className="erp-dev-fulfillment-guide__role">
            <label htmlFor={roleSelectID}>关注岗位</label>
            <Select id={roleSelectID} aria-label="关注岗位" value={role} options={fulfillmentRoleOptions} onChange={changeRole} virtual={false} />
          </div>
          {view === 'exception' ? <Button aria-label={`返回${current.label}`} icon={<LeftOutlined />} onClick={closeException}>返回{current.label}</Button>
            : !scoped && topics ? <Button onClick={() => setView(view === 'topics' ? 'main' : 'topics')}>{view === 'topics' ? '返回完整流程' : '按业务查阅'}</Button> : null}
        </div>
      </div>
      {view === 'main' && role !== 'all' ? <p className="erp-dev-fulfillment-guide__focus" role="status">{matchingSteps.length ? `已突出 ${matchingSteps.length} 个涉及该岗位的环节，上下游交接仍完整保留。` : '该流程没有登记该岗位的办理环节，以下保留完整交接供参考。'}</p> : null}
      {view === 'main' ? (
        <div className="erp-dev-fulfillment-guide__body">
          <ol className="erp-dev-fulfillment-guide__steps" aria-label={`全部 ${steps.length} 个环节`} ref={overviewRef}>
            {steps.map((step, index) => (
              <li key={step.stage} data-fulfillment-stage={step.stage} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
                <button
                  type="button"
                  aria-pressed={current.stage === step.stage}
                  aria-controls={detailID}
                  onClick={() => {
                  setSearchParams((previous) => {
                    const next = new URLSearchParams(previous)
                    next.set('flow_stage', step.stage)
                    next.delete(queryKeys.roleSubstep)
                    return next
                  })
                  if (window.matchMedia('(max-width: 800px)').matches) {
                    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
                  }
                }}
                >
                  <span className="erp-dev-fulfillment-guide__step-number">{index + 1}</span>
                  <strong>{step.label}</strong>
                  {step.branch || (role !== 'all' && fulfillmentStepMatchesRole(step, role)) ? (
                    <span className="erp-dev-fulfillment-guide__step-meta">
                      {step.branch ? <span>条件分支</span> : null}
                      {role !== 'all' && fulfillmentStepMatchesRole(step, role) ? <span className="erp-dev-fulfillment-guide__role-match">所选岗位</span> : null}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
          <div className="erp-dev-fulfillment-guide__result" id={detailID} ref={detailRef} aria-live="polite">
            <div className="erp-dev-fulfillment-guide__detail-heading">
              <div><p>第 {steps.indexOf(current) + 1} / {steps.length} 环节{current.branch ? ' · 条件分支' : ''}</p><h3>{current.label}</h3></div>
              <span className="erp-dev-fulfillment-guide__owner">办理岗位：{current.role}</span>
              <Button
                className="erp-dev-fulfillment-guide__back-to-overview"
                onClick={() => {
                  overviewRef.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true })
                  overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }}
              >
                返回全部环节
              </Button>
            </div>
            {current.subflow ? <FulfillmentSubflow step={current} searchParams={searchParams} setSearchParams={setSearchParams} onOpenException={currentException ? openCurrentException : undefined} /> : null}
            <div className="erp-dev-fulfillment-guide__detail-content">
              <section><h4>完成条件与结果</h4><p>{current.result}</p></section>
              {current.handoffs || current.approvals?.length ? (
                <details className="erp-dev-fulfillment-guide__instructions" key={current.stage} open={current.subflow ? undefined : true}>
                  <summary>完整交接与审批说明</summary>
                  {current.handoffs ? <section><h4>怎样交接</h4><ol>{current.handoffs.map((text) => <li key={text}>{text}</li>)}</ol></section> : null}
                  {current.approvals?.map((approval) => <ApprovalDetails key={approval.label} approval={approval} />)}
                </details>
              ) : null}
              {current.exception ? <div className="erp-dev-fulfillment-guide__exception"><strong>异常交接</strong><p>{current.exception}</p>{currentException ? <Button size="small" onClick={openCurrentException}>查看异常处理过程</Button> : null}</div> : null}
            </div>
            <div className="erp-dev-fulfillment-guide__detail-actions">
              {links.length ? <div className="erp-dev-fulfillment-guide__links"><strong>查找任务</strong>{links.map((link) => <a key={link.key} href={link.href}>{link.label}</a>)}</div> : null}
              {onExploreStage ? <Button onClick={() => onExploreStage(current.business_chain)}>查看相关单据与规则</Button> : null}
              {onExploreNode && current.nodeKey ? <Button onClick={() => onExploreNode(current.nodeKey)}>查看相关单据与规则</Button> : null}
            </div>
          </div>
        </div>
      ) : view === 'topics' ? topics : (
        <ExceptionGuide role={role} onExploreStage={onExploreStage} searchParams={searchParams} setSearchParams={setSearchParams} />
      )}
      <p className="erp-dev-fulfillment-guide__boundary">{view === 'topics' ? '岗位范围来自正式职责目录；筛选不改变权限，流程说明不代表某笔业务已完成。' : view === 'exception' ? '这里展示现有异常办理规则；审批岗位筛选按默认责任投影，实际分派以有效流程和任务为准。审批、执行、复检与业务结果分别核对。' : scoped ? '这是业务设计说明，实际分派以任务为准；岗位筛选不改变权限，也不表示某笔业务已经完成。分支按条件办理，展示顺序不代表全部必经。' : '业务流程说明；实际岗位分派以任务为准。手工完成后先正式入库，规定检验与查货包装完成后才可发货；工序委外回货按整批实点。'}</p>
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
