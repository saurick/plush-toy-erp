import React from 'react'
import { flushSync } from 'react-dom'
import { Button } from 'antd'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentStepMatchesRole } from '../../../erp/utils/workflowFulfillment.mjs'
import { buildFulfillmentChain, buildFulfillmentChainWires, fulfillmentChainColumns } from '../../config/devFulfillmentChain.mjs'
import './fulfillmentChain.css'

const model = buildFulfillmentChain()
const relativeRect = (node, base) => {
  const box = node.getBoundingClientRect()
  return { x: box.left - base.left, y: box.top - base.top, width: box.width, height: box.height }
}

export default function FulfillmentChainCanvas({ role, matchingStages, selectedStage, selectedGuide, detailID, overviewRef, onSelectStage, onOpenException }) {
  const mapRef = React.useRef(null)
  const [geometry, setGeometry] = React.useState({ width: 0, height: 0, stages: {} })
  const columns = fulfillmentChainColumns(geometry.width || 900)
  const markerID = React.useId().replaceAll(':', '')
  const wires = React.useMemo(() => buildFulfillmentChainWires(model, geometry), [geometry])
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
      const next = {
        width: map.clientWidth,
        height: map.clientHeight,
        stages: Object.fromEntries([...map.querySelectorAll('[data-chain-stage]')].map((node) => [node.dataset.chainStage, relativeRect(node.querySelector('[data-stage-card]'), base)])),
      }
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    // Printing changes layout without waiting for a ResizeObserver animation frame.
    const preparePrint = () => flushSync(measure)
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(map)
    window.addEventListener('beforeprint', preparePrint)
    window.addEventListener('afterprint', schedule)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('beforeprint', preparePrint)
      window.removeEventListener('afterprint', schedule)
    }
  }, [columns])
  return (
    <div className="erp-dev-chain" data-fulfillment-chain>
      <div className="erp-dev-chain__map" ref={bindMap}>
        <svg className="erp-dev-chain__wires" width={geometry.width || '100%'} height={geometry.height || '100%'} role="img" aria-label={`${catalog.fulfillment_flow.length}环节总链与约定分支`}>
          <defs><marker id={`${markerID}-main`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path className="erp-dev-chain__arrow--main" d="M 0 0 L 8 4 L 0 8 Z" /></marker></defs>
          {wires.paths.map((wire) => <path key={wire.key} className="erp-dev-chain__wire--main" d={wire.d} markerEnd={`url(#${markerID}-main)`} data-chain-wire={wire.key} data-wire-from={wire.from} data-wire-to={wire.to} data-conditional-wire={wire.conditional || undefined} />)}
        </svg>
        {model.phases.map((phase) => (
          <section className="erp-dev-chain__phase" key={phase.key} aria-label={phase.label} data-chain-phase={phase.key}>
            <div className="erp-dev-chain__phase-heading"><h3>{phase.label}<small>{phase.entries[0].number}—{phase.entries.at(-1).number}</small></h3></div>
            <div className="erp-dev-chain__grid" style={{ '--chain-columns': columns }}>
              {phase.entries.map(({ step, number, label }) => (
                <div className="erp-dev-chain__stage" key={step.stage} data-chain-stage={step.stage} data-fulfillment-stage={step.stage} data-role-match={matchingStages ? matchingStages.has(step.stage) : role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)} data-conditional={step.branch || undefined} data-related={selectedGuide && step.handling?.guides.includes(selectedGuide) || undefined}>
                  <button className="erp-dev-chain__stage-card erp-dev-chain__stage-main" data-stage-card data-selected={selectedStage === step.stage || undefined} type="button" title={step.label} aria-label={`${number} ${step.label}`} aria-expanded={selectedStage === step.stage} aria-controls={selectedStage === step.stage ? detailID : undefined} onClick={() => onSelectStage(step.stage)}>
                    <span>{number}</span><strong>{label}</strong>{step.branch ? <small>按约定</small> : null}
                  </button>
                  {step.handling?.guides.map((key) => {
                    const guide = catalog.exception_guides.find((item) => item.key === key)
                    return <div className="erp-dev-chain__stage-branch" key={key}><button className="erp-dev-chain__exception-trigger" data-stage-exception={step.stage} data-stage-guide={key} type="button" aria-label={`${number} · ${guide.diagram.branch_label}`} aria-pressed={selectedStage === step.stage && selectedGuide === key} onClick={() => onOpenException(guide, step.stage)}>{guide.diagram.branch_label}</button></div>
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="erp-dev-chain__legend">实线为阅读顺序 · 虚线为约定分支</p>
      <div className="erp-dev-chain__independent"><span>独立业务</span>{model.independent.map((guide) => <Button type="link" size="small" key={guide.key} onClick={() => onOpenException(guide)}>{guide.label}</Button>)}</div>
    </div>
  )
}
