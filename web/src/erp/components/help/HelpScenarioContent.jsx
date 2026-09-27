import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import SlidingSegmented from '../../../common/components/navigation/SlidingSegmented'
import { getHelpScenarioPresentation } from '../../config/helpScenarioPresentation.mjs'
import HelpScenarioIllustration from './HelpScenarioIllustration'

const viewOptions = [
  { label: '怎么做', value: 'guide' },
  { label: '完成后', value: 'result' },
  { label: '遇到异常', value: 'exception' },
]
const kindLabels = { chain: '业务交接', steps: '操作步骤', path: '查询路径' }

function HelpOverview({
  model,
  selected,
  roleKey,
  onSelect,
  detailId,
  overviewRef,
}) {
  const markerId = `help-arrow-${useId().replaceAll(':', '')}`
  const stepsRef = useRef(null)
  const [rowHeight, setRowHeight] = useState(96)
  useLayoutEffect(() => {
    if (model.kind !== 'chain') return undefined
    const element = stepsRef.current
    const measure = () =>
      setRowHeight(Math.ceil(element.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [model.kind])
  const count = model.steps.length
  const nodeWidth = (1000 - (count - 1) * 24) / count
  const nodeStart = (index) => index * (nodeWidth + 24)
  const nodeCenter = (id) =>
    nodeStart(model.steps.findIndex((item) => item.id === id)) + nodeWidth / 2
  const from = nodeCenter(model.exception.from)
  const back = nodeCenter(model.exception.back) - nodeWidth * 0.24
  // 横向坐标来自同一网格，纵向跟随实际换行高度，避免长岗位名称挡住异常箭头。
  const issueCenter = Math.max(160, Math.min(840, from))
  const selectedStep = model.steps.find((item) => item.id === selected.id)
  const detail = selectedStep
    ? `${selectedStep.owner} · ${selectedStep.description}`
    : selected.view === 'exception'
      ? `${model.exception.owner} · 处理后回到第 ${model.exception.backNumber} 步重新核对。`
      : '核对完成条件与交接结果。'
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
      <div className="erp-help-flow__scroll">
        <div
          className="erp-help-flow__canvas"
          style={{
            '--help-step-count': count,
            '--help-flow-min-width': `${count * 140 + (count - 1) * 24}px`,
            '--help-flow-height': `${rowHeight + 150}px`,
          }}
        >
          <ol ref={stepsRef} className="erp-help-flow__steps">
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
                    {step.roles.includes(roleKey) ? <em>本岗位参与</em> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {model.kind === 'chain' ? (
            <>
              <svg
                className="erp-help-flow__edges"
                viewBox={`0 0 1000 ${rowHeight + 150}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id={markerId}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                {model.steps.slice(0, -1).map((step, index) => (
                  <path
                    key={step.id}
                    d={`M ${nodeStart(index) + nodeWidth} ${rowHeight / 2} H ${nodeStart(index + 1) - 3}`}
                    markerEnd={`url(#${markerId})`}
                  />
                ))}
                <path
                  className="erp-help-flow__branch"
                  d={`M ${from} ${rowHeight} V ${rowHeight + 23} H ${issueCenter} V ${rowHeight + 50}`}
                  markerEnd={`url(#${markerId})`}
                />
                <path
                  className="erp-help-flow__branch"
                  d={`M ${issueCenter - 140} ${rowHeight + 85} H ${Math.min(issueCenter - 156, back - 25)} V ${rowHeight + 13} H ${back} V ${rowHeight + 2}`}
                  markerEnd={`url(#${markerId})`}
                />
              </svg>
              <div
                className="erp-help-flow__issue"
                style={{
                  left: `${issueCenter / 10}%`,
                  top: `${rowHeight + 52}px`,
                }}
              >
                <span className="erp-help-flow__condition">
                  {model.exception.label || '条件未满足'}
                </span>
                <button
                  type="button"
                  aria-pressed={selected.view === 'exception'}
                  aria-controls={detailId}
                  onClick={() => onSelect(model.exception)}
                >
                  <strong>{model.exception.title}</strong>
                  <span>{model.exception.owner}</span>
                </button>
                <span className="erp-help-flow__return">
                  核对后返回第 {model.exception.backNumber} 步
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <p className="erp-help-flow__detail" aria-live="polite">
        <strong>
          {selectedStep
            ? `第 ${selectedStep.number} 步`
            : selected.view === 'exception'
              ? '异常处理'
              : '完成后'}
        </strong>
        <span>{detail}</span>
      </p>
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

export default function HelpScenarioContent({ scenario, roleKey }) {
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
    <>
      <HelpOverview
        model={model}
        selected={selected}
        roleKey={roleKey}
        onSelect={setSelected}
        detailId={detailId}
        overviewRef={overviewRef}
      />
      <section className="erp-help-instructions" aria-label="办理说明">
        <div className="erp-help-view-switch">
          <SlidingSegmented
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
              {visual ? (
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
    </>
  )
}
