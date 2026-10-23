import React from 'react'
import { Button, Drawer } from 'antd'
import { CloseOutlined, LeftOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import SlidingSegmented from '../../../common/components/navigation/SlidingSegmented.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import {
  fulfillmentRoleOptions,
  fulfillmentStepMatchesRole,
  fulfillmentTaskLinks,
  normalizeFulfillmentRole,
} from '../../../erp/utils/workflowFulfillment.mjs'
import {
  buildFulfillmentExceptionDirectory,
  getFulfillmentStageCopy,
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
]

export default function TaskFulfillmentGuide({
  onExploreStage,
  onExploreNode,
  steps = catalog.fulfillment_flow,
  scoped = false,
  renderTopics,
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
  const revealRef = React.useRef(false)
  const view =
    !scoped &&
    ['topics', 'exceptions'].includes(searchParams.get(queryKeys.roleTab)) &&
    (renderTopics || searchParams.get(queryKeys.roleTab) === 'exceptions')
      ? searchParams.get(queryKeys.roleTab)
      : 'main'
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
  const current =
    steps.find((step) => step.stage === searchParams.get(queryKeys.roleStage)) ||
    (scoped
      ? steps.find((step) => fulfillmentStepMatchesRole(step, role)) || steps[0]
      : null)
  const currentLabel = current
    ? `${(scoped ? steps : catalog.fulfillment_flow).findIndex((step) => step.stage === current.stage) + 1} · ${getFulfillmentStageCopy(current).label}`
    : null
  const canReturn = Boolean(selection && current)
  const detailStep = selection
    ? steps.find((step) => step.stage === selection.origin?.stage) || selection.origin
    : current
  const showDetail = view !== 'topics' && Boolean(current || selection)
  const links = [
    ...new Map(
      [
        ...(detailStep ? fulfillmentTaskLinks(detailStep) : []),
        ...(selection?.guide ? fulfillmentTaskLinks(selection.guide) : []),
      ].map((link) => [link.key, link])
    ).values(),
  ]
  const exceptionDirectory = buildFulfillmentExceptionDirectory(
    catalog.exception_guides,
    role
  )

  React.useEffect(() => {
    if (revealRef.current && showDetail) {
      revealRef.current = false
      detailRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [searchParams, showDetail])

  const update = (change, reveal = false) => {
    if (reveal) {
      openerRef.current = document.activeElement?.closest('button')
      revealRef.current = true
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      change(next)
      return next
    })
  }
  const selectStage = (stage) =>
    update((next) => {
      detailKeys.forEach((key) => next.delete(key))
      next.set(queryKeys.roleStage, stage)
      if (!scoped) next.delete(queryKeys.roleTab)
      if (scoped && !steps.some((step) => step.stage === stage)) {
        next.set(queryKeys.chain, 'all')
        next.delete(queryKeys.node)
      }
    }, true)
  const openException = (guide, origin = null) =>
    update((next) => {
      exceptionKeys.forEach((key) => next.delete(key))
      // 查看位置与异常的业务来源分开保存，独立异常也能回到原环节。
      if (origin || current) {
        if (origin && origin !== current?.stage) {
          next.delete(queryKeys.roleSubstep)
        }
        next.set(queryKeys.roleStage, origin || current.stage)
      }
      next.set(queryKeys.exception, guide.key)
      if (guide.entry_stages.includes(origin)) {
        next.set(queryKeys.exceptionOrigin, origin)
      }
    }, true)
  const setView = (value) =>
    update((next) => {
      detailKeys.forEach((key) => next.delete(key))
      if (value === 'main') next.delete(queryKeys.roleTab)
      else next.set(queryKeys.roleTab, value)
    })
  const closeDetail = () => {
    update((next) =>
      (canReturn ? exceptionKeys : detailKeys).forEach((key) =>
        next.delete(key)
      )
    )
    requestAnimationFrame(
      () =>
        openerRef.current?.isConnected &&
        openerRef.current.focus({ preventScroll: true })
    )
  }
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide">
      <div className="erp-dev-fulfillment-guide__heading">
        {scoped || !renderTopics ? (
          <h2>{scoped ? '办理环节' : '订单全流程'}</h2>
        ) : (
          <SlidingSegmented
            aria-label="流程视图"
            hierarchy="secondary"
            value={view}
            options={[
              { value: 'main', label: '订单全流程' },
              { value: 'topics', label: '业务专题' },
              { value: 'exceptions', label: '异常处理' },
            ]}
            onChange={setView}
          />
        )}
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
      </div>
      {view === 'topics' ? (
        renderTopics({
          selectedTopicKey: searchParams.get(queryKeys.roleTopic),
          onSelectTopic: (key) =>
            update((next) => next.set(queryKeys.roleTopic, key ?? '')),
        })
      ) : (
        <>
          {view === 'main' ? (
            <>
              <p className="erp-dev-fulfillment-guide__scope-bar" role="status">
                {role === 'all'
                  ? `${steps.length} 个环节 · 点选查看办理流程`
                  : `${roleLabel}参与 ${steps.filter((step) => fulfillmentStepMatchesRole(step, role)).length} / ${steps.length} 个环节`}
              </p>
              {scoped ? (
                <div
                  className="erp-dev-fulfillment-guide__stage-picker"
                  ref={overviewRef}
                >
                  {steps.map((step) => (
                    <Button
                      key={step.stage}
                      aria-pressed={detailStep?.stage === step.stage}
                      data-fulfillment-stage={step.stage}
                      data-role-match={
                        role === 'all'
                          ? undefined
                          : fulfillmentStepMatchesRole(step, role)
                      }
                      onClick={() => selectStage(step.stage)}
                    >
                      {getFulfillmentStageCopy(step).label}
                    </Button>
                  ))}
                </div>
              ) : (
                <FulfillmentChainCanvas
                  role={role}
                  selectedStage={detailStep?.stage}
                  selectedGuide={selection?.guide?.key}
                  detailID={detailID}
                  overviewRef={overviewRef}
                  onSelectStage={selectStage}
                  onOpenException={openException}
                />
              )}
            </>
          ) : (
            <section
              className="erp-dev-exception-directory"
              aria-label="异常处理目录"
            >
              <div
                className="erp-dev-exception-directory__list"
                role="group"
                aria-label="异常类型"
              >
                {exceptionDirectory.map(({ guide, roleMatch }) => (
                  <button
                    key={guide.key}
                    type="button"
                    className="erp-dev-directory-item"
                    data-exception-entry={guide.key}
                    data-role-match={role === 'all' ? undefined : roleMatch}
                    aria-pressed={guideKey === guide.key}
                    onClick={() => openException(guide)}
                  >
                    <span>{guide.label}</span>
                    {role !== 'all' && roleMatch ? <small>本岗位</small> : null}
                  </button>
                ))}
              </div>
              {!selection ? (
                <p className="erp-dev-fulfillment-guide__empty">
                  选择异常类型，查看处理分支及回接位置。
                </p>
              ) : null}
            </section>
          )}
          {showDetail ? (
            <section
              className="erp-dev-fulfillment-guide__panel"
              aria-label="流程详情"
              ref={detailRef}
              id={detailID}
            >
              <div className="erp-dev-fulfillment-guide__detail-heading">
                <div className="erp-dev-fulfillment-guide__detail-title">
                  {canReturn ? (
                    <Button
                      icon={<LeftOutlined />}
                      aria-label={`返回 ${currentLabel}`}
                      onClick={closeDetail}
                    >
                      返回 {currentLabel}
                    </Button>
                  ) : null}
                  <h3>
                    {selection?.invalid
                      ? '异常链接不可用'
                      : selection?.guide
                        ? selection.guide.label
                        : currentLabel}
                  </h3>
                </div>
                {!scoped && !canReturn ? (
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="收起详情"
                    onClick={closeDetail}
                  />
                ) : null}
              </div>
              {selection?.invalid ? (
                <p role="alert">{selection.invalid}，请重新选择异常类型。</p>
              ) : selection?.guide ? (
                <FulfillmentExceptionDetails
                  selection={selection}
                  role={role}
                  onSelectOrigin={(stage) =>
                    update((next) =>
                      stage
                        ? next.set(queryKeys.exceptionOrigin, stage)
                        : next.delete(queryKeys.exceptionOrigin)
                    )
                  }
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
              ) : current ? (
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
                      onOpenException={(_, key) =>
                        openException(
                          catalog.exception_guides.find(
                            (guide) => guide.key === key
                          ),
                          current.stage
                        )
                      }
                    />
                  ) : (
                    <p>{current.result}</p>
                  )}
                  <details
                    className="erp-dev-disclosure erp-dev-fulfillment-guide__instructions"
                    key={current.stage}
                  >
                    <summary>办理规则与受阻处理</summary>
                    <p>{current.result}</p>
                    {current.handoffs?.map((text) => (
                      <p key={text}>{text}</p>
                    ))}
                    {current.approvals?.map((approval) => (
                      <p key={approval.label}>
                        {approval.label}：{approval.condition} 通过：
                        {approval.passed} 未通过：{approval.rejected}
                      </p>
                    ))}
                    {current.handling ? (
                      <div data-stage-handling={current.stage}>
                        <p>{current.handling.issues}</p>
                        <p>{current.handling.action}</p>
                        <p>{current.handling.resume}</p>
                        <div className="erp-dev-fulfillment-guide__links">
                          {fulfillmentTaskLinks({
                            stages: current.handling.task_stages.filter(
                              (stage) => !current.stages.includes(stage)
                            ),
                          }).map((link) => (
                            <a key={link.key} href={link.href}>
                              {link.pathLabel}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </details>
                </div>
              ) : null}
              {!selection?.invalid ? (
                <div className="erp-dev-fulfillment-guide__detail-actions">
                  {links.length ? (
                    <div
                      className="erp-dev-fulfillment-guide__links"
                      aria-label="相关任务"
                    >
                      <span>任务</span>
                      {links.map((link) => (
                        <a key={link.key} href={link.href}>
                          {links.filter((item) => item.label === link.label)
                            .length > 1
                            ? link.pathLabel
                            : link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {onExploreStage && (current || selection?.guide) ? (
                    <Button
                      type="link"
                      onClick={() =>
                        onExploreStage(
                          selection?.guide?.business_chain ||
                            current?.business_chain
                        )
                      }
                    >
                      查看关联单据
                    </Button>
                  ) : null}
                  {onExploreNode && detailStep?.nodeKey ? (
                    <Button
                      type="link"
                      onClick={() => onExploreNode(detailStep.nodeKey)}
                    >
                      查看关联单据
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
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
