import React from 'react'
import { Button } from 'antd'
import { CloseOutlined, LeftOutlined } from '@ant-design/icons'
import { useLocation, useSearchParams } from 'react-router-dom'
import SlidingTabList from '@/common/components/navigation/SlidingTabList.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { DEV_FLOW_FINANCE_RELATIONS_TAB, DEV_FLOW_STATE_QUERY_KEYS as queryKeys, readDevFlowRelationFilters, patchDevFlowRelationFilters } from '../../pages/devFlowStateQuery.mjs'
import { devFlowExplorerChainURL } from '../../config/devRoutes.mjs'
import { FLOW_READING_CONTEXT_KEYS } from '../../pages/devFlowViewContext.mjs'
import { buildFulfillmentRelations, buildChainActionRelations, relationMatches, relationFiltersActive } from '../../config/devFulfillmentRelations.mjs'
import { BusinessChainRoleFilter } from './BusinessRelationFilters.jsx'
import BusinessActionRelations from './BusinessActionRelations.jsx'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import {
  fulfillmentStepMatchesRole,
  fulfillmentTaskLinks,
  normalizeFulfillmentRole,
} from '../../../erp/utils/workflowFulfillment.mjs'
import {
  getFulfillmentStageCopy,
  selectFulfillmentException,
} from '../../config/devFulfillmentPresentation.mjs'
import FulfillmentSubflow from './FulfillmentSubflow.jsx'
import FulfillmentChainCanvas from './FulfillmentChainCanvas.jsx'
import FulfillmentExceptionDetails from './FulfillmentExceptionDetails.jsx'
import FinanceRelationshipsView from './FinanceRelationshipsView.jsx'
import './taskFulfillmentGuide.css'
import { ChainCapabilityLinks, ChainEvidenceLinks } from '../DevProductCoreRelations.jsx'
import { DevReadingLink } from '../DevReadingNavigation.jsx'

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
const structureTabs = [
  { value: 'main', label: '订单全流程' },
  { value: 'exceptions', label: '异常处理' },
  { value: DEV_FLOW_FINANCE_RELATIONS_TAB, label: '财务关联概览' },
]
const exceptionOptions = catalog.exception_guides.map(({ key, label }) => ({ value: key, label }))

function ExceptionActionRelations({ actions, selectedKey, restoreOpen, onSelect, onOpenRules }) {
  const [open, setOpen] = React.useState(() => restoreOpen || actions.some((action) => action.key === selectedKey))

  return (
    <details className="erp-dev-disclosure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>关联动作与规则</summary>
      {open ? (
        <BusinessActionRelations
          actions={actions}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onOpenRules={onOpenRules}
        />
      ) : null}
    </details>
  )
}

export default function TaskFulfillmentGuide({
  businessCatalog,
  steps = catalog.fulfillment_flow,
  scoped = false,
  onOpenView,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const filters = readDevFlowRelationFilters(searchParams)
  const filtered = relationFiltersActive(filters)
  const relations = React.useMemo(() => buildFulfillmentRelations(businessCatalog), [businessCatalog])
  const relationByStage = new Map(relations.map((item) => [item.stage.stage, item]))
  const detailID = React.useId()
  const overviewRef = React.useRef(null)
  const openerRef = React.useRef(null)
  const exceptionTypeRef = React.useRef(null)
  const view = scoped ? 'main' : searchParams.get(queryKeys.roleTab) || 'main'
  const showMain = view === 'main'
  const showFinance = view === DEV_FLOW_FINANCE_RELATIONS_TAB
  const guideKey = searchParams.get(queryKeys.exception)
  const restoredFrame = location.state?.flowRestoreFrame
  const selection = guideKey
    ? selectFulfillmentException({
        guideKey,
        planKey: searchParams.get(queryKeys.exceptionDecision),
        originStage: searchParams.get(queryKeys.exceptionOrigin),
        stepKey: searchParams.get(queryKeys.exceptionStep),
      })
    : null
  const openActionRules = onOpenView ? (action) => onOpenView('states', {
    [queryKeys.flow]: action.machineKeys.length === 1 ? action.machineKeys[0] : null,
    [queryKeys.relationAction]: action.key,
    ...(selection?.guide ? {
      [queryKeys.chain]: action.chainKey,
      [queryKeys.node]: null,
      [queryKeys.role]: null,
      [queryKeys.relationMachine]: null,
      [queryKeys.relationPermission]: null,
    } : {}),
  }) : undefined
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
  const relatedChainKey = selection?.guide ? selection.guide.business_chain : current?.business_chain
  const relatedChain = businessCatalog.businessChains.find((chain) => chain.key === relatedChainKey)
  const exceptionActions = selection?.guide && relatedChain ? buildChainActionRelations(businessCatalog, relatedChain) : []
  const detailStep = selection
    ? steps.find((step) => step.stage === selection.origin?.stage) ||
      selection.origin
    : current
  const showDetail = Boolean(selection || (showMain && current))

  const filterActions = relations.filter((item) => steps.some((step) => step.stage === item.stage.stage)).flatMap((item) => item.actions)
  const matchingStages = new Set(relations.filter((item) => item.actions.some((action) => relationMatches(action, filters))).map((item) => item.stage.stage))

  const update = (change, rememberOpener = false) => {
    if (rememberOpener) {
      openerRef.current = document.activeElement?.closest('button, [role="button"]')
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
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      FLOW_READING_CONTEXT_KEYS.forEach((key) => next.delete(key))
      if (value !== 'main') next.set(queryKeys.roleTab, value)
      return next
    }, { state: { ...location.state, flowReturnFrames: [], flowRestoreFrame: null } })
  const closeDetail = () => {
    update((next) => {
      (canReturn ? exceptionKeys : detailKeys).forEach((key) =>
        next.delete(key)
      )
      if (canReturn) next.delete(queryKeys.roleTab)
    })
    requestAnimationFrame(() => {
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true })
      else exceptionTypeRef.current?.focus({ preventScroll: true })
    })
  }
  return (
    <section className="erp-dev-fulfillment-guide" id="task-fulfillment-guide">
      <div className="erp-dev-fulfillment-guide__heading">
        {scoped ? (
          <h2>办理环节</h2>
        ) : (
          <SlidingTabList
            aria-label="流程视图"
            value={view}
            options={structureTabs}
            onChange={setView}
          />
        )}
        {showMain ? (
          <BusinessChainRoleFilter
            catalog={businessCatalog}
            actions={filterActions}
            filters={filters}
            onChange={(patch) => setSearchParams((previous) => patchDevFlowRelationFilters(previous, patch), { state: location.state })}
          />
        ) : view === 'exceptions' ? (
          <FilterSelect
            ref={exceptionTypeRef}
            className="erp-dev-fulfillment-guide__exception-select"
            label="异常类型"
            placeholder="请选择"
            value={selection?.guide?.key}
            options={exceptionOptions}
            showSearch={false}
            virtual={false}
            onChange={(key) => key ? openException(catalog.exception_guides.find((guide) => guide.key === key)) : closeDetail()}
          />
        ) : null}
      </div>
      {showFinance ? <FinanceRelationshipsView catalog={businessCatalog} /> : showMain ? (
        <>
          <p className="erp-dev-fulfillment-guide__scope-bar" role="status">
            {filtered
              ? `匹配 ${steps.filter((step) => matchingStages.has(step.stage)).length} / ${steps.length} 个环节 · 保留上下游位置`
              : `${steps.length} 个环节 · 点选查看办理流程`}
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
                  data-role-match={filtered ? matchingStages.has(step.stage) : undefined}
                  onClick={() => selectStage(step.stage)}
                >
                  {getFulfillmentStageCopy(step).label}
                </Button>
              ))}
            </div>
          ) : (
            <FulfillmentChainCanvas
              role={role}
              matchingStages={filtered ? matchingStages : null}
              selectedStage={detailStep?.stage}
              selectedGuide={selection?.guide?.key}
              detailID={detailID}
              overviewRef={overviewRef}
              onSelectStage={selectStage}
              onOpenException={openException}
            />
          )}
        </>
      ) : null}
      {!showFinance && showDetail ? (
        <section
          className="erp-dev-fulfillment-guide__panel"
          aria-label="流程详情"
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
            {!scoped && !canReturn && showMain ? (
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
              <Button onClick={closeDetail}>
                清除并重新选择
              </Button>
            </div>
          ) : selection?.guide ? (
            <FulfillmentExceptionDetails
              key={selection.guide.key}
              selection={selection}
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
          {exceptionActions.length ? <ExceptionActionRelations
            key={`actions:${selection.guide.key}`}
            restoreOpen={restoredFrame?.search === searchParams.toString() && restoredFrame.focus === '查看动作规则'}
            onOpenRules={openActionRules}
            actions={exceptionActions}
            selectedKey={searchParams.get(queryKeys.relationAction)}
            onSelect={(key) => update((next) => next.set(queryKeys.relationAction, key))}
          /> : null}
          {!scoped && !selection?.invalid && relatedChain ? (
            <>
              <DevReadingLink
                to={devFlowExplorerChainURL(relatedChainKey)}
                fromLabel={selection ? '异常详情' : '订单全流程'}
              >
                在流程探索中查看链路
              </DevReadingLink>
              <ChainCapabilityLinks chainKey={relatedChainKey} fromLabel="业务链路" />
              <details className="erp-dev-disclosure">
                <summary>数据与验证</summary>
                <ChainEvidenceLinks chainKey={relatedChainKey} fromLabel="业务链路" />
              </details>
            </>
          ) : null}
        </section>
      ) : null}
      <p className="erp-dev-fulfillment-guide__boundary">
        流程示意，非实际进度；任务完成不代替正式业务结果。
      </p>
    </section>
  )
}
