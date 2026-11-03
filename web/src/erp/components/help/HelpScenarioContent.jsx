import React, { useId, useMemo, useRef, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Grid } from 'antd'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import {
  getHelpScenarioPresentation,
  buildHelpScenarioGraph,
} from '../../config/helpScenarioPresentation.mjs'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildBusinessFlowMermaid } from '@/common/components/markdown/mermaidGraph.mjs'
import HelpScenarioIllustration from './HelpScenarioIllustration'

const viewOptions = [
  { label: '怎么做', value: 'guide' },
  { label: '完成后', value: 'result' },
  { label: '遇到异常', value: 'exception' },
]
const kindLabels = { chain: '业务交接', steps: '操作步骤', path: '查询路径' }

function HelpOverview({
  model,
  scenario,
  selected,
  roleKey,
  onSelect,
  detailId,
  overviewRef,
}) {
  const screens = Grid.useBreakpoint()
  const narrow = screens.md === false
  const graph = useMemo(
    () =>
      model.kind === 'chain'
        ? buildBusinessFlowMermaid(
            {
              ...buildHelpScenarioGraph(model, scenario),
              direction: narrow ? 'TB' : 'LR',
            },
            { role: roleKey }
          )
        : null,
    [model, scenario, roleKey, narrow]
  )
  return (
    <section
      className={`erp-help-flow erp-help-flow--${model.kind}`}
      ref={overviewRef}
      aria-label="办理概览"
      data-overview-kind={model.kind}
    >
      <div className="erp-help-flow__heading">
        <h3>办理概览</h3>
        <span>{kindLabels[model.kind]} · 点击步骤看说明 · 非实际进度</span>
      </div>
      {graph ? (
        <MermaidDiagram
          chart={graph.chart}
          label="业务交接与异常恢复图"
          initialZoom={narrow ? 'fit-width' : 'fit'}
          showSourceOnError={false}
          interactiveNodes={graph.nodes}
          interactiveEdges={graph.edges}
          selectedNodeId={graph.ids.get(selected.id)}
          onNodeSelect={(id) => {
            const key = graph.nodes.find((node) => node.id === id)?.key
            const step =
              model.steps.find((item) => item.id === key) ||
              (key === model.exception.id ? model.exception : null)
            if (step) onSelect(step)
          }}
        />
      ) : (
        <div className="erp-help-flow__scroll">
          <div
            className="erp-help-flow__canvas"
            style={{
              '--help-step-count': model.steps.length,
              '--help-flow-min-width': `${model.steps.length * 140 + (model.steps.length - 1) * 24}px`,
            }}
          >
            <ol className="erp-help-flow__steps">
              {model.steps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className="erp-help-flow__step"
                    data-help-step={step.id}
                    aria-pressed={selected.id === step.id}
                    aria-controls={detailId}
                    aria-label={`查看步骤 ${step.number}：${step.title}`}
                    onClick={() => onSelect(step)}
                  >
                    <span className="erp-help-flow__number" aria-hidden="true">
                      {step.number}
                    </span>
                    <span className="erp-help-flow__step-copy">
                      <strong>{step.title}</strong>
                      <span>{step.owner}</span>
                      {step.roles.includes(roleKey) ? (
                        <em>本岗位参与</em>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}

function Outcomes({ scenario, visual }) {
  return (
    <div className={visual ? 'erp-help-content-grid' : 'erp-help-outcomes'}>
      {visual ? (
        <div className="erp-help-result">
          <h3>{visual.resultTitle}</h3>
          <div className="erp-help-result__change">
            <span>
              <strong>{visual.before}</strong>
              <small>
                {scenario.key === 'inventory-query' ? '库存余额' : '办理前'}
                {visual.unit ? ` / ${visual.unit}` : ''}
              </small>
            </span>
            <span className="erp-help-result__delta">
              <ArrowRightOutlined aria-hidden="true" />
              {visual.delta}
            </span>
            <span>
              <strong>{visual.after}</strong>
              <small>
                {scenario.key === 'inventory-query' ? '可用量' : '办理后'}
                {visual.unit ? ` / ${visual.unit}` : ''}
              </small>
            </span>
          </div>
          <dl>
            {visual.resultRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className="erp-help-outcome-copy">
        <h3>完成后应看到</h3>
        <p>{scenario.completion}</p>
        <h3>完成后交给谁</h3>
        <p>{scenario.handoff}</p>
        {visual ? <p className="erp-help-boundary">{visual.boundary}</p> : null}
      </div>
    </div>
  )
}

function Exception({ scenario, model, onResume }) {
  const { visual, exception } = model
  return (
    <>
      <ol className="erp-help-exception-path" aria-label="异常处理顺序">
        <li>
          <strong>先核对条件</strong>
          <span>保留来源与提示</span>
        </li>
        <li>
          <strong>{visual?.exceptionTo || exception.owner}</strong>
          <span>说明差异与原因</span>
        </li>
        <li>
          <strong>回到第 {exception.backNumber} 步</strong>
          <span>重新确认处理条件</span>
        </li>
      </ol>
      <div className="erp-help-content-grid">
        <div className="erp-help-exception-copy">
          <h3>什么时候停下来</h3>
          <p>{scenario.exception.trigger}</p>
          {visual ? (
            <div className="erp-help-exception-example">
              <h4>{visual.exceptionTitle} · 示例</h4>
              <dl>
                {visual.exceptionRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>{visual.exceptionNote}</p>
            </div>
          ) : null}
        </div>
        <div className="erp-help-outcome-copy">
          <h3>处理后怎样继续</h3>
          <p>{scenario.exception.action}</p>
          {visual ? <p>{visual.exceptionResume}</p> : null}
          <Button onClick={onResume}>
            返回第 {exception.backNumber} 步核对
          </Button>
        </div>
      </div>
    </>
  )
}

export default function HelpScenarioContent({
  scenario,
  roleKey,
  compact = false,
}) {
  const model = useMemo(
    () => getHelpScenarioPresentation(scenario, roleKey),
    [scenario, roleKey]
  )
  const [selected, setSelected] = useState(model.defaultStep)
  const overviewRef = useRef(null)
  const detailId = `help-instructions-${useId().replaceAll(':', '')}`
  const { visual } = model
  const selectPoint = (point) =>
    setSelected(
      model.steps.find(
        (step) => step.point === point && step.view === 'guide'
      ) || model.defaultStep
    )
  const selectView = (view) =>
    setSelected(
      view === 'guide'
        ? model.steps.find(
            (step) => step.point === selected.point && step.view === 'guide'
          ) || model.defaultStep
        : view === 'result'
          ? model.steps.find((step) => step.view === 'result') || model.result
          : model.exception
    )
  return (
    <div className="erp-help-scenario">
      <HelpOverview
        model={model}
        scenario={scenario}
        selected={selected}
        roleKey={roleKey}
        onSelect={setSelected}
        detailId={detailId}
        overviewRef={overviewRef}
      />
      <section className="erp-help-instructions" aria-label="办理说明">
        <div className="erp-help-view-switch">
          <SlidingTabList
            aria-label="帮助内容"
            options={viewOptions}
            value={selected.view}
            onChange={selectView}
          />
        </div>
        <div
          id={detailId}
          className="erp-help-view-body"
          data-help-view={selected.view}
        >
          {selected.view === 'guide' ? (
            <>
              {visual && !compact ? (
                <>
                  <p className="erp-help-caption">
                    点击 A / B / C 查看操作位置；示例仅帮助理解。
                  </p>
                  <div className="erp-help-content-grid">
                    <HelpScenarioIllustration
                      scenarioKey={scenario.key}
                      visual={visual}
                      point={selected.point}
                      onSelect={selectPoint}
                      roleKey={roleKey}
                    />
                    <div className="erp-help-notes">
                      {visual.points.map(([title, description], index) => (
                        <button
                          type="button"
                          key={title}
                          className="erp-help-note"
                          aria-label={`说明 ${String.fromCharCode(65 + index)}：${title}`}
                          aria-pressed={selected.point === index}
                          onClick={() => selectPoint(index)}
                        >
                          <span className="erp-help-point" aria-hidden="true">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span>
                            <strong>{title}</strong>
                            <span>{description}</span>
                          </span>
                        </button>
                      ))}
                      <p className="erp-help-boundary">{visual.boundary}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="erp-help-current-step">
                  <span
                    className="erp-help-current-step__number"
                    aria-hidden="true"
                  >
                    {selected.number}
                  </span>
                  <div>
                    <span className="erp-help-muted">{selected.owner}</span>
                    <h3>{selected.title}</h3>
                    <p>{selected.description}</p>
                  </div>
                </div>
              )}
              {!compact ? (
                <>
                  <details className="erp-help-source-details">
                    <summary>查看完整办理说明</summary>
                    <ol>
                      {scenario.steps.map((step) => (
                        <li key={step.title}>
                          <strong>
                            {step.title} · {step.owner}
                          </strong>
                          <p>{step.description}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <section
                    className="erp-help-step-checks"
                    aria-label="完成标准与常见问题"
                  >
                    <h4>怎样算办成了</h4>
                    <p>{scenario.completion}</p>
                    <h4>完成后交给谁</h4>
                    <p>{scenario.handoff}</p>
                    <details>
                      <summary className="erp-help-step-checks-toggle">
                        卡住时看这里
                      </summary>
                      <p>{scenario.exception.trigger}</p>
                      <p>{scenario.exception.action}</p>
                    </details>
                  </section>
                </>
              ) : null}
            </>
          ) : selected.view === 'result' ? (
            <Outcomes scenario={scenario} visual={visual} />
          ) : (
            <Exception
              scenario={scenario}
              model={model}
              onResume={() => {
                setSelected(
                  model.steps.find((step) => step.id === model.exception.back)
                )
                overviewRef.current
                  ?.querySelector(`[data-help-step="${model.exception.back}"]`)
                  ?.focus()
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
