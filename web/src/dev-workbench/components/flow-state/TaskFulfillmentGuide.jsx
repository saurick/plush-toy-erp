import React from 'react'
import { Button, Drawer } from 'antd'
import { CloseOutlined, LeftOutlined } from '@ant-design/icons'
import { useLocation, useSearchParams } from 'react-router-dom'
import SlidingSegmented from '../../../common/components/navigation/SlidingSegmented.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys, readDevFlowRelationFilters, patchDevFlowRelationFilters } from '../../pages/devFlowStateQuery.mjs'
import { buildFulfillmentRelations, buildChainActionRelations, relationMatches, relationFiltersActive } from '../../config/devFulfillmentRelations.mjs'
import BusinessRelationFilters from './BusinessRelationFilters.jsx'
import BusinessActionRelations from './BusinessActionRelations.jsx'
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
  queryKeys.relationAction,
]

export default function TaskFulfillmentGuide({
  businessCatalog,
  steps = catalog.fulfillment_flow,
  scoped = false,
  showViewSwitch = false,
  onOpenView,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const openActionRules = onOpenView ? (action) => onOpenView('states', {
    [queryKeys.flow]: action.machineKeys.length === 1 ? action.machineKeys[0] : null,
    [queryKeys.relationAction]: action.key,
  }) : undefined
  const roleLabel = fulfillmentRoleOptions.find(
    (option) => option.value === role
  ).label
  const roleSelectID = React.useId()
  const filters = readDevFlowRelationFilters(searchParams)
  const filtered = relationFiltersActive(filters)
  const relations = React.useMemo(() => businessCatalog ? buildFulfillmentRelations(businessCatalog) : [], [businessCatalog])
  const relationByStage = new Map(relations.map((item) => [item.stage.stage, item]))
  const allActions = React.useMemo(() => businessCatalog ? businessCatalog.businessChains.flatMap((chain) => buildChainActionRelations(businessCatalog, chain)) : [], [businessCatalog])
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const detailRef = React.useRef(null)
  const openerRef = React.useRef(null)
  const revealRef = React.useRef(false)
  const view = !scoped && searchParams.get(queryKeys.roleTab) === 'exceptions'
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
    steps.find(
      (step) => step.stage === searchParams.get(queryKeys.roleStage)
    ) ||
    (scoped
      ? steps.find((step) => fulfillmentStepMatchesRole(step, role)) || steps[0]
      : null)
  const currentLabel = current
    ? `${(scoped ? steps : catalog.fulfillment_flow).findIndex((step) => step.stage === current.stage) + 1} · ${getFulfillmentStageCopy(current).label}`
    : null
  const canReturn = Boolean(selection && current)
  const detailStep = selection
    ? steps.find((step) => step.stage === selection.origin?.stage) ||
      selection.origin
    : current
  const showDetail = Boolean(current || selection)

  const exceptionDirectory = buildFulfillmentExceptionDirectory(
    catalog.exception_guides,
    businessCatalog ? 'all' : role
  ).filter(({ guide }) => !businessCatalog || !filtered || allActions.some((action) => action.chainKey === guide.business_chain && relationMatches(action, filters)))
  const filterActions = view === 'main' ? relations.filter((item) => steps.some((step) => step.stage === item.stage.stage)).flatMap((item) => item.actions) : allActions
  const matchingStages = new Set(relations.filter((item) => item.actions.some((action) => relationMatches(action, filters))).map((item) => item.stage.stage))

  const update = (change, reveal = false) => {
    if (reveal) {
      openerRef.current = document.activeElement?.closest('button')
      revealRef.current = true
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        change(next)
        return next
      },
      { state: location.state }
    )
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
        {scoped || !showViewSwitch ? (
          <h2>{scoped ? '办理环节' : '订单全流程'}</h2>
        ) : (
          <SlidingSegmented
            aria-label="流程视图"
            hierarchy="secondary"
            value={view}
            options={[
              { value: 'main', label: '订单全流程' },
              { value: 'exceptions', label: '异常处理' },
            ]}
            onChange={setView}
          />
        )}
        {businessCatalog ? (
          <BusinessRelationFilters
            catalog={businessCatalog}
            actions={filterActions}
            filters={filters}
            onChange={(patch) => setSearchParams((previous) => patchDevFlowRelationFilters(previous, patch), { state: location.state })}
          />
        ) : (
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
              update((next) => {
                if (value === 'all') next.delete(queryKeys.role)
                else next.set(queryKeys.role, value)
                next.delete(queryKeys.roleTopicNode)
                next.delete(queryKeys.roleTopicStep)
              })
            }
              virtual={false}
            />
          </div>
        )}
      </div>
      {view === 'main' ? (
        <>
          <p className="erp-dev-fulfillment-guide__scope-bar" role="status">
            {businessCatalog && filtered ? `匹配 ${steps.filter((step) => matchingStages.has(step.stage)).length} / ${steps.length} 个环节 · 保留上下游位置`
              : role === 'all'
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
                    businessCatalog && filtered
                      ? matchingStages.has(step.stage)
                      : role === 'all'
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
              matchingStages={businessCatalog && filtered ? matchingStages : null}
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
          {!selection ? (
            <FilterSelect
              label="异常类型"
              aria-label="异常类型"
              placeholder="选择异常类型"
              value={guideKey}
              options={exceptionDirectory.map(({ guide }) => ({
                value: guide.key,
                label: guide.label,
              }))}
              onChange={(key) =>
                key &&
                openException(
                  catalog.exception_guides.find(
                    (guide) => guide.key === key
                  )
                )
              }
              virtual={false}
            />
          ) : null}
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
            <div role="alert">
              <p>{selection.invalid}，请重新选择异常类型。</p>
              <Button
                onClick={() =>
                  update((next) =>
                    exceptionKeys.forEach((key) => next.delete(key))
                  )
                }
              >
                清除并重新选择
              </Button>
            </div>
          ) : selection?.guide ? (
            <FulfillmentExceptionDetails
              key={selection.guide.key}
              selection={selection}
              guides={catalog.exception_guides}
              onSelectGuide={(key) =>
                key
                  ? openException(
                      catalog.exception_guides.find(
                        (guide) => guide.key === key
                      )
                    )
                  : closeDetail()
              }
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
                  relation={relationByStage.get(current.stage)}
                  filters={filters}
                  onOpenRules={openActionRules}
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
                <>
                  <p>{current.result}</p>
                  {relationByStage.has(current.stage) ? <BusinessActionRelations
                    onOpenRules={openActionRules}
                    actions={relationByStage.get(current.stage).actions.filter((action) => relationMatches(action, filters))}
                    selectedKey={searchParams.get(queryKeys.relationAction)}
                    onSelect={(key) => update((next) => next.set(queryKeys.relationAction, key))}
                  /> : null}
                </>
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
                        <span key={link.key}>
                          {link.pathLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </details>
            </div>
          ) : null}
          {selection?.guide && !selection.invalid && businessCatalog ? <BusinessActionRelations
            onOpenRules={openActionRules}
            actions={allActions.filter((action) => action.chainKey === selection.guide.business_chain && relationMatches(action, filters))}
            selectedKey={searchParams.get(queryKeys.relationAction)}
            onSelect={(key) => update((next) => next.set(queryKeys.relationAction, key))}
          /> : null}

        </section>
      ) : null}
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
