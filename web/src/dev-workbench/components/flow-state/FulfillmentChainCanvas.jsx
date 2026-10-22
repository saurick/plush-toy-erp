import React from 'react'
import { Button, Select } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentHandling, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks } from '../../../erp/utils/workflowFulfillment.mjs'
import { buildFulfillmentChain, buildFulfillmentChainWires, fulfillmentChainColumns, fulfillmentChainInsertion } from '../../config/devFulfillmentChain.mjs'
import { getFulfillmentStageCopy } from '../../config/devFulfillmentPresentation.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from '../../pages/devFlowStateQuery.mjs'
import './fulfillmentChain.css'

const flow = catalog.fulfillment_flow
const roleNames = new Map(fulfillmentRoleOptions.map((option) => [option.value, option.label]))
const shortRole = (step) => step.key === 'approval' || step.role?.startsWith('有效') ? '按有效配置' : step.role_keys.map((key) => roleNames.get(key)).join(' / ')
const relativeRect = (node, base) => {
  const box = node.getBoundingClientRect()
  return { x: Math.round((box.left - base.left) * 10) / 10, y: Math.round((box.top - base.top) * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 }
}

function ExceptionSteps({ graph, role, selected, onSelect, onCollapse, onExploreStage }) {
  const links = fulfillmentTaskLinks(graph.guide)
  return (
    <section className="erp-dev-chain__details" aria-label="异常步骤与岗位" data-exception-handling>
      <div className="erp-dev-chain__detail-heading"><h4>{graph.plan.label} · {graph.steps.length} 步</h4><Button size="small" onClick={onCollapse}>收起步骤</Button></div>
      <ol className="erp-dev-chain__handling-steps">
        {graph.steps.map((step, index) => (
          <React.Fragment key={step.key}>
            {graph.plan.continuation.reentry?.before_step === step.key ? <li className="erp-dev-chain__reentry-note">↪ 总链 {flow.indexOf(graph.reentryStage) + 1} · {getFulfillmentStageCopy(graph.reentryStage).label}{graph.plan.continuation.original_terminal ? ' · 新批' : ''}</li> : null}
            <li data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)}>
              <button type="button" aria-pressed={selected.key === step.key} onClick={() => onSelect(step.key)}><span>{index + 1}</span><strong>{step.label}</strong><small>{shortRole(step)}</small></button>
            </li>
          </React.Fragment>
        ))}
      </ol>
      <div className="erp-dev-chain__selection" aria-live="polite" data-selected-exception-node={selected.key}><p>{selected.result || selected.condition}</p></div>
      <details className="erp-dev-fulfillment-guide__instructions">
        <summary>条件与交接</summary>
        <section><h4>来源条件</h4><p>{graph.guide.source}</p></section>
        <section><h4>结束条件</h4><p>{graph.plan.closure}</p></section>
        <section><h4>撤销或再次失败</h4><p>{graph.plan.recovery}</p></section>
        {graph.guide.approval ? <section><h4>审批未通过 / 取消</h4><p>{graph.guide.approval.rejected}</p><p>{graph.guide.approval.withdrawal}</p></section> : null}
        <div className="erp-dev-fulfillment-guide__links">{links.map((link) => <a key={link.key} href={link.href}>{link.pathLabel}</a>)}</div>
        {onExploreStage ? <Button size="small" onClick={() => onExploreStage(graph.guide.business_chain)}>查看相关单据与规则</Button> : null}
      </details>
    </section>
  )
}

export default function FulfillmentChainCanvas({ role, searchParams, setSearchParams, selectedStage, stageDetail, overviewRef, onSelectStage, onOpenException, onCloseException, onExploreStage }) {
  const exceptionKey = searchParams.get(keys.exception)
  const planKey = searchParams.get(keys.exceptionDecision)
  const originStage = searchParams.get(keys.exceptionOrigin)
  const previousStage = searchParams.get(keys.roleStage)
  const selectedKey = searchParams.get(keys.exceptionStep)
  const model = React.useMemo(() => buildFulfillmentChain({ exceptionKey, planKey, originStage, previousStage }), [exceptionKey, planKey, originStage, previousStage])
  const graph = model.exception && !model.exception.invalid ? model.exception : null
  const selected = graph ? graph.steps.find((step) => step.key === selectedKey) || graph.steps.find((step) => fulfillmentStepMatchesRole(step, role)) || graph.steps[0] : null
  const handlingOpen = Boolean(graph && selectedKey)
  const mapRef = React.useRef(null)
  const [geometry, setGeometry] = React.useState({ width: 0, height: 0, stages: {} })
  const columns = fulfillmentChainColumns(geometry.width || 900)
  const markerID = React.useId().replaceAll(':', '')
  const detailID = React.useId()
  const activeStage = graph?.origin?.stage || (!exceptionKey ? selectedStage : null)
  const wires = React.useMemo(() => buildFulfillmentChainWires(model, geometry), [model, geometry])
  const bindMap = React.useCallback((node) => {
    mapRef.current = node
    if (overviewRef) overviewRef.current = node
  }, [overviewRef])

  React.useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    let frame
    const measure = () => {
      const base = map.getBoundingClientRect()
      const lane = map.querySelector('[data-branch-lane]')
      const next = {
        width: map.clientWidth,
        height: map.clientHeight,
        stages: Object.fromEntries([...map.querySelectorAll('[data-chain-stage]')].map((node) => [node.dataset.chainStage, relativeRect(node.querySelector('[data-stage-card]'), base)])),
        exceptionEntries: Object.fromEntries([...map.querySelectorAll('[data-stage-exception]')].map((node) => [node.dataset.stageException, relativeRect(node, base)])),
        lane: lane ? relativeRect(lane, base) : null,
        workHeight: lane?.querySelector('[data-chain-work]')?.getBoundingClientRect().height || 74,
        terminalHeight: lane?.querySelector('[data-chain-terminal]')?.getBoundingClientRect().height || 40,
      }
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(map)
    for (const node of map.querySelectorAll('[data-chain-work], [data-chain-terminal]')) observer.observe(node)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [columns, model, selectedStage, selectedKey, role])

  const update = (values) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  })
  const selectPlan = (value) => {
    const next = buildFulfillmentChain({ exceptionKey, planKey: value, originStage, previousStage }).exception
    const nextSelected = next.steps.find((step) => step.key === selected.key && step.label === selected.label) || next.steps.find((step) => fulfillmentStepMatchesRole(step, role)) || next.steps[0]
    update({ [keys.exceptionDecision]: value, [keys.exceptionStep]: handlingOpen ? nextSelected.key : null })
  }
  const details = graph && handlingOpen ? <ExceptionSteps graph={graph} role={role} selected={selected} onSelect={(value) => update({ [keys.exceptionStep]: value })} onCollapse={() => update({ [keys.exceptionStep]: null })} onExploreStage={onExploreStage} /> : null
  const work = graph ? (
    <div className="erp-dev-chain__branch-lane" style={{ height: Math.ceil(Math.max(180, 80 + (geometry.workHeight || 74) + 44, 97 + (geometry.terminalHeight || 40) + 14)) }} data-branch-lane data-exception-guide={graph.guide.key} data-exception-outcome={graph.plan.continuation.kind}>
      <button
        className="erp-dev-chain__work"
        type="button"
        data-chain-work
        data-role-match={role === 'all' ? undefined : graph.branchSteps.some((step) => fulfillmentStepMatchesRole(step, role))}
        style={wires.placement ? { left: wires.placement.left, width: wires.placement.width } : undefined}
        aria-label={`展开${graph.plan.label}处理步骤`}
        aria-expanded={handlingOpen}
        aria-controls={detailID}
        onClick={() => update({ [keys.exceptionStep]: handlingOpen ? null : selected.key })}
      >
        <strong>{graph.plan.continuation.original_terminal ? '原批处理与重做需求' : graph.plan.continuation.reentry ? `安排${graph.plan.label}` : graph.plan.label}</strong>
        <small>{role === 'all' ? `${graph.branchSteps.length} 个办理步骤` : `${roleNames.get(role)}参与 ${graph.branchSteps.filter((step) => fulfillmentStepMatchesRole(step, role)).length} 步`} · {handlingOpen ? '收起' : '点开'}</small>
      </button>
      {graph.terminal ? <div className="erp-dev-chain__terminal" data-chain-terminal style={wires.placement ? { width: wires.placement.terminalWidth } : undefined}>{graph.plan.continuation.original_terminal ? '原批终止' : graph.terminal.label}</div> : null}
    </div>
  ) : null
  const renderStage = ({ step, number, label }) => {
    const guides = step.handling ? fulfillmentHandling(step).guides : []
    const guide = guides.find((item) => item.key === exceptionKey) || guides[0]
    const origin = graph?.origin?.stage === step.stage
    const returned = graph?.returnStage?.stage === step.stage
    const reentry = graph?.reentryStage?.stage === step.stage
    return (
      <div className="erp-dev-chain__stage" key={step.stage} data-chain-stage={step.stage} data-fulfillment-stage={step.stage} data-role-match={role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)} data-conditional={step.branch || undefined} data-origin={origin || undefined} data-return={returned || undefined} data-reentry={reentry || undefined} data-repeat={graph?.repeat.includes(step.stage) || undefined}>
        <button className="erp-dev-chain__stage-card erp-dev-chain__stage-main" data-stage-card data-selected={!exceptionKey && selectedStage === step.stage || undefined} type="button" title={step.label} aria-label={`${number} ${step.label}`} aria-expanded={!exceptionKey && selectedStage === step.stage} aria-controls={!exceptionKey && selectedStage === step.stage ? detailID : undefined} onClick={() => onSelectStage(step.stage)}>
          <span>{number}</span><strong>{label}</strong>
          {step.branch ? <small>按约定</small> : null}
          {reentry ? <small>{graph.plan.continuation.original_terminal ? '新批重开' : '重新进入'}</small> : null}
        </button>
        {guide ? <div className="erp-dev-chain__stage-branch"><button className="erp-dev-chain__exception-trigger" data-stage-exception={step.stage} type="button" title={`${guides.length} 类已登记异常处理，并非异常发生次数`} aria-label={`查看第${number}环节异常分支`} aria-expanded={Boolean(graph?.guide.key === guide.key && (origin || !graph.origin))} onClick={() => onOpenException(guide, null, guide.entry_stages.includes(step.stage) ? step.stage : null)}>↳ 查看异常{guides.length > 1 ? ` · ${guides.length} 类` : ''}</button></div> : null}
      </div>
    )
  }
  return (
    <div className="erp-dev-chain" data-fulfillment-chain>
      <div className="erp-dev-chain__legend"><span>实线为总链定位 · 虚线为约定分支</span><span><i className="erp-dev-chain__branch-key" />异常处理往返{graph?.repeat.length ? <><i className="erp-dev-chain__repeat-key" />{graph.plan.continuation.original_terminal ? '新批路径' : '重新进入主链'}</> : null}</span></div>
      <div className="erp-dev-chain__map" ref={bindMap}>
        <svg className="erp-dev-chain__wires" width={geometry.width || '100%'} height={geometry.height || '100%'} role="img" aria-label={graph?.origin ? `17环节总链；从第${flow.indexOf(graph.origin) + 1}环节分出，${graph.plan.label}；${graph.resume ? `${graph.reentryStage ? '重新进入' : '满足条件后接回'}第${flow.indexOf(graph.resume) + 1}环节` : '该分支终止，不连接后续环节'}` : '17环节总链与约定分支'}>
          <defs>{['main', 'branch', 'repeat'].map((kind) => <marker key={kind} id={`${markerID}-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path className={`erp-dev-chain__arrow--${kind}`} d="M 0 0 L 8 4 L 0 8 Z" /></marker>)}</defs>
          {wires.paths.map((wire) => <path key={wire.key} className={`erp-dev-chain__wire--${wire.kind}`} d={wire.d} markerEnd={`url(#${markerID}-${wire.kind})`} data-chain-wire={wire.key} data-return-stage={wire.to} data-reentry-wire={wire.reentry || undefined} data-conditional-wire={wire.conditional || undefined} />)}
          {wires.labels.map((item) => <foreignObject key={item.key} x={item.x} y={item.y} width={item.width} height="38"><div className="erp-dev-chain__wire-label" data-cable-label>{item.text}</div></foreignObject>)}
        </svg>
        {model.phases.map((phase) => {
          const insertion = fulfillmentChainInsertion(phase.entries, activeStage, columns)
          const applicable = graph?.origin ? catalog.exception_guides.filter((guide) => guide.entry_stages.includes(graph.origin.stage)) : []
          return (
            <section className="erp-dev-chain__phase" key={phase.key} aria-label={phase.label} data-chain-phase={phase.key}>
              <div className="erp-dev-chain__phase-heading">
                <h3>{phase.label}<small>{phase.entries[0].number}—{phase.entries.at(-1).number}</small></h3>
                {insertion >= 0 && graph?.origin ? <div className="erp-dev-chain__controls"><span>{flow.indexOf(graph.origin) + 1} · {getFulfillmentStageCopy(graph.origin).label}</span>{applicable.length > 1 ? <Select aria-label="异常来源" value={graph.guide.key} options={applicable.map((guide) => ({ value: guide.key, label: guide.label }))} virtual={false} onChange={(value) => update({ [keys.exception]: value, [keys.exceptionDecision]: null, [keys.exceptionStep]: null })} /> : null}<Select aria-label="异常处理方案" value={graph.plan.key} options={graph.guide.plans.map((plan) => ({ value: plan.key, label: plan.label }))} virtual={false} onChange={selectPlan} /><Button type="text" size="small" aria-label="收起异常分支" icon={<CloseOutlined />} onClick={() => onCloseException(graph.origin.stage)} /></div> : null}
              </div>
              <div className="erp-dev-chain__grid" style={{ '--chain-columns': columns }}>
                {phase.entries.map((entry, index) => <React.Fragment key={entry.step.stage}>{renderStage(entry)}{index === insertion ? graph?.origin ? <>{work}{details ? <div className="erp-dev-chain__inline" id={detailID}>{details}</div> : null}</> : stageDetail ? <div className="erp-dev-chain__inline" id={detailID}>{stageDetail}</div> : null : null}</React.Fragment>)}
              </div>
            </section>
          )
        })}
      </div>
      {model.exception?.invalid ? <p role="alert">{model.exception.reason || '这个分出环节不适用于当前异常。'}<Button size="small" onClick={() => onCloseException()}>清除异常选择</Button></p> : null}
      <div className="erp-dev-chain__independent">
        <div className="erp-dev-chain__independent-heading"><span>独立业务</span>{model.independent.map((guide) => <Button size="small" key={guide.key} aria-expanded={graph?.guide.key === guide.key} onClick={() => onOpenException(guide)}>↳ {guide.label}</Button>)}</div>
        {graph && !graph.origin ? <><div className="erp-dev-chain__independent-path" data-exception-guide={graph.guide.key}><span>{graph.guide.diagram.external_entry.label}</span><span aria-hidden="true">→</span><Button onClick={() => update({ [keys.exceptionStep]: handlingOpen ? null : selected.key })} aria-expanded={handlingOpen}>点开{graph.plan.label} · {graph.steps.length} 步</Button><span aria-hidden="true">→</span><span>{graph.plan.continuation.label}</span><Button type="text" size="small" aria-label="收起异常分支" onClick={() => onCloseException()}>收起</Button></div>{details}</> : null}
      </div>
    </div>
  )
}
