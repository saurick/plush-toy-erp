import React from 'react'
import { Button, Drawer, Select } from 'antd'
import { BranchesOutlined, LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildSubflowMermaid } from '../../config/devFulfillmentSubflow.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole, selectFulfillmentExceptionGuide } from '../../../erp/utils/workflowFulfillment.mjs'
import './taskFulfillmentGuide.css'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'
import { buildFulfillmentExceptionDirectory, buildFulfillmentOverview, getFulfillmentStageContext, getFulfillmentStageCopy, getFulfillmentSubstepCopy, getFulfillmentSupplement } from '../../config/devFulfillmentPresentation.mjs'

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
  const roleLabel = fulfillmentRoleOptions.find((option) => option.value === role).label
  const guide = selectFulfillmentExceptionGuide(searchParams.get('flow_exception'), role)
  const { plan, steps } = fulfillmentExceptionPath(guide, searchParams.get('flow_decision'))
  const matchingSteps = steps.filter((step) => fulfillmentStepMatchesRole(step, role))
  const selected = steps.find((step) => step.key === searchParams.get('flow_exception_step')) || matchingSteps[0] || steps[0]
  const sourceID = React.useId()
  const detailID = React.useId()
  const stepSelectID = React.useId()
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
      {role !== 'all' ? <p className="erp-dev-fulfillment-guide__focus" role="status">{matchingSteps.length ? `${roleLabel}参与 ${matchingSteps.length} / ${steps.length} 个步骤` : `本方案未登记${roleLabel}的固定职责，保留完整流程。`}</p> : null}
      <div className="erp-dev-fulfillment-guide__exception-path">
        <div className="erp-dev-fulfillment-guide__exception-diagram">
          <MermaidDiagram
            chart={diagram.chart}
            label={`${guide.label} · ${plan.label}`}
            nativeSize
            interactiveNodes={diagram.nodes}
            selectedNodeId={diagram.nodes.find((item) => item.key === selected.key).id}
            onNodeSelect={(id) => update({ flow_exception: guide.key, flow_decision: plan.key, flow_exception_step: diagram.nodes.find((item) => item.id === id).key })}
            showSourceOnError={false}
          />
        </div>
        <div className="erp-dev-fulfillment-guide__exception-detail" id={detailID} aria-live="polite">
          <div className="erp-dev-fulfillment-guide__substep-heading">
            <label htmlFor={stepSelectID}>步骤</label>
            <Select id={stepSelectID} aria-label="查看异常步骤" value={selected.key} options={steps.map((step) => ({ value: step.key, label: step.label }))} virtual={false} onChange={(value) => update({ flow_exception: guide.key, flow_decision: plan.key, flow_exception_step: value })} />
            <span className="erp-dev-fulfillment-guide__owner">{selected.role}</span>
          </div>
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

function FulfillmentStageOverview({ steps, scoped, role, selectedStage, detailID, overviewRef, onSelect }) {
  const renderSteps = (items, label, conditional = false) => (
    <ol className={`erp-dev-fulfillment-guide__steps${conditional ? ' erp-dev-fulfillment-guide__conditional-steps' : ''}`} aria-label={label} style={{ '--fulfillment-columns': items.length }}>
      {items.map(({ step, number, label: shortLabel, hint }) => (
        <li key={step.stage} data-fulfillment-stage={step.stage} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
          <button type="button" aria-label={`${number} ${step.label}`} aria-pressed={selectedStage === step.stage} aria-expanded={selectedStage === step.stage} aria-controls={selectedStage ? detailID : undefined} title={step.label} onClick={() => onSelect(step.stage)}>
            <span className="erp-dev-fulfillment-guide__step-number">{number}</span>
            <span className="erp-dev-fulfillment-guide__step-copy"><strong>{shortLabel}</strong>{hint ? <small>{hint}</small> : null}{catalog.exception_guides.some((guide) => guide.entry_stages.includes(step.stage)) ? <small className="erp-dev-fulfillment-guide__exception-mark"><BranchesOutlined />异常路径</small> : null}</span>
          </button>
        </li>
      ))}
    </ol>
  )
  if (scoped) return <div ref={overviewRef}>{renderSteps(steps.map((step, index) => ({ step, number: index + 1, label: step.label, hint: step.branch ? '条件分支' : '' })), `全部 ${steps.length} 个环节`)}</div>
  return (
    <div className="erp-dev-fulfillment-guide__overview" ref={overviewRef} aria-label={`全部 ${steps.length} 个环节`}>
      <div className="erp-dev-fulfillment-guide__overview-heading"><strong>{steps.length} 个环节 · 总链位置</strong><span>保留全部岗位</span></div>
      {buildFulfillmentOverview(steps).map((phase) => (
        <section className="erp-dev-fulfillment-guide__phase" key={phase.key} aria-label={phase.label}>
          <h3>{phase.label}</h3>
          {renderSteps(phase.stages, `${phase.label}环节`)}
          {phase.branches.length ? renderSteps(phase.branches, '按约定穿插办理的收付款', true) : null}
        </section>
      ))}
      <div className="erp-dev-fulfillment-guide__overview-note"><span>虚线：按约定穿插办理首款 / 分期</span><span>序号用于定位；具体依赖见子流程</span></div>
    </div>
  )
}

function ExceptionFlowDirectory({ open, onClose, onSelect, role, stage, roleLabel }) {
  const items = buildFulfillmentExceptionDirectory(catalog.exception_guides, role, stage)
  const matchingCount = items.filter((item) => item.roleMatch).length
  return (
    <Drawer rootClassName="erp-dev-exception-directory" title="异常流程" width={640} open={open} onClose={onClose} closable={{ placement: 'start' }} closeIcon={<LeftOutlined />}>
      <p className="erp-dev-exception-directory__scope">{role === 'all' ? `全部 ${items.length} 类异常` : matchingCount ? `${roleLabel}参与 ${matchingCount} / ${items.length} 类异常` : `未登记${roleLabel}固定职责 · 全部 ${items.length} 类可查看`}</p>
      <ul className="erp-dev-exception-directory__list">
        {items.map(({ guide, related, roleMatch }) => (
          <li key={guide.key} data-exception-entry={guide.key} data-role-match={role === 'all' ? undefined : roleMatch}>
            <button type="button" onClick={() => onSelect(guide)}>
              <span><strong>{guide.label}</strong><small>{guide.plans.map((plan) => plan.label).join(' · ')}</small></span>
              <span className="erp-dev-exception-directory__marks">{related ? <span>本环节</span> : null}{role !== 'all' && roleMatch ? <span>{roleLabel}参与</span> : null}<span aria-hidden="true">→</span></span>
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
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
  const [exceptionDirectoryOpen, setExceptionDirectoryOpen] = React.useState(false)
  const role = normalizeFulfillmentRole(searchParams.get('flow_role'))
  const roleSelectID = React.useId()
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const detailRef = React.useRef(null)
  const headingRef = React.useRef(null)
  const pendingDetailScroll = React.useRef(null)
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
  const requestedStep = steps.find((step) => step.stage === searchParams.get('flow_stage'))
  const current = requestedStep || matchingSteps[0] || steps[0]
  const detailOpen = scoped || Boolean(requestedStep)
  React.useEffect(() => {
    if (view !== 'main' || !pendingDetailScroll.current) return
    if (pendingDetailScroll.current === 'overview') {
      pendingDetailScroll.current = null
      overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (!detailOpen || pendingDetailScroll.current !== current.stage) return
    pendingDetailScroll.current = null
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [view, current.stage, detailOpen])
  React.useEffect(() => {
    if (view === 'exception') headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [view])
  const context = scoped ? null : getFulfillmentStageContext(steps, current.stage)
  const currentRoleLabel = fulfillmentRoleOptions.find((option) => option.value === role).label
  const currentDuties = current.subflow?.nodes.filter((node) => fulfillmentStepMatchesRole(node, role)) || []
  const currentException = catalog.exception_guides.find((guide) => guide.entry_stages.includes(current.stage))
  const supplement = getFulfillmentSupplement(current)
  const hasSupplement = Boolean(supplement.handoffs.length || supplement.approvals.length || supplement.exception)
  const returnLabel = !scoped && requestedView === 'topics' ? '业务目录' : detailOpen ? current.label : '订单全流程'
  const openException = (guide, substep) => {
    setExceptionDirectoryOpen(false)
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (scoped || substep) next.set(queryKeys.roleStage, current.stage)
      if (substep) next.set(queryKeys.roleSubstep, substep)
      next.set(queryKeys.exception, guide.key)
      next.delete(queryKeys.exceptionDecision)
      next.delete(queryKeys.exceptionStep)
      return next
    })
  }
  const closeException = () => {
    pendingDetailScroll.current = detailOpen ? current.stage : 'overview'
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(queryKeys.exception)
      next.delete(queryKeys.exceptionDecision)
      next.delete(queryKeys.exceptionStep)
      return next
    })
  }
  const changeRole = (value) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    if (value === 'all') next.delete('flow_role')
    else next.set('flow_role', value)
    if (view !== 'exception' && scoped) {
      const first = steps.find((step) => fulfillmentStepMatchesRole(step, value))
      if (first) next.set('flow_stage', first.stage)
      else next.delete('flow_stage')
    }
    if (view !== 'exception') next.delete(queryKeys.roleSubstep)
    next.delete('flow_exception_step')
    return next
  })
  const selectStage = (stage) => {
    if (!scoped || window.matchMedia('(max-width: 800px)').matches) {
      if (detailOpen && current.stage === stage) detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      else pendingDetailScroll.current = stage
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set(queryKeys.roleStage, stage)
      next.delete(queryKeys.roleSubstep)
      return next
    })
  }
  const closeDetail = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(queryKeys.roleStage)
      next.delete(queryKeys.roleSubstep)
      return next
    })
    requestAnimationFrame(() => {
      overviewRef.current?.querySelector(`[data-fulfillment-stage="${current.stage}"] button`)?.focus({ preventScroll: true })
      overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }
  const links = fulfillmentTaskLinks(current)
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide" aria-label="岗位履约流程" data-scoped-guide={scoped || undefined}>
      <div className="erp-dev-fulfillment-guide__heading" ref={headingRef}>
        <div><h2>{view === 'exception' ? '异常处理' : scoped ? '岗位分工与交接' : view === 'topics' ? '按业务查阅' : '订单全流程'}</h2>{view === 'exception' ? <p>返回位置：{returnLabel}</p> : null}</div>
        <div className="erp-dev-fulfillment-guide__navigation">
          <div className="erp-dev-fulfillment-guide__role">
            <label htmlFor={roleSelectID}>关注岗位</label>
            <Select id={roleSelectID} aria-label="关注岗位" value={role} options={fulfillmentRoleOptions} onChange={changeRole} virtual={false} />
          </div>
          <Button aria-label="异常流程" icon={<BranchesOutlined />} onClick={() => setExceptionDirectoryOpen(true)}>异常流程</Button>
          {view === 'exception' ? <Button aria-label={`返回${returnLabel}`} icon={<LeftOutlined />} onClick={closeException}>返回{returnLabel}</Button>
            : !scoped && topics ? <Button onClick={() => setView(view === 'topics' ? 'main' : 'topics')}>{view === 'topics' ? '返回完整流程' : '按业务查阅'}</Button> : null}
        </div>
      </div>
      {view === 'main' ? <div className="erp-dev-fulfillment-guide__scope-bar"><span role="status">{role === 'all' ? `全部 ${steps.length} 个环节` : matchingSteps.length ? `${currentRoleLabel}参与 ${matchingSteps.length} / ${steps.length} 个环节` : '该流程没有登记该岗位的办理环节，以下保留完整交接供参考。'}</span><span className="erp-dev-fulfillment-guide__legend">{role !== 'all' ? <span><i aria-hidden="true" />岗位参与</span> : null}<span><i className="erp-dev-fulfillment-guide__selected-mark" aria-hidden="true" />当前展开</span></span></div> : null}
      {view === 'main' ? (
        <div className="erp-dev-fulfillment-guide__body">
          <FulfillmentStageOverview steps={steps} scoped={scoped} role={role} selectedStage={detailOpen ? current.stage : null} detailID={detailID} overviewRef={overviewRef} onSelect={selectStage} />
          {detailOpen ? (
            <div className="erp-dev-fulfillment-guide__result" id={detailID} ref={detailRef} aria-live="polite">
              <div className="erp-dev-fulfillment-guide__detail-heading">
                <div><p>{scoped ? '当前业务' : '总链位置'} · 第 {steps.indexOf(current) + 1} / {steps.length} 环节{current.branch ? ' · 条件分支' : ''}</p><h3>{current.label}</h3></div>
                <div className="erp-dev-fulfillment-guide__navigation">
                  {currentException ? <Button icon={<BranchesOutlined />} aria-label={`本环节异常：${currentException.label}`} onClick={() => openException(currentException)}>本环节异常</Button> : null}
                  {!scoped ? <Button onClick={closeDetail}>收起环节</Button> : null}
                </div>
                {scoped ? (
                  <Button
                    className="erp-dev-fulfillment-guide__back-to-overview"
                    onClick={() => {
                  overviewRef.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true })
                  overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }}
                  >
                    返回全部环节
                  </Button>
              ) : null}
              </div>
              <p className="erp-dev-fulfillment-guide__owner">{role === 'all' ? `办理岗位：${current.role}` : currentDuties.length ? `${currentRoleLabel}负责：${currentDuties.map(getFulfillmentSubstepCopy).join('、')}` : fulfillmentStepMatchesRole(current, role) ? `办理岗位：${current.role}` : `本环节未登记${currentRoleLabel}职责，保留交接上下文。`}</p>
              {context ? (
                <div className="erp-dev-fulfillment-guide__stage-context">
                  {context.previous ? <span>前一段 <Button size="small" onClick={() => selectStage(context.previous.stage)}>{steps.indexOf(context.previous) + 1} {getFulfillmentStageCopy(context.previous).label}</Button></span> : null}
                  {context.next ? <span>后一段 <Button size="small" onClick={() => selectStage(context.next.stage)}>{steps.indexOf(context.next) + 1} {getFulfillmentStageCopy(context.next).label}</Button></span> : null}
                  {context.related.length ? <span className="erp-dev-fulfillment-guide__related">按约定关联 {context.related.map(({ step, label }) => <Button size="small" key={step.stage} title={step.label} onClick={() => selectStage(step.stage)}>{steps.indexOf(step) + 1} {label}</Button>)}</span> : null}
                </div>
            ) : null}
              {current.subflow ? <FulfillmentSubflow step={current} role={role} searchParams={searchParams} setSearchParams={setSearchParams} onOpenException={currentException ? (substep) => openException(currentException, substep) : undefined} /> : null}
              {!current.subflow || hasSupplement ? (
                <div className="erp-dev-fulfillment-guide__detail-content">
                  {!current.subflow ? <section><h4>完成条件与结果</h4><p>{current.result}</p></section> : null}
                  {hasSupplement ? (
                    <details className="erp-dev-fulfillment-guide__instructions" key={current.stage}>
                      <summary>其他交接说明</summary>
                      {supplement.handoffs.length ? <ol>{supplement.handoffs.map((text) => <li key={text}>{text}</li>)}</ol> : null}
                      {supplement.approvals.map((approval) => <ApprovalDetails key={approval.label} approval={approval} />)}
                      {supplement.exception ? <p>{supplement.exception}</p> : null}
                    </details>
              ) : null}
                </div>
            ) : null}
              <div className="erp-dev-fulfillment-guide__detail-actions">
                {links.length ? <div className="erp-dev-fulfillment-guide__links"><strong>查找任务</strong>{links.map((link) => <a key={link.key} href={link.href}>{link.label}</a>)}</div> : null}
                {onExploreStage ? <Button onClick={() => onExploreStage(current.business_chain)}>查看相关单据与规则</Button> : null}
                {onExploreNode && current.nodeKey ? <Button onClick={() => onExploreNode(current.nodeKey)}>查看相关单据与规则</Button> : null}
              </div>
            </div>
          ) : <p className="erp-dev-fulfillment-guide__empty-selection">点开一个环节，查看职责、分支与交接</p>}
        </div>
      ) : view === 'topics' ? topics : (
        <ExceptionGuide role={role} onExploreStage={onExploreStage} searchParams={searchParams} setSearchParams={setSearchParams} />
      )}
      <p className="erp-dev-fulfillment-guide__boundary">{view === 'exception' ? '审批、执行与实际业务结果分别核对；实际分派以有效流程和任务为准。' : '岗位职责示意 · 非实际办理进度；岗位筛选不改变权限。'}</p>
      <ExceptionFlowDirectory open={exceptionDirectoryOpen} onClose={() => setExceptionDirectoryOpen(false)} onSelect={openException} role={role} stage={detailOpen ? current.stage : undefined} roleLabel={currentRoleLabel} />
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
