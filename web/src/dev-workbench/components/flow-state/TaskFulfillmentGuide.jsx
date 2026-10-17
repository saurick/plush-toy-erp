import React from 'react'
import { Button, Drawer, Select } from 'antd'
import { BranchesOutlined, LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole } from '../../../erp/utils/workflowFulfillment.mjs'
import './taskFulfillmentGuide.css'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'
import FulfillmentChainCanvas from './FulfillmentChainCanvas.jsx'
import { buildFulfillmentExceptionDirectory, getFulfillmentStageContext, getFulfillmentStageCopy, getFulfillmentSubstepCopy, getFulfillmentSupplement } from '../../config/devFulfillmentPresentation.mjs'

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

function ScopedStageOverview({ steps, role, selectedStage, detailID, overviewRef, onSelect }) {
  return (
    <div ref={overviewRef}>
      <ol className="erp-dev-fulfillment-guide__steps" aria-label={`全部 ${steps.length} 个环节`}>
        {steps.map((step, index) => (
          <li key={step.stage} data-fulfillment-stage={step.stage} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
            <button type="button" aria-label={`${index + 1} ${step.label}`} aria-pressed={selectedStage === step.stage} aria-expanded={selectedStage === step.stage} aria-controls={detailID} onClick={() => onSelect(step.stage)}><span className="erp-dev-fulfillment-guide__step-number">{index + 1}</span><span className="erp-dev-fulfillment-guide__step-copy"><strong>{step.label}</strong>{step.branch ? <small>条件分支</small> : null}</span></button>
          </li>
        ))}
      </ol>
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
    next.delete(queryKeys.exceptionOrigin)
    return next
  })
  const requestedStep = steps.find((step) => step.stage === searchParams.get('flow_stage'))
  const current = requestedStep || steps.find((step) => fulfillmentStepMatchesRole(step, role)) || steps[0]
  const detailOpen = scoped || Boolean(requestedStep)
  React.useEffect(() => {
    if (!scoped || view !== 'main' || !pendingDetailScroll.current) return
    if (pendingDetailScroll.current === 'overview') {
      pendingDetailScroll.current = null
      overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (!detailOpen || pendingDetailScroll.current !== current.stage) return
    pendingDetailScroll.current = null
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [scoped, view, current.stage, detailOpen])
  const context = scoped ? null : getFulfillmentStageContext(steps, current.stage)
  const currentRoleLabel = fulfillmentRoleOptions.find((option) => option.value === role).label
  const currentDuties = current.subflow?.nodes.filter((node) => fulfillmentStepMatchesRole(node, role)) || []
  const currentExceptions = catalog.exception_guides.filter((guide) => guide.entry_stages.includes(current.stage))
  const currentException = currentExceptions[0]
  const supplement = getFulfillmentSupplement(current)
  const hasSupplement = Boolean(supplement.handoffs.length || supplement.approvals.length || supplement.exception)
  const returnLabel = !scoped && requestedView === 'topics' ? '业务目录' : detailOpen ? current.label : '订单全流程'
  const openException = (guide, substep, origin) => {
    setExceptionDirectoryOpen(false)
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      const sameSource = next.get(queryKeys.exception) === guide.key
      if (scoped || substep) next.set(queryKeys.roleStage, current.stage)
      if (substep) next.set(queryKeys.roleSubstep, substep)
      next.set(queryKeys.exception, guide.key)
      if (origin) next.set(queryKeys.exceptionOrigin, origin)
      else next.delete(queryKeys.exceptionOrigin)
      if (!sameSource) {
        next.delete(queryKeys.exceptionDecision)
        next.delete(queryKeys.exceptionStep)
      }
      return next
    })
  }
  const closeException = (origin) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(queryKeys.exception)
      next.delete(queryKeys.exceptionDecision)
      next.delete(queryKeys.exceptionStep)
      next.delete(queryKeys.exceptionOrigin)
      return next
    })
    const focusStage = detailOpen ? current.stage : typeof origin === 'string' ? origin : null
    requestAnimationFrame(() => overviewRef.current?.querySelector(`[data-fulfillment-stage="${focusStage}"] button`)?.focus({ preventScroll: true }))
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
    if (view === 'exception' && previous.get(queryKeys.exceptionStep)) {
      const guide = catalog.exception_guides.find((item) => item.key === previous.get(queryKeys.exception))
      if (guide) {
        const { steps: pathSteps } = fulfillmentExceptionPath(guide, previous.get(queryKeys.exceptionDecision))
        const selected = pathSteps.find((step) => fulfillmentStepMatchesRole(step, value)) || pathSteps[0]
        next.set(queryKeys.exceptionStep, selected.key)
      }
    }
    return next
  })
  const selectStage = (stage) => {
    if (scoped && view === 'main' && window.matchMedia('(max-width: 800px)').matches) pendingDetailScroll.current = stage
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (scoped && view === 'exception') {
        next.set(queryKeys.chain, 'all')
        next.delete(queryKeys.node)
      }
      next.delete(queryKeys.roleTab)
      next.set(queryKeys.roleStage, stage)
      next.delete(queryKeys.roleSubstep)
      next.delete(queryKeys.exception)
      next.delete(queryKeys.exceptionOrigin)
      next.delete(queryKeys.exceptionDecision)
      next.delete(queryKeys.exceptionStep)
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
      overviewRef.current?.querySelector(`[data-fulfillment-stage="${current.stage}"] button`)?.scrollIntoView({ block: 'nearest' })
    })
  }
  const links = fulfillmentTaskLinks(current)
  const canvasVisible = view === 'exception' || (!scoped && view === 'main')
  const displaySteps = canvasVisible ? catalog.fulfillment_flow : steps
  const visibleMatches = displaySteps.filter((step) => fulfillmentStepMatchesRole(step, role))
  const stageDetail = detailOpen ? (
    <div className="erp-dev-fulfillment-guide__result" id={detailID} ref={detailRef} aria-live="polite">
      <div className="erp-dev-fulfillment-guide__detail-heading">
        <div><p>{scoped ? '当前业务' : '总链位置'} · 第 {steps.indexOf(current) + 1} / {steps.length} 环节{current.branch ? ' · 条件分支' : ''}</p><h3>{current.label}</h3></div>
        <div className="erp-dev-fulfillment-guide__navigation">
          {currentException ? <Button icon={<BranchesOutlined />} aria-label={currentExceptions.length > 1 ? '本环节异常' : `本环节异常：${currentException.label}`} onClick={() => currentExceptions.length > 1 ? setExceptionDirectoryOpen(true) : openException(currentException)}>本环节异常{currentExceptions.length > 1 ? `（${currentExceptions.length}）` : ''}</Button> : null}
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
      {current.subflow ? <FulfillmentSubflow step={current} role={role} searchParams={searchParams} setSearchParams={setSearchParams} onOpenException={(substep, guideKey) => { const related = currentExceptions.find((item) => item.key === guideKey); if (related) openException(related, substep) }} /> : null}
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
  ) : null
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide" aria-label="岗位履约流程" data-scoped-guide={scoped || undefined}>
      <div className="erp-dev-fulfillment-guide__heading">
        <h2>{canvasVisible ? '订单全流程' : scoped ? '岗位分工与交接' : '按业务查阅'}</h2>
        <div className="erp-dev-fulfillment-guide__navigation">
          <div className="erp-dev-fulfillment-guide__role"><label htmlFor={roleSelectID}>关注岗位</label><Select id={roleSelectID} aria-label="关注岗位" value={role} options={fulfillmentRoleOptions} onChange={changeRole} virtual={false} /></div>
          <Button aria-label="异常流程" icon={<BranchesOutlined />} onClick={() => setExceptionDirectoryOpen(true)}>异常流程</Button>
          {view === 'exception' && (scoped || requestedView === 'topics') ? <Button aria-label={`返回${returnLabel}`} icon={<LeftOutlined />} onClick={() => closeException()}>返回{returnLabel}</Button>
            : !scoped && topics ? <Button onClick={() => setView(view === 'topics' ? 'main' : 'topics')}>{view === 'topics' ? '返回完整流程' : '按业务查阅'}</Button> : null}
        </div>
      </div>
      {canvasVisible || view === 'main' ? <div className="erp-dev-fulfillment-guide__scope-bar"><span role="status">{role === 'all' ? `全部 ${displaySteps.length} 个环节` : visibleMatches.length ? `${currentRoleLabel}参与 ${visibleMatches.length} / ${displaySteps.length} 个环节` : '该流程没有登记该岗位的办理环节，以下保留完整交接供参考。'}</span>{role !== 'all' ? <span className="erp-dev-fulfillment-guide__legend"><span><i aria-hidden="true" />岗位职责</span></span> : null}</div> : null}
      {canvasVisible ? (
        <FulfillmentChainCanvas role={role} searchParams={searchParams} setSearchParams={setSearchParams} selectedStage={detailOpen ? current.stage : null} stageDetail={view === 'main' ? stageDetail : null} overviewRef={overviewRef} onSelectStage={selectStage} onOpenException={openException} onCloseException={closeException} onExploreStage={onExploreStage} />
      ) : view === 'topics' ? topics : (
        <div className="erp-dev-fulfillment-guide__body"><ScopedStageOverview steps={steps} role={role} selectedStage={current.stage} detailID={detailID} overviewRef={overviewRef} onSelect={selectStage} />{stageDetail}</div>
      )}
      <p className="erp-dev-fulfillment-guide__boundary">岗位职责示意 · 非实际办理进度；岗位筛选不改变权限。</p>
      <ExceptionFlowDirectory open={exceptionDirectoryOpen} onClose={() => setExceptionDirectoryOpen(false)} onSelect={openException} role={role} stage={detailOpen ? current.stage : undefined} roleLabel={currentRoleLabel} />
    </section>
  )
}

export function TaskFulfillmentGuideButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>岗位流程与异常分支</Button>
      <Drawer rootClassName="erp-dev-fulfillment-drawer" title="订单全流程" width={1120} open={open} closable={{ placement: 'start' }} closeIcon={<LeftOutlined />} onClose={() => setOpen(false)}><TaskFulfillmentGuide /></Drawer>
    </>
  )
}
