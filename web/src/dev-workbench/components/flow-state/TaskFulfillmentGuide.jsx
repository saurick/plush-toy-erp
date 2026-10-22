import React from 'react'
import { Button, Drawer, Dropdown, Select } from 'antd'
import { BranchesOutlined, DownOutlined, LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '../../../common/components/navigation/SlidingSegmented.jsx'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath, fulfillmentHandling, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole } from '../../../erp/utils/workflowFulfillment.mjs'
import './taskFulfillmentGuide.css'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'
import FulfillmentChainCanvas from './FulfillmentChainCanvas.jsx'
import { buildFulfillmentExceptionDirectory, getFulfillmentStageContext, getFulfillmentStageCopy, getFulfillmentSupplement } from '../../config/devFulfillmentPresentation.mjs'

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

function ExceptionGuideEntry({ guides, stage, onOpen }) {
  const entryRef = React.useRef(null)
  if (!guides.length) return null
  const open = (guide) => {
    entryRef.current?.focus({ preventScroll: true })
    onOpen(guide, null, guide.entry_stages.includes(stage) ? stage : null)
  }
  if (guides.length === 1) return <Button ref={entryRef} className="erp-dev-fulfillment-guide__handling-entry" type="link" icon={<BranchesOutlined />} aria-label={`查看${guides[0].label}处理路径`} onClick={() => open(guides[0])}>处理路径</Button>
  return (
    <Dropdown trigger={['click']} menu={{ style: { maxHeight: 'min(60vh, 360px)', overflowY: 'auto' }, items: guides.map((guide) => ({ key: guide.key, label: guide.label, onClick: () => open(guide) })) }}>
      <Button ref={entryRef} className="erp-dev-fulfillment-guide__handling-entry" type="link" icon={<BranchesOutlined />} aria-label="选择异常处理路径">处理路径<DownOutlined /></Button>
    </Dropdown>
  )
}

function ExceptionFlowDirectory({ open, onClose, onSelect, onSelectHandling, steps, role, stage, roleLabel, showAll, onChangeScope }) {
  const current = steps.find((step) => step.stage === stage && step.handling)
  const guides = current && !showAll ? fulfillmentHandling(current).guides : catalog.exception_guides
  const items = buildFulfillmentExceptionDirectory(guides, role, stage)
  const handlingStages = current && !showAll ? [current] : steps.filter((step) => step.handling)
  return (
    <Drawer rootClassName="erp-dev-exception-directory" title="异常目录" width={640} open={open} onClose={onClose} closable={{ placement: 'start' }} closeIcon={<LeftOutlined />}>
      {current ? <SlidingSegmented className="erp-dev-exception-directory__scope" aria-label="异常查看范围" hierarchy="secondary" value={showAll ? 'all' : 'current'} options={[{ value: 'current', label: '本环节' }, { value: 'all', label: '全部' }]} onChange={(value) => onChangeScope(value === 'all')} /> : null}
      {!current || showAll ? <h3>环节问题</h3> : null}
      {handlingStages.length ? (
        <ol className="erp-dev-exception-directory__stages" data-current={Boolean(current && !showAll) || undefined}>
          {handlingStages.map((step) => (
            <li key={step.stage} data-handling-entry={step.stage} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
              <button type="button" onClick={() => onSelectHandling(step.stage)}><span>{catalog.fulfillment_flow.findIndex((item) => item.stage === step.stage) + 1}</span><span className="erp-dev-exception-directory__stage-copy"><strong>{getFulfillmentStageCopy(step).label}</strong><small>{step.handling.issues}</small></span></button>
            </li>
            ))}
        </ol>
      ) : null}
      {items.length && (!current || showAll) ? <h3>处理路径</h3> : null}
      <ul className="erp-dev-exception-directory__list">
        {items.map(({ guide, related, roleMatch }) => (
          <li key={guide.key} data-exception-entry={guide.key} data-role-match={role === 'all' ? undefined : roleMatch}>
            <button type="button" onClick={() => onSelect(guide)}>
              <strong>{guide.label}</strong>
              <span className="erp-dev-exception-directory__marks">{related && showAll ? <span>本环节</span> : null}{!guide.entry_stages.length ? <span>独立业务</span> : null}{role !== 'all' && roleMatch ? <span>{roleLabel}参与</span> : null}<span aria-hidden="true">→</span></span>
            </button>
          </li>
        ))}
      </ul>
      <details className="erp-dev-fulfillment-guide__instructions erp-dev-exception-directory__boundary"><summary>其他问题</summary><p>未列出的问题，可关联来源单据安排跟进、记录受阻原因与处理反馈。正式业务待办由来源单据更新；任务结束不代替实物、检验或款项结果。</p></details>
    </Drawer>
  )
}

export default function TaskFulfillmentGuide({
  onExploreStage,
  onExploreNode,
  steps = catalog.fulfillment_flow,
  scoped = false,
  renderTopics,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [exceptionDirectoryOpen, setExceptionDirectoryOpen] = React.useState(false)
  const [exceptionDirectoryAll, setExceptionDirectoryAll] = React.useState(false)
  const role = normalizeFulfillmentRole(searchParams.get('flow_role'))
  const roleSelectID = React.useId()
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const detailRef = React.useRef(null)
  const pendingDetailScroll = React.useRef(null)
  const exceptionOpenerRef = React.useRef(null)
  const pendingExceptionFocusRef = React.useRef(null)
  const requestedView = searchParams.get(queryKeys.roleTab)
  const view = searchParams.get(queryKeys.exception) ? 'exception'
    : !scoped && renderTopics && requestedView === 'topics' ? 'topics' : 'main'
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
  const handlingOpen = detailOpen && Boolean(current.handling) && searchParams.get(queryKeys.roleHandling) === '1'
  React.useEffect(() => {
    if (view !== 'main' || exceptionDirectoryOpen || !pendingDetailScroll.current) return
    if (pendingDetailScroll.current === 'overview') {
      pendingDetailScroll.current = null
      overviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (!detailOpen || pendingDetailScroll.current !== current.stage) return
    pendingDetailScroll.current = null
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [scoped, view, current.stage, detailOpen, handlingOpen, exceptionDirectoryOpen])
  // 异常视图会卸载环节详情，返回内容挂载后再恢复同一个入口。
  React.useLayoutEffect(() => {
    const request = pendingExceptionFocusRef.current
    if (view === 'exception' || !request) return
    pendingExceptionFocusRef.current = null
    const opener = exceptionOpenerRef.current
    const root = overviewRef.current?.closest('.erp-dev-fulfillment-guide') || document.getElementById('task-fulfillment-guide')
    const fromDirectory = Boolean(opener?.closest('.erp-dev-exception-directory'))
    const label = opener?.getAttribute('aria-label')
    const restoredOpener = label ? [...(root?.querySelectorAll('button[aria-label]') || [])].find((button) => button.getAttribute('aria-label') === label) : null
    const target = fromDirectory ? root?.querySelector('button[aria-label="异常目录"]')
      : opener?.isConnected && opener.getClientRects().length ? opener : restoredOpener || overviewRef.current?.querySelector(`[data-fulfillment-stage="${request.stage}"] button`)
    const focusTarget = target || root?.querySelector('button[aria-label="按业务查阅"]')
    focusTarget?.focus({ preventScroll: true })
  }, [view, current.stage, detailOpen, handlingOpen])
  const context = scoped ? null : getFulfillmentStageContext(steps, current.stage)
  const currentRoleLabel = fulfillmentRoleOptions.find((option) => option.value === role).label
  const currentExceptions = catalog.exception_guides.filter((guide) => guide.entry_stages.includes(current.stage))
  const supplement = getFulfillmentSupplement(current)
  const hasSupplement = Boolean(supplement.handoffs.length || supplement.approvals.length || supplement.exception)
  const returnLabel = !scoped && requestedView === 'topics' ? '业务目录' : detailOpen ? current.label : '订单全流程'
  const openException = (guide, substep, origin) => {
    exceptionOpenerRef.current = document.activeElement?.closest('button, [role="button"]')
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
    const focusStage = detailOpen ? current.stage : typeof origin === 'string' ? origin : null
    pendingExceptionFocusRef.current = { stage: focusStage }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(queryKeys.exception)
      next.delete(queryKeys.exceptionDecision)
      next.delete(queryKeys.exceptionStep)
      next.delete(queryKeys.exceptionOrigin)
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
  const selectStage = (stage, handling = false) => {
    setExceptionDirectoryOpen(false)
    if (handling || scoped && view === 'main' && window.matchMedia('(max-width: 800px)').matches) pendingDetailScroll.current = stage
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (scoped && view === 'exception') {
        next.set(queryKeys.chain, 'all')
        next.delete(queryKeys.node)
      }
      next.delete(queryKeys.roleTab)
      next.set(queryKeys.roleStage, stage)
      if (handling) next.set(queryKeys.roleHandling, '1')
      else next.delete(queryKeys.roleHandling)
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
      next.delete(queryKeys.roleHandling)
      return next
    })
    requestAnimationFrame(() => {
      overviewRef.current?.querySelector(`[data-fulfillment-stage="${current.stage}"] button`)?.focus({ preventScroll: true })
      overviewRef.current?.querySelector(`[data-fulfillment-stage="${current.stage}"] button`)?.scrollIntoView({ block: 'nearest' })
    })
  }
  const handling = current.handling ? fulfillmentHandling(current) : null
  const links = handling && handlingOpen ? handling.taskLinks : fulfillmentTaskLinks(current)
  const changeHandling = (value) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set(queryKeys.roleStage, current.stage)
    if (value === 'handling') next.set(queryKeys.roleHandling, '1')
    else next.delete(queryKeys.roleHandling)
    return next
  })
  const canvasVisible = view === 'exception' || (!scoped && view === 'main')
  const displaySteps = canvasVisible ? catalog.fulfillment_flow : steps
  const visibleMatches = displaySteps.filter((step) => fulfillmentStepMatchesRole(step, role))
  const stageRoleText = role === 'all' ? current.role : fulfillmentStepMatchesRole(current, role) ? `${currentRoleLabel}参与` : `本环节未登记${currentRoleLabel}职责`
  const showStageRole = !current.subflow || handlingOpen || role !== 'all' && !fulfillmentStepMatchesRole(current, role)
  const stageDetail = detailOpen ? (
    <div className="erp-dev-fulfillment-guide__result" id={detailID} ref={detailRef} aria-live="polite" data-stage-mode={handlingOpen ? 'handling' : 'normal'}>
      <div className="erp-dev-fulfillment-guide__detail-heading">
        <div className="erp-dev-fulfillment-guide__detail-title"><span aria-label={`${scoped ? '当前业务' : '总链位置'} · 第 ${steps.indexOf(current) + 1} / ${steps.length} 环节`}>{steps.indexOf(current) + 1} / {steps.length}</span><h3>{current.label}</h3>{showStageRole ? <span className="erp-dev-fulfillment-guide__owner">{stageRoleText}</span> : null}</div>
        <div className="erp-dev-fulfillment-guide__navigation">
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
      {handling ? <SlidingSegmented className="erp-dev-fulfillment-guide__mode" aria-label="环节办理方式" hierarchy="secondary" value={handlingOpen ? 'handling' : 'normal'} options={[{ value: 'normal', label: '正常办理' }, { value: 'handling', label: '异常处理' }]} onChange={changeHandling} /> : null}
      {handling && handlingOpen ? (
        <section className="erp-dev-fulfillment-guide__handling" data-stage-handling={current.stage}>
          <p>{handling.issues}</p>
          <dl className="erp-dev-fulfillment-guide__node-facts">
            <dt>处理</dt><dd>{handling.action}</dd>
            <dt>继续条件</dt><dd>{handling.resume}</dd>
          </dl>
          <ExceptionGuideEntry guides={handling.guides} stage={current.stage} onOpen={openException} />
        </section>
      ) : null}
      {!handlingOpen && context?.related.length ? (
        <div className="erp-dev-fulfillment-guide__stage-context">
          <span className="erp-dev-fulfillment-guide__related">按约定关联 {context.related.map(({ step, label }) => <Button size="small" key={step.stage} title={step.label} onClick={() => selectStage(step.stage)}>{steps.indexOf(step) + 1} {label}</Button>)}</span>
        </div>
    ) : null}
      {!handlingOpen && current.subflow ? <FulfillmentSubflow step={current} role={role} searchParams={searchParams} setSearchParams={setSearchParams} onOpenException={(substep, guideKey) => { const related = currentExceptions.find((item) => item.key === guideKey); if (related) openException(related, substep) }} /> : null}
      {!handlingOpen ? (
        <div className="erp-dev-fulfillment-guide__detail-content" data-stage-normal={current.stage}>
          {!current.subflow ? <section><h4>完成条件与结果</h4><p>{current.result}</p></section> : null}
          {current.subflow || hasSupplement ? (
            <details className="erp-dev-fulfillment-guide__instructions" key={current.stage}>
              <summary>环节说明</summary>
              {current.subflow ? <><p>{current.subflow.summary}</p><p>{current.result}</p></> : null}
              {supplement.handoffs.length ? <ol>{supplement.handoffs.map((text) => <li key={text}>{text}</li>)}</ol> : null}
              {supplement.approvals.map((approval) => <ApprovalDetails key={approval.label} approval={approval} />)}
              {supplement.exception ? <p>{supplement.exception}</p> : null}
            </details>
      ) : null}
        </div>
    ) : null}
      <div className="erp-dev-fulfillment-guide__detail-actions">
        {links.length ? <div className="erp-dev-fulfillment-guide__links" aria-label="相关任务"><span>任务</span>{links.map((link) => <a key={link.key} href={link.href}>{link.label}</a>)}</div> : null}
        {onExploreStage ? <Button type="link" onClick={() => onExploreStage(current.business_chain)}>单据与规则</Button> : null}
        {onExploreNode && current.nodeKey ? <Button type="link" onClick={() => onExploreNode(current.nodeKey)}>单据与规则</Button> : null}
      </div>
    </div>
  ) : null
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide" aria-label="岗位履约流程" data-scoped-guide={scoped || undefined}>
      <div className="erp-dev-fulfillment-guide__heading">
        <h2>{canvasVisible ? '订单全流程' : scoped ? '岗位分工与交接' : '按业务查阅'}</h2>
        <div className="erp-dev-fulfillment-guide__navigation">
          <div className="erp-dev-fulfillment-guide__role"><label htmlFor={roleSelectID}>关注岗位</label><Select id={roleSelectID} aria-label="关注岗位" value={role} options={fulfillmentRoleOptions} onChange={changeRole} virtual={false} /></div>
          {view === 'exception' && (scoped || requestedView === 'topics') ? <Button aria-label={`返回${returnLabel}`} icon={<LeftOutlined />} onClick={() => closeException()}>返回{returnLabel}</Button>
            : !scoped && renderTopics ? <Button aria-label={view === 'topics' ? '返回完整流程' : '按业务查阅'} onClick={() => setView(view === 'topics' ? 'main' : 'topics')}>{view === 'topics' ? '返回完整流程' : '按业务查阅'}</Button> : null}
        </div>
      </div>
      {canvasVisible || view === 'main' ? <div className="erp-dev-fulfillment-guide__scope-bar"><span role="status">{role === 'all' ? `全部 ${displaySteps.length} 个环节` : visibleMatches.length ? `${currentRoleLabel}参与 ${visibleMatches.length} / ${displaySteps.length} 个环节` : '该流程没有登记该岗位的办理环节，以下保留完整交接供参考。'}</span>{role !== 'all' ? <span className="erp-dev-fulfillment-guide__legend"><span><i aria-hidden="true" />岗位职责</span></span> : null}</div> : null}
      {canvasVisible ? (
        <FulfillmentChainCanvas role={role} searchParams={searchParams} setSearchParams={setSearchParams} selectedStage={detailOpen ? current.stage : null} stageDetail={view === 'main' ? stageDetail : null} overviewRef={overviewRef} onSelectStage={selectStage} onOpenException={openException} onCloseException={closeException} onExploreStage={onExploreStage} />
      ) : view === 'topics' ? renderTopics(() => { setExceptionDirectoryAll(true); setExceptionDirectoryOpen(true) }) : (
        <div className="erp-dev-fulfillment-guide__body"><ScopedStageOverview steps={steps} role={role} selectedStage={current.stage} detailID={detailID} overviewRef={overviewRef} onSelect={selectStage} />{stageDetail}</div>
      )}
      <p className="erp-dev-fulfillment-guide__boundary">岗位职责示意，非实际办理进度；岗位筛选不改变权限，任务完成不代替正式业务结果。</p>
      <ExceptionFlowDirectory open={exceptionDirectoryOpen} onClose={() => setExceptionDirectoryOpen(false)} onSelect={openException} onSelectHandling={(stage) => selectStage(stage, true)} steps={steps} role={role} stage={detailOpen ? current.stage : undefined} roleLabel={currentRoleLabel} showAll={exceptionDirectoryAll} onChangeScope={setExceptionDirectoryAll} />
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
