import React from 'react'
import { Button } from 'antd'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import {
  buildFulfillmentChain,
  buildFulfillmentPhaseGraph,
} from '../../config/devFulfillmentChain.mjs'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import './fulfillmentChain.css'

const model = buildFulfillmentChain()

export default function FulfillmentChainCanvas({
  role,
  matchingStages,
  selectedStage,
  selectedGuide,
  detailID,
  overviewRef,
  onSelectStage,
  onOpenException,
}) {
  return (
    <div className="erp-dev-chain" data-fulfillment-chain ref={overviewRef}>
      <div className="erp-dev-chain__map">
        {model.phases.map((phase) => (
          <section
            className="erp-dev-chain__phase"
            key={phase.key}
            aria-label={phase.label}
            data-chain-phase={phase.key}
          >
            <div className="erp-dev-chain__phase-heading">
              <h3>
                {phase.label}
                <small>
                  {phase.entries[0].number}—{phase.entries.at(-1).number}
                </small>
              </h3>
            </div>
            <BusinessFlowDiagram
              flow={buildFulfillmentPhaseGraph(phase, model, {
                selectedStage,
                detailID,
              })}
              label={`${phase.label}环节图`}
              selectedKey={selectedStage}
              onSelect={onSelectStage}
              role={role}
              matchingKeys={matchingStages}
              legend="实线为阅读顺序 · 虚线为约定分支；不表示实际执行依赖或完成状态。"
            />
            <div
              className="erp-dev-chain__branches"
              aria-label={`${phase.label}专项分支`}
            >
              {phase.entries
                .filter(({ step }) => step.handling?.guides.length)
                .map(({ step, number }) => (
                  <div
                    className="erp-dev-chain__stage-branches"
                    key={step.stage}
                  >
                    <span>
                      {number} · {step.label}
                    </span>
                    {step.handling.guides.map((key) => {
                      const guide = catalog.exception_guides.find(
                        (item) => item.key === key
                      )
                      return (
                        <button
                          className="erp-dev-chain__exception-trigger"
                          key={key}
                          data-stage-exception={step.stage}
                          data-stage-guide={key}
                          type="button"
                          aria-label={`${number} · ${guide.diagram.branch_label}`}
                          aria-pressed={
                            selectedStage === step.stage &&
                            selectedGuide === key
                          }
                          onClick={() => onOpenException(guide, step.stage)}
                        >
                          {guide.diagram.branch_label}
                        </button>
                      )
                    })}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="erp-dev-chain__independent">
        <span>独立业务</span>
        {model.independent.map((guide) => (
          <Button
            type="link"
            size="small"
            key={guide.key}
            onClick={() => onOpenException(guide)}
          >
            {guide.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
