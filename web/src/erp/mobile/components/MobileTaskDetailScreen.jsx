import React from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ExclamationCircleFilled,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import WorkflowFollowupDetails from '../../components/workflow/WorkflowFollowupDetails.jsx'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import WorkflowTaskIdentity from '../../components/workflow/WorkflowTaskIdentity.jsx'
import WorkflowTaskProductImage from '../../components/workflow/WorkflowTaskProductImage.jsx'
import { getWorkflowTaskTiming } from '../../utils/workflowTaskTiming.mjs'
import {
  getWorkflowTaskIdentityPresentation,
  getWorkflowTaskIdentityCode,
} from '../../utils/workflowTaskIdentity.mjs'
import {
  WorkflowTaskCopySummary,
  WorkflowTaskSource,
} from '../../components/workflow/WorkflowTaskCopy.jsx'
import {
  getWorkflowTaskProcessContext,
  listWorkflowTaskEvents,
} from '../../api/workflowApi.mjs'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import {
  buildTaskFactRows,
  getMobileRoleLabel,
  isTaskRisk,
  resolveMobileTaskStatusLabel,
  resolveTaskReason,
  resolveTaskReasonLabel,
  resolveTaskSourceLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import { getWorkflowTaskExceptionContactPresentation } from '../../utils/workflowTaskProcessingHint.mjs'
import BusinessAttachmentModalButton from '../../components/business-list/BusinessAttachmentModalButton.jsx'
import ProductionRouteExecutionModal from '../../components/production-orders/ProductionRouteExecutionModal.jsx'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'
import WorkflowTaskHandlingChain from '../../components/workflow/WorkflowTaskHandlingChain.jsx'
import WorkflowTaskEventTrail from '../../components/workflow/WorkflowTaskEventTrail.jsx'
import { resolveMobileProductionArrangementContext } from '../utils/mobileProductionArrangement.mjs'
import EngineeringMaterialTaskSummaryEntry from '../../components/sales-orders/EngineeringMaterialTaskSummaryEntry.jsx'
import {
  canProcessEngineeringMaterialTask,
  getEngineeringMaterialTaskContext,
} from '../../utils/engineeringMaterialTask.mjs'

function mobileFactValueText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim() === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' ? value : ''
}

export default function MobileTaskDetailScreen({
  actionAccess,
  backLabel = '返回任务列表',
  onBack,
  processingComplete = false,
  onOpenAction,
  onViewReceipt,
  savedEvidenceRefs,
  selectedCanManageAttachments,
  selectedHasActionCapability = false,
  selectedCanOperate,
  selectedCanUrge,
  selectedSeverity,
  selectedTask,
}) {
  const { adminProfile } = useOutletContext() || {}
  const materialContext = React.useMemo(
    () => getEngineeringMaterialTaskContext(selectedTask),
    [selectedTask]
  )
  const canProcessMaterial =
    !processingComplete &&
    canProcessEngineeringMaterialTask(adminProfile, selectedTask)
  const approvalTask = isWorkflowApprovalTask(selectedTask)
  const [taskEvents, setTaskEvents] = React.useState([])
  const [taskEventsTruncated, setTaskEventsTruncated] = React.useState(false)
  const [taskEventsState, setTaskEventsState] = React.useState('idle')
  const [processContext, setProcessContext] = React.useState(null)
  const [processContextState, setProcessContextState] = React.useState('idle')
  const [processContextReloadKey, setProcessContextReloadKey] =
    React.useState(0)
  const [productionArrangementOpen, setProductionArrangementOpen] =
    React.useState(false)
  const productionArrangementContext = React.useMemo(
    () => resolveMobileProductionArrangementContext(selectedTask),
    [selectedTask]
  )
  const canReadProductionWip = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_WIP_READ
  )
  const canAssignProductionWip = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_WIP_ASSIGN
  )
  const canReadOutsourcingContracts = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_ORDER_READ
  )
  const canOpenProductionArrangement = Boolean(
    productionArrangementContext &&
    selectedCanOperate &&
    canReadProductionWip &&
    canAssignProductionWip
  )

  React.useEffect(() => {
    if (!canOpenProductionArrangement) {
      setProductionArrangementOpen(false)
    }
  }, [canOpenProductionArrangement, selectedTask?.id])

  React.useEffect(() => {
    if (!selectedTask?.id) {
      setTaskEvents([])
      setTaskEventsTruncated(false)
      setTaskEventsState('idle')
      return undefined
    }
    const controller = new AbortController()
    setTaskEvents([])
    setTaskEventsTruncated(false)
    setTaskEventsState('loading')
    listWorkflowTaskEvents(selectedTask.id, {
      limit: 100,
      signal: controller.signal,
    })
      .then(({ items, truncated }) => {
        if (controller.signal.aborted) return
        setTaskEvents(items)
        setTaskEventsTruncated(truncated)
        setTaskEventsState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setTaskEvents([])
        setTaskEventsTruncated(false)
        setTaskEventsState('error')
      })
    return () => controller.abort()
  }, [selectedTask?.id, selectedTask?.version])

  React.useEffect(() => {
    if (!selectedTask?.id || !selectedTask?.process_instance_id) {
      setProcessContext(null)
      setProcessContextState('idle')
      return undefined
    }
    const controller = new AbortController()
    setProcessContext(null)
    setProcessContextState('loading')
    getWorkflowTaskProcessContext(selectedTask.id, {
      signal: controller.signal,
    })
      .then((context) => {
        if (controller.signal.aborted) return
        setProcessContext(context)
        setProcessContextState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setProcessContext(null)
        setProcessContextState('error')
      })
    return () => controller.abort()
  }, [
    selectedTask?.id,
    selectedTask?.process_instance_id,
    selectedTask?.process_node_instance_id,
    selectedTask?.version,
    processContextReloadKey,
  ])

  if (!selectedTask || !selectedSeverity) return null

  const factRows = buildTaskFactRows(selectedTask)
  const relatedDocuments = Array.from(
    new Set(
      (Array.isArray(selectedTask.related_documents)
        ? selectedTask.related_documents
        : []
      )
        .map((document) => String(document || '').trim())
        .filter(Boolean)
    )
  )
  const relatedSource = resolveTaskSourceLabel(selectedTask)
  const ownerRoleLabel = getMobileRoleLabel(selectedTask.owner_role_key)
  const identity = getWorkflowTaskIdentityPresentation(selectedTask)
  const timingRows = getWorkflowTaskTiming(selectedTask, {
    detail: true,
    events: taskEventsState === 'ready' ? taskEvents : [],
  })
  const dueTiming = timingRows.find((row) => row.key === 'due')
  const businessTimingRows = timingRows.filter((row) => row.key !== 'due')
  const taskReason = resolveTaskReason(selectedTask)
  const taskReasonLabel = resolveTaskReasonLabel(selectedTask)
  const exceptionContact =
    getWorkflowTaskExceptionContactPresentation(selectedTask)
  const exceptionContactHint = exceptionContact.text
  const taskStatusLabel = processingComplete
    ? '本次已办理'
    : resolveMobileTaskStatusLabel(selectedTask)
  const completeCondition = materialContext
    ? '核对工程用料，在“处理任务”中提交本次处理结果。'
    : selectedTask.complete_condition
  const canManageAttachments = selectedCanManageAttachments === true
  const canOpenProcess = materialContext
    ? canProcessMaterial || selectedCanUrge
    : selectedCanOperate || selectedCanUrge
  const canViewReceipt = typeof onViewReceipt === 'function'
  const retryAccess =
    actionAccess?.failed && typeof actionAccess?.retry === 'function'
      ? actionAccess.retry
      : null
  const showFooterAction =
    canOpenProcess ||
    canViewReceipt ||
    Boolean(retryAccess) ||
    actionAccess?.loading ||
    selectedHasActionCapability
  const processUnavailableLabel = actionAccess?.loading
    ? '正在确认权限'
    : actionAccess?.failed
      ? '权限确认失败'
      : '当前仅供查看'
  const actionGuidance = canProcessMaterial
    ? ''
    : actionAccess?.loading
      ? '正在确认当前账号的处理范围，请稍候。'
      : actionAccess?.failed
        ? '暂时无法确认处理权限，请点击下方重试。'
        : !selectedCanOperate
          ? selectedCanUrge
            ? `这条任务由${ownerRoleLabel}办理，您可以查看并发起催办。`
            : actionAccess?.readonlyReason ||
              `这条任务由${ownerRoleLabel}办理，当前页面只供查看。`
          : ''

  return (
    <div
      className="mobile-role-tasks-page mobile-role-tasks-page--detail md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      data-testid="mobile-task-detail-screen"
    >
      <MobileTaskFlowHeader
        backLabel={backLabel}
        canOpenProcess={canOpenProcess}
        canOpenReceipt={canViewReceipt}
        currentStep="detail"
        onBack={onBack}
        onOpenProcess={() =>
          canProcessMaterial
            ? onOpenAction?.()
            : onOpenAction?.(
                selectedCanUrge && !selectedCanOperate ? 'urge' : undefined
              )
        }
        onOpenReceipt={onViewReceipt}
        processUnavailableLabel={processUnavailableLabel}
        receiptUnavailableLabel="暂无可信回执"
        title="任务信息"
        trailing={
          <span
            className={`mobile-task-flow-status shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${selectedSeverity.badgeClass}`}
          >
            {taskStatusLabel}
          </span>
        }
      />

      <main className="mobile-role-tasks-page__detail-main mobile-detail-content">
        <section className="mobile-task-detail-hero erp-mobile-card mobile-detail-section">
          <h2>{getWorkflowTaskDisplayName(selectedTask)}</h2>
          <div className="mobile-detail-identity">
            {identity.first?.imageAttachmentID ? (
              <WorkflowTaskProductImage item={identity.first} />
            ) : null}
            <span>
              <WorkflowTaskSource
                task={selectedTask}
                label={relatedSource}
                copyable={false}
              />
              {identity.first
                ? ` · ${identity.first.name || getWorkflowTaskIdentityCode(identity.first)}${identity.compactCountLabel ? ` · ${identity.compactCountLabel}` : ''}`
                : ''}
              {!identity.available ? ' · 关联单据已不可用' : ''}
            </span>
          </div>
          <dl
            className="mobile-detail-facts"
            data-testid="mobile-task-detail-summary"
          >
            <div className="mobile-detail-fact">
              <dt>负责岗位</dt>
              <dd>{ownerRoleLabel}</dd>
            </div>
            <div className="mobile-detail-fact" data-task-time="due">
              <dt>截止时间</dt>
              <dd data-tone={dueTiming?.tone}>
                {dueTiming?.dateTime ? (
                  <time dateTime={dueTiming.dateTime} title={dueTiming.title}>
                    {dueTiming.value}
                  </time>
                ) : (
                  dueTiming?.value
                )}
              </dd>
            </div>
          </dl>
          {(isTaskRisk(selectedTask) && taskReason) || exceptionContactHint ? (
            <section
              className="mobile-role-detail-risk mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
              data-testid="mobile-task-exception-contact"
              role="note"
            >
              {isTaskRisk(selectedTask) ? (
                <ExclamationCircleFilled className="mr-2" aria-hidden="true" />
              ) : null}
              {taskReason ? (
                <strong>
                  {taskReasonLabel}：{taskReason}
                </strong>
              ) : null}
              {exceptionContactHint ? (
                <span
                  className={`${taskReason ? 'mt-2 ' : ''}block font-normal`}
                >
                  {exceptionContact.parts.map((part, index) =>
                    part.kind === 'role' ? (
                      <strong
                        className="mobile-task-exception-contact__role font-extrabold"
                        key={`${part.kind}-${part.text}-${index}`}
                      >
                        {part.text}
                      </strong>
                    ) : (
                      <React.Fragment
                        key={`${part.kind}-${part.text}-${index}`}
                      >
                        {part.text}
                      </React.Fragment>
                    )
                  )}
                </span>
              ) : null}
            </section>
          ) : null}

          <div className="mobile-detail-inline-actions">
            <div data-testid="mobile-task-attachment-action">
              <BusinessAttachmentModalButton
                ownerType="workflow_task"
                ownerId={selectedTask.id}
                ownerVersion={selectedTask.version}
                buttonText="任务附件"
                modalTitle="任务附件"
                panelTitle="附件内容"
                description={
                  canManageAttachments
                    ? '上传照片、异常截图或处理凭证。'
                    : '查看照片、异常截图或处理凭证。'
                }
                canUpload={canManageAttachments}
                canWithdraw={canManageAttachments}
                disabled={!selectedTask}
                disabledReason="请先进入一条任务详情"
                showAttachmentCount
                buttonProps={{
                  className: 'mobile-detail-attachment-button',
                  size: 'middle',
                }}
              />
            </div>
            <WorkflowTaskCopySummary task={selectedTask} />
          </div>
        </section>

        {actionGuidance ? (
          <section
            className="mobile-role-action-guidance"
            data-testid="mobile-role-action-guidance"
            role="note"
          >
            {actionGuidance}
          </section>
        ) : null}

        {factRows.length > 0 ||
        completeCondition ||
        businessTimingRows.length > 0 ? (
          <section
            className="erp-mobile-card mobile-detail-section"
            aria-label="业务信息"
          >
            <h3>业务信息</h3>
            <dl className="mobile-detail-facts">
              {factRows.map(([label, value]) => (
                <div key={label} className="mobile-detail-fact">
                  <dt>{label}</dt>
                  <dd>{mobileFactValueText(value)}</dd>
                </div>
              ))}
              {completeCondition ? (
                <div className="mobile-detail-fact">
                  <dt>完成条件</dt>
                  <dd>{completeCondition}</dd>
                </div>
              ) : null}
              {businessTimingRows.map((row) => (
                <div
                  key={row.key}
                  className="mobile-detail-fact"
                  data-task-time={row.key}
                >
                  <dt>{row.label}</dt>
                  <dd>
                    {row.dateTime ? (
                      <time dateTime={row.dateTime} title={row.title}>
                        {row.value}
                      </time>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {identity.items.length > 0 || !identity.available ? (
              <details className="mobile-detail-associated">
                <summary>查看产品与来源</summary>
                <WorkflowTaskIdentity task={selectedTask} />
                <WorkflowTaskSource task={selectedTask} label={relatedSource} />
              </details>
            ) : null}
            <WorkflowFollowupDetails task={selectedTask} />
            <EngineeringMaterialTaskSummaryEntry
              key={selectedTask.id}
              task={selectedTask}
              profile={adminProfile}
              mobile
            />
          </section>
        ) : null}

        {canOpenProductionArrangement ? (
          <section
            className="erp-mobile-card mobile-detail-section"
            data-testid="mobile-production-arrangement-entry"
          >
            <h3>返工生产安排</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              为当前返工批次选择本厂生产或外发加工。保存安排后，再回到任务处理页记录本次处理结论。
            </p>
            <button
              type="button"
              className="mobile-detail-primary mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
              onClick={() => setProductionArrangementOpen(true)}
            >
              安排本厂 / 外发
            </button>
          </section>
        ) : null}

        <WorkflowTaskHandlingChain
          task={selectedTask}
          profile={adminProfile}
          processContext={processContext}
          processContextState={processContextState}
          onRetryProcess={() =>
            setProcessContextReloadKey((value) => value + 1)
          }
          variant="mobile"
        />

        <WorkflowTaskEventTrail
          className="mobile-detail-section"
          approvalTask={approvalTask}
          errorMessage="本任务处理记录加载失败，请刷新后重试。"
          events={taskEvents}
          state={taskEventsState}
          task={selectedTask}
          truncated={taskEventsTruncated}
          variant="mobile"
          showResponsibility={false}
        />

        {selectedTask.mobile_exception_report ? (
          <section className="mobile-role-detail-exception rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-base text-orange-800">
            <div className="font-semibold">异常上报</div>
            <div className="mt-2 break-words leading-6">
              {selectedTask.mobile_exception_report.reason || '已记录异常'}
            </div>
          </section>
        ) : null}

        {relatedDocuments.length > 0 ? (
          <section className="erp-mobile-card mobile-detail-section">
            <h3>相关单据（{relatedDocuments.length}）</h3>
            <div className="mt-4 space-y-2">
              {relatedDocuments.map((document, index) => (
                <div
                  key={`${document}-${index}`}
                  className="mobile-role-detail-related-item rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600"
                >
                  <span className="break-all">{document}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {savedEvidenceRefs.length > 0 ? (
          <section
            data-testid="mobile-role-historical-evidence"
            className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"
          >
            <h2 className="text-sm font-semibold text-slate-600">
              历史处理线索
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {savedEvidenceRefs.map((ref) => (
                <span
                  key={ref}
                  className="min-w-0 max-w-full break-all rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-600"
                >
                  {ref}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {productionArrangementContext ? (
        <ProductionRouteExecutionModal
          open={productionArrangementOpen}
          productionOrder={{
            id: productionArrangementContext.productionOrderID,
            order_no: productionArrangementContext.productionOrderNo,
          }}
          assignmentOnly
          originReworkFactID={productionArrangementContext.productionFactID}
          canAssign={canAssignProductionWip}
          canReadOutsourcingContracts={canReadOutsourcingContracts}
          onChanged={() => setProductionArrangementOpen(false)}
          onCancel={() => setProductionArrangementOpen(false)}
        />
      ) : null}

      {showFooterAction ? (
        <div className="mobile-role-action-bar">
          {canProcessMaterial ? (
            <button
              type="button"
              className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white"
              onClick={() => onOpenAction?.()}
            >
              处理任务
            </button>
          ) : canOpenProcess ? (
            <button
              type="button"
              className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white"
              onClick={() =>
                onOpenAction?.(
                  selectedCanUrge && !selectedCanOperate ? 'urge' : undefined
                )
              }
            >
              {selectedCanUrge && !selectedCanOperate ? '催办任务' : '处理任务'}
            </button>
          ) : canViewReceipt ? (
            <button
              type="button"
              className="mobile-role-action-bar__button min-h-12 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-base font-semibold text-blue-700"
              onClick={onViewReceipt}
            >
              查看结果回执
            </button>
          ) : retryAccess ? (
            <button
              type="button"
              className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
              onClick={retryAccess}
            >
              <ReloadOutlined className="mr-2" aria-hidden="true" />
              重新确认
            </button>
          ) : actionAccess?.loading ? (
            <button
              type="button"
              className="mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-slate-100 px-4 py-3 text-base font-semibold text-slate-500"
              disabled
            >
              <LoadingOutlined className="mr-2" spin aria-hidden="true" />
              正在确认
            </button>
          ) : selectedHasActionCapability ? (
            <button
              type="button"
              className="mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-slate-100 px-4 py-3 text-base font-semibold text-slate-500"
              disabled
            >
              {processUnavailableLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
