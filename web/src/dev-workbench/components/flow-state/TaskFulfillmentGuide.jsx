import React from 'react'
import { Button, Drawer } from 'antd'
import { CloseOutlined, LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '../../../common/components/navigation/SlidingSegmented.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import {
  fulfillmentHandling,
  fulfillmentRoleOptions,
  fulfillmentStepMatchesRole,
  fulfillmentTaskLinks,
  normalizeFulfillmentRole,
} from '../../../erp/utils/workflowFulfillment.mjs'
import {
  buildFulfillmentExceptionDirectory,
  getFulfillmentStageContext,
  getFulfillmentStageCopy,
  getFulfillmentSupplement,
  selectFulfillmentException,
} from '../../config/devFulfillmentPresentation.mjs'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'
import FulfillmentChainCanvas from './FulfillmentChainCanvas.jsx'
import FulfillmentExceptionDetails from './FulfillmentExceptionDetails.jsx'
import './taskFulfillmentGuide.css'

const exceptionKeys = [
  queryKeys.exception,
  queryKeys.exceptionOrigin,
  queryKeys.exceptionDecision,
  queryKeys.exceptionStep,
]
const detailKeys = [
  ...exceptionKeys,
  queryKeys.roleStage,
  queryKeys.roleSubstep,
  queryKeys.roleHandling,
  queryKeys.roleTopic,
]

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

function ScopedStageOverview({
  steps,
  role,
  selectedStage,
  detailID,
  overviewRef,
  onSelect,
}) {
  return (
    <ol
      ref={overviewRef}
      className="erp-dev-fulfillment-guide__steps"
      aria-label={`全部 ${steps.length} 个环节`}
    >
      {steps.map((step, index) => (
        <li
          key={step.stage}
          data-fulfillment-stage={step.stage}
          data-role-match={
            role === 'all' ? undefined : fulfillmentStepMatchesRole(step, role)
          }
        >
          <button
            type="button"
            aria-label={`${index + 1} ${step.label}`}
            aria-pressed={selectedStage === step.stage}
            aria-expanded={selectedStage === step.stage}
            aria-controls={detailID}
            onClick={() => onSelect(step.stage)}
          >
            <span className="erp-dev-fulfillment-guide__step-number">
              {index + 1}
            </span>
            <span className="erp-dev-fulfillment-guide__step-copy">
              <strong>{step.label}</strong>
              {step.branch ? <small>条件分支</small> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function ExceptionFlowDirectory({
  role,
  selectedGuide,
  selectedStage,
  onSelect,
  onSelectStage,
}) {
  const [stage, setStage] = React.useState('all')
  const items = buildFulfillmentExceptionDirectory(
    catalog.exception_guides,
    role,
    stage === 'all' ? undefined : stage
  ).filter(
    (item) =>
      stage === 'all' || item.stages.some((step) => step.stage === stage)
  )
  const otherStages = catalog.fulfillment_flow.filter(
    (step) =>
      step.handling &&
      !step.handling.guides.length &&
      (stage === 'all' || stage === step.stage)
  )
  return (
    <section className="erp-dev-exception-directory" aria-label="异常目录">
      <FilterSelect
        aria-label="筛选异常环节"
        label="异常环节"
        emptyValue="all"
        placeholder="选择异常环节"
        value={stage}
        onChange={setStage}
        options={[
          ...catalog.fulfillment_flow.map((step, index) => ({
            value: step.stage,
            label: `${index + 1} ${getFulfillmentStageCopy(step).label}`,
          })),
        ]}
        virtual={false}
      />
      <ul className="erp-dev-exception-directory__list">
        {items.map(({ guide, stages, roleMatch }) => (
          <li
            key={guide.key}
            data-exception-entry={guide.key}
            data-role-match={role === 'all' ? undefined : roleMatch}
          >
            <button
              type="button"
              aria-pressed={selectedGuide === guide.key}
              onClick={() => onSelect(guide)}
            >
              <span>
                <strong>{guide.label}</strong>
                <small>
                  {stages
                    .map((step) => getFulfillmentStageCopy(step).label)
                    .join(' · ') || '独立业务'}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {otherStages.length ? (
        <>
          <h3>其他环节问题</h3>
          <ul className="erp-dev-exception-directory__list">
            {otherStages.map((step) => (
              <li key={step.stage} data-handling-entry={step.stage}>
                <button
                  type="button"
                  aria-pressed={selectedStage === step.stage}
                  onClick={() => onSelectStage(step.stage, true)}
                >
                  <strong>{getFulfillmentStageCopy(step).label}</strong>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <details className="erp-dev-fulfillment-guide__instructions">
        <summary>未列出的问题</summary>
        <p>
          关联来源单据安排跟进，记录受阻原因与反馈。任务结束不代替实物、检验或款项结果。
        </p>
      </details>
    </section>
  )
}

export default function TaskFulfillmentGuide({
  onExploreStage,
  onExploreNode,
  steps = catalog.fulfillment_flow,
  scoped = false,
  renderTopics,
  businessChains = [],
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const roleLabel = fulfillmentRoleOptions.find(
    (option) => option.value === role
  ).label
  const roleSelectID = React.useId()
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const detailRef = React.useRef(null)
  const openerRef = React.useRef(null)
  const pendingScroll = React.useRef(false)
  const view =
    !scoped &&
    renderTopics &&
    ['topics', 'exceptions'].includes(searchParams.get(queryKeys.roleTab))
      ? searchParams.get(queryKeys.roleTab)
      : 'main'
  const topic = businessChains.find(
    (item) => item.key === searchParams.get(queryKeys.roleTopic)
  )
  const guideKey = searchParams.get(queryKeys.exception)
  const selection = guideKey
    ? selectFulfillmentException({
        guideKey,
        planKey: searchParams.get(queryKeys.exceptionDecision),
        originStage: searchParams.get(queryKeys.exceptionOrigin),
        stepKey: searchParams.get(queryKeys.exceptionStep),
        role,
      })
    : null
  const requestedStep = steps.find(
    (step) =>
      step.stage ===
      (searchParams.get(queryKeys.exceptionOrigin) ||
        searchParams.get(queryKeys.roleStage))
  )
  const current =
    requestedStep ||
    (scoped && !selection
      ? steps.find((step) => fulfillmentStepMatchesRole(step, role)) || steps[0]
      : null)
  const handling = current?.handling ? fulfillmentHandling(current) : null
  const handlingOpen = Boolean(
    handling && (searchParams.get(queryKeys.roleHandling) === '1' || selection)
  )
  const context =
    current && !scoped ? getFulfillmentStageContext(steps, current.stage) : null
  const supplement = current ? getFulfillmentSupplement(current) : null
  const detailOpen = Boolean(current || selection || topic)
  const links = [
    ...new Map(
      [
        ...(current
          ? handlingOpen
            ? handling.taskLinks
            : fulfillmentTaskLinks(current)
          : []),
        ...(!current && selection?.guide ? fulfillmentTaskLinks(selection.guide) : []),
      ].map((link) => [link.key, link])
    ).values(),
  ]

  React.useEffect(() => {
    if (pendingScroll.current && detailOpen) {
      pendingScroll.current = false
      detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [searchParams, detailOpen])

  const update = (change, reveal = false) => {
    if (reveal) {
      openerRef.current = document.activeElement?.closest(
        'button, [role="button"]'
      )
      pendingScroll.current = Boolean(
        detailRef.current &&
        overviewRef.current &&
        detailRef.current.getBoundingClientRect().top >=
          overviewRef.current.getBoundingClientRect().bottom
      )
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      change(next)
      return next
    })
  }
  const setGuide = (next, guide, origin, keepPlan = false) => {
    if (!keepPlan || next.get(queryKeys.exception) !== guide.key)
      { exceptionKeys.forEach((key) => next.delete(key)) }
    next.set(queryKeys.exception, guide.key)
    if (guide.entry_stages.includes(origin))
      { next.set(queryKeys.exceptionOrigin, origin) }
    else next.delete(queryKeys.exceptionOrigin)
  }
  const selectStage = (stage, showHandling = false, keepPlan = false) =>
    update((next) => {
      if (scoped && !steps.some((step) => step.stage === stage)) {
        next.set(queryKeys.chain, 'all')
        next.delete(queryKeys.node)
      }
      next.delete(queryKeys.roleTopic)
      next.delete(queryKeys.roleSubstep)
      next.set(queryKeys.roleStage, stage)
      if (showHandling) next.set(queryKeys.roleHandling, '1')
      else next.delete(queryKeys.roleHandling)
      const choices =
        catalog.fulfillment_flow.find((step) => step.stage === stage)?.handling
          ?.guides || []
      const guide =
        keepPlan && choices.includes(selection?.guide?.key)
          ? selection.guide
          : choices.length === 1
            ? catalog.exception_guides.find((item) => item.key === choices[0])
            : null
      if (showHandling && guide) setGuide(next, guide, stage, keepPlan)
      else exceptionKeys.forEach((key) => next.delete(key))
    }, true)
  const openException = (guide, origin = null) =>
    update((next) => {
      detailKeys.forEach((key) => next.delete(key))
      if (origin) {
        next.set(queryKeys.roleStage, origin)
        next.set(queryKeys.roleHandling, '1')
      }
      setGuide(next, guide, origin)
    }, true)
  const closeDetail = () => {
    update((next) => detailKeys.forEach((key) => next.delete(key)))
    requestAnimationFrame(() => {
      const opener = openerRef.current
      const stageEntry = current && overviewRef.current?.querySelector(`[data-fulfillment-stage="${current.stage}"] ${handlingOpen ? '[data-stage-exception]' : 'button'}`)
      const target = opener?.isConnected ? opener : stageEntry || overviewRef.current?.querySelector('button')
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest' })
    })
  }
  const setView = (value) =>
    update((next) =>
      value === 'main'
        ? next.delete(queryKeys.roleTab)
        : next.set(queryKeys.roleTab, value)
    )
  const stageNumber = current ? steps.indexOf(current) + 1 : null
  const title =
    topic?.label ||
    (selection?.invalid
      ? '异常链接不可用'
      : current
        ? getFulfillmentStageCopy(current).label
        : selection?.guide.label)
  const stageRole =
    current &&
    (role !== 'all' && !fulfillmentStepMatchesRole(current, role)
      ? `本环节未登记${roleLabel}职责`
      : current.role)
  const selectedGuide = selection?.guide?.key
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide">
      <div className="erp-dev-fulfillment-guide__heading">
        <h2>{scoped ? '办理环节' : '订单全流程'}</h2>
        <div className="erp-dev-fulfillment-guide__navigation">
          <div className="erp-dev-fulfillment-guide__role">
            <label htmlFor={roleSelectID}>关注岗位</label>
            <FilterSelect
              emptyValue="all"
              placeholder="选择关注岗位"
              id={roleSelectID}
              aria-label="关注岗位"
              value={role}
              options={fulfillmentRoleOptions}
              onChange={(value) =>
                update((next) =>
                  value === 'all'
                    ? next.delete(queryKeys.role)
                    : next.set(queryKeys.role, value)
                )
              }
              virtual={false}
            />
          </div>
          {!scoped && renderTopics ? (
            <Button
              aria-label={view === 'main' ? '按业务查阅' : '返回完整流程'}
              onClick={() => setView(view === 'main' ? 'topics' : 'main')}
            >
              {view === 'main' ? '按业务查阅' : '返回完整流程'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="erp-dev-fulfillment-guide__workspace">
        <div className="erp-dev-fulfillment-guide__overview">
          {view === 'main' ? (
            <>
              <div className="erp-dev-fulfillment-guide__scope-bar">
                <span role="status">
                  {role === 'all'
                    ? `全部 ${steps.length} 个环节`
                    : `${roleLabel}参与 ${steps.filter((step) => fulfillmentStepMatchesRole(step, role)).length} / ${steps.length} 个环节`}
                </span>
              </div>
              {scoped ? (
                <ScopedStageOverview
                  steps={steps}
                  role={role}
                  selectedStage={current?.stage}
                  detailID={detailID}
                  overviewRef={overviewRef}
                  onSelect={selectStage}
                />
              ) : (
                <FulfillmentChainCanvas
                  role={role}
                  selectedStage={current?.stage}
                  handlingOpen={handlingOpen}
                  selectedGuide={selectedGuide}
                  detailID={detailID}
                  overviewRef={overviewRef}
                  onSelectStage={selectStage}
                  onOpenException={openException}
                />
              )}
            </>
          ) : (
            <div
              ref={overviewRef}
              className="erp-dev-fulfillment-guide__directory"
            >
              <SlidingSegmented
                aria-label="查阅目录"
                hierarchy="secondary"
                value={view}
                options={[
                  { value: 'topics', label: '业务流程' },
                  { value: 'exceptions', label: '异常目录' },
                ]}
                onChange={setView}
              />
              {view === 'topics' ? (
                renderTopics({
                  selectedTopicKey: topic?.key,
                  onSelectTopic: (key) =>
                    update((next) => {
                      detailKeys.forEach((item) => next.delete(item))
                      next.set(queryKeys.roleTopic, key)
                    }, true),
                })
              ) : (
                <ExceptionFlowDirectory
                  role={role}
                  selectedGuide={selectedGuide}
                  selectedStage={current?.stage}
                  onSelect={openException}
                  onSelectStage={selectStage}
                />
              )}
            </div>
          )}
        </div>
        <aside
          className="erp-dev-fulfillment-guide__panel"
          aria-label="流程详情"
          id={detailID}
          ref={detailRef}
        >
          {!detailOpen ? (
            <p className="erp-dev-fulfillment-guide__empty">
              选择环节查看流程，点击环节下方「异常」查看处理方式。
            </p>
          ) : (
            <div
              className="erp-dev-fulfillment-guide__result"
              data-stage-mode={
                handlingOpen || selection ? 'handling' : 'normal'
              }
            >
              <div className="erp-dev-fulfillment-guide__detail-heading">
                <div className="erp-dev-fulfillment-guide__detail-title">
                  {current && !topic ? (
                    <span>
                      {stageNumber} / {steps.length}
                    </span>
                  ) : null}
                  <h3>{title}</h3>
                </div>
                {!scoped ? (
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="收起详情"
                    onClick={closeDetail}
                  />
                ) : null}
              </div>
              {selection?.invalid ? (
                <p role="alert">
                  {selection.invalid}，请重新选择环节或异常类型。
                </p>
              ) : topic ? (
                <>
                  <p>{topic.summary}</p>
                  <ul className="erp-dev-fulfillment-guide__topic-nodes">
                    {topic.nodes.map((node) => (
                      <li key={node.key}>{node.label}</li>
                    ))}
                  </ul>
                  <div className="erp-dev-fulfillment-guide__involved">
                    {catalog.fulfillment_flow
                      .filter((step) => step.business_chain === topic.key)
                      .map((step) => (
                        <Button
                          type="link"
                          key={step.stage}
                          onClick={() => selectStage(step.stage)}
                        >
                          {getFulfillmentStageCopy(step).label}
                        </Button>
                      ))}
                  </div>
                  <Button onClick={() => onExploreStage(topic.key)}>
                    单据与规则
                  </Button>
                </>
              ) : (
                <>
                  {handling ? (
                    <SlidingSegmented
                      className="erp-dev-fulfillment-guide__mode"
                      aria-label="环节办理方式"
                      hierarchy="secondary"
                      value={handlingOpen ? 'handling' : 'normal'}
                      options={[
                        { value: 'normal', label: '流程' },
                        { value: 'handling', label: '异常' },
                      ]}
                      onChange={(value) =>
                        selectStage(current.stage, value === 'handling')
                      }
                    />
                  ) : null}
                  {current &&
                  (!current.subflow || handlingOpen || role !== 'all') ? (
                    <p className="erp-dev-fulfillment-guide__owner">
                      {stageRole}
                    </p>
                  ) : null}
                  {handlingOpen ? (
                    <section
                      className="erp-dev-fulfillment-guide__handling"
                      data-stage-handling={current.stage}
                    >
                      <p>{handling.issues}</p>
                      {handling.guides.length > 1 ? (
                        <div
                          className="erp-dev-fulfillment-guide__choices"
                          role="group"
                          aria-label="异常类型"
                        >
                          <span>异常类型</span>
                          {handling.guides.map((guide) => (
                            <Button
                              key={guide.key}
                              aria-pressed={selectedGuide === guide.key}
                              onClick={() =>
                                selectedGuide === guide.key
                                  ? update((next) =>
                                      exceptionKeys.forEach((key) =>
                                        next.delete(key)
                                      )
                                    )
                                  : openException(guide, current.stage)
                              }
                            >
                              {guide.label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {!selection ? (
                        <dl className="erp-dev-fulfillment-guide__node-facts">
                          <dt>处理</dt>
                          <dd>{handling.action}</dd>
                          <dt>继续条件</dt>
                          <dd>{handling.resume}</dd>
                        </dl>
                      ) : null}
                    </section>
                  ) : null}
                  {selection?.guide ? (
                    <FulfillmentExceptionDetails
                      selection={selection}
                      context={current}
                      role={role}
                      onSelectStage={selectStage}
                      onSelectPlan={(key) =>
                        update((next) => {
                          if (key) next.set(queryKeys.exceptionDecision, key)
                          else next.delete(queryKeys.exceptionDecision)
                          next.delete(queryKeys.exceptionStep)
                        })
                      }
                      onSelectStep={(key) =>
                        update((next) => next.set(queryKeys.exceptionStep, key))
                      }
                    />
                  ) : null}
                  {current && !handlingOpen && !selection ? (
                    <div
                      className="erp-dev-fulfillment-guide__detail-content"
                      data-stage-normal={current.stage}
                    >
                      {current.subflow ? (
                        <FulfillmentSubflow
                          step={current}
                          role={role}
                          searchParams={searchParams}
                          setSearchParams={setSearchParams}
                          onOpenException={(_, key) => {
                            const guide = catalog.exception_guides.find(
                              (item) => item.key === key
                            )
                            if (guide) openException(guide, current.stage)
                          }}
                        />
                      ) : (
                        <p>{current.result}</p>
                      )}
                      {context?.related.length ? (
                        <div className="erp-dev-fulfillment-guide__involved">
                          <span>按约定关联</span>
                          {context.related.map(({ step, label }) => (
                            <Button
                              type="link"
                              size="small"
                              key={step.stage}
                              onClick={() => selectStage(step.stage)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {current.subflow ||
                      supplement.handoffs.length ||
                      supplement.approvals.length ||
                      supplement.exception ? (
                        <details
                          className="erp-dev-fulfillment-guide__instructions"
                          key={current.stage}
                        >
                          <summary>环节说明</summary>
                          {current.subflow ? (
                            <>
                              <p>{current.subflow.summary}</p>
                              <p>{current.result}</p>
                            </>
                          ) : null}
                          {supplement.handoffs.length ? (
                            <ol>
                              {supplement.handoffs.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ol>
                          ) : null}
                          {supplement.approvals.map((approval) => (
                            <ApprovalDetails
                              key={approval.label}
                              approval={approval}
                            />
                          ))}
                          {supplement.exception ? (
                            <p>{supplement.exception}</p>
                          ) : null}
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="erp-dev-fulfillment-guide__detail-actions">
                    {links.length ? (
                      <div
                        className="erp-dev-fulfillment-guide__links"
                        aria-label="相关任务"
                      >
                        <span>任务</span>
                        {links.map((link) => (
                          <a key={link.key} href={link.href}>
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {onExploreStage && (current || selection?.guide) ? (
                      <Button
                        type="link"
                        onClick={() =>
                          onExploreStage(
                            current?.business_chain ||
                              selection.guide.business_chain
                          )
                        }
                      >
                        单据与规则
                      </Button>
                    ) : null}
                    {onExploreNode && current?.nodeKey ? (
                      <Button
                        type="link"
                        onClick={() => onExploreNode(current.nodeKey)}
                      >
                        单据与规则
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
      <p className="erp-dev-fulfillment-guide__boundary">
        流程示意，非实际进度；任务完成不代替正式业务结果。
      </p>
    </section>
  )
}

export function TaskFulfillmentGuideButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>岗位流程与异常分支</Button>
      <Drawer
        rootClassName="erp-dev-fulfillment-drawer"
        title="订单全流程"
        width={1120}
        open={open}
        closable={{ placement: 'start' }}
        closeIcon={<LeftOutlined />}
        onClose={() => setOpen(false)}
      >
        <TaskFulfillmentGuide />
      </Drawer>
    </>
  )
}
