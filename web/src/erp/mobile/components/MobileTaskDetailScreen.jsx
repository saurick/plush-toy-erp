import React from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BranchesOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  getWorkflowTaskProcessContext,
  listWorkflowTaskEvents,
} from '../../api/workflowApi.mjs'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessStatusLabel,
} from '../../utils/processRuntimePresentation.mjs'
import {
  buildTaskFactRows,
  getMobileRoleLabel,
  isTaskRisk,
  resolveMobileTaskDueLabel,
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
import WorkflowProcessStageTrack from '../../components/workflow/WorkflowProcessStageTrack.jsx'
import WorkflowTaskEventTrail from '../../components/workflow/WorkflowTaskEventTrail.jsx'
import { resolveMobileProductionArrangementContext } from '../utils/mobileProductionArrangement.mjs'

function mobileFactValueText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim() === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' ? value : ''
}

export default function MobileTaskDetailScreen({
  actionAccess,
  onBack,
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
  const approvalTask = isWorkflowApprovalTask(selectedTask)
  const [taskEvents, setTaskEvents] = React.useState([])
  const [taskEventsTruncated, setTaskEventsTruncated] = React.useState(false)
  const [taskEventsState, setTaskEventsState] = React.useState('idle')
  const [processContext, setProcessContext] = React.useState(null)
  const [processContextState, setProcessContextState] = React.useState('idle')
  const [productionArrangementOpen, setProductionArrangementOpen] =
    React.useState(false)
  const productionArrangementContext = React.useMemo(
    () => resolveMobileProductionArrangementContext(selectedTask),
    [selectedTask]
  )
  const canReadProductionWip = hasActionPermission(
    adminProfile,
    'production.wip.read'
  )
  const canAssignProductionWip = hasActionPermission(
    adminProfile,
    'production.wip.assign'
  )
  const canReadOutsourcingContracts = hasActionPermission(
    adminProfile,
    'outsourcing.order.read'
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
  const taskReason = resolveTaskReason(selectedTask)
  const taskReasonLabel = resolveTaskReasonLabel(selectedTask)
  const exceptionContact =
    getWorkflowTaskExceptionContactPresentation(selectedTask)
  const exceptionContactHint = exceptionContact.text
  const taskStatusLabel = resolveMobileTaskStatusLabel(selectedTask)
  const resolvedDueLabel = resolveMobileTaskDueLabel(selectedTask)
  const taskDueLabel =
    resolvedDueLabel === '-' ? '未设置截止' : resolvedDueLabel
  const canManageAttachments = selectedCanManageAttachments === true
  const canOpenProcess = selectedCanOperate || selectedCanUrge
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
  const actionGuidance = actionAccess?.loading
    ? '正在确认当前账号的处理范围，请稍候。'
    : actionAccess?.failed
      ? '处理范围确认失败。可点击下方重新确认；系统不会在未确认权限时开放操作。'
      : !selectedCanOperate
        ? selectedCanUrge
          ? `这条任务由${ownerRoleLabel}办理，您可以查看并发起催办。`
          : actionAccess?.readonlyReason ||
            `这条任务由${ownerRoleLabel}办理，当前页面只供查看。`
        : ''

  return (
    <div
      className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      data-testid="mobile-task-detail-screen"
    >
      <MobileTaskFlowHeader
        canOpenProcess={canOpenProcess}
        canOpenReceipt={canViewReceipt}
        currentStep="detail"
        onBack={onBack}
        onOpenProcess={() =>
          onOpenAction?.(
            selectedCanUrge && !selectedCanOperate ? 'urge' : undefined
          )
        }
        onOpenReceipt={onViewReceipt}
        processUnavailableLabel={processUnavailableLabel}
        receiptUnavailableLabel="暂无可信回执"
        title="任务详情"
        trailing={
          <span
            className={`mobile-task-flow-status shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${selectedSeverity.badgeClass}`}
          >
            {selectedSeverity.label}
          </span>
        }
      />

      <main className="mobile-role-tasks-page__detail-main space-y-4 bg-slate-50 px-4 py-4">
        <section className="mobile-task-detail-hero erp-mobile-card rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="break-words text-2xl font-semibold leading-tight text-slate-950 [overflow-wrap:anywhere]">
            {selectedTask.task_name}
          </h2>
          <div className="mt-3 flex min-w-0 items-start gap-2 text-sm leading-6 text-slate-500">
            <FileTextOutlined className="mt-1 shrink-0" aria-hidden="true" />
            <span className="shrink-0">来源：</span>
            <span className="min-w-0 break-all">{relatedSource}</span>
          </div>
          <div
            className="mt-4 flex min-w-0 flex-wrap gap-2 text-sm"
            data-testid="mobile-task-detail-summary"
          >
            <span className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-700">
              {taskStatusLabel}
            </span>
            <span className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700">
              负责：{ownerRoleLabel}
            </span>
            <span className="min-w-0 break-words rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700">
              截止：{taskDueLabel}
            </span>
          </div>
          <div
            className="mt-4 border-t border-slate-200 pt-4"
            data-testid="mobile-task-attachment-action"
          >
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
                className: 'min-h-11 w-full justify-center',
                size: 'middle',
              }}
            />
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

        {factRows.length > 0 ? (
          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <FileTextOutlined className="text-blue-500" aria-hidden="true" />
              业务信息
            </h2>
            <div className="mobile-role-detail-fact-grid mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200">
              {factRows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`mobile-role-detail-fact-row p-4 ${
                    index === factRows.length - 1 && factRows.length % 2 === 1
                      ? 'col-span-2'
                      : ''
                  }`}
                >
                  <div className="text-sm text-slate-500">{label}</div>
                  <div className="mt-1 break-words text-base font-medium leading-6 text-slate-950">
                    {mobileFactValueText(value)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(isTaskRisk(selectedTask) && taskReason) || exceptionContactHint ? (
          <section
            className="mobile-role-detail-risk rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-700"
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
              <span className={`${taskReason ? 'mt-2 ' : ''}block font-normal`}>
                {exceptionContact.parts.map((part, index) =>
                  part.kind === 'role' ? (
                    <strong
                      className="mobile-task-exception-contact__role font-extrabold"
                      key={`${part.kind}-${part.text}-${index}`}
                    >
                      {part.text}
                    </strong>
                  ) : (
                    <React.Fragment key={`${part.kind}-${part.text}-${index}`}>
                      {part.text}
                    </React.Fragment>
                  )
                )}
              </span>
            ) : null}
          </section>
        ) : null}

        {selectedTask.complete_condition ? (
          <section className="erp-mobile-card rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="text-sm font-semibold text-blue-700">完成条件</div>
            <p className="mt-2 break-words text-base leading-7 text-slate-800">
              {selectedTask.complete_condition}
            </p>
          </section>
        ) : null}

        {canOpenProductionArrangement ? (
          <section
            className="erp-mobile-card rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"
            data-testid="mobile-production-arrangement-entry"
          >
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <BranchesOutlined className="text-blue-500" aria-hidden="true" />
              返工生产安排
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              为当前返工批次选择本厂生产或外发加工。保存安排后，再回到任务处理页记录本次处理结论。
            </p>
            <button
              type="button"
              className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
              onClick={() => setProductionArrangementOpen(true)}
            >
              安排本厂 / 外发
            </button>
          </section>
        ) : null}

        {selectedTask.process_instance_id ? (
          <section
            className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            data-testid="mobile-task-process-context"
          >
            <h2 className="text-xl font-semibold text-slate-950">业务轨迹</h2>
            {processContextState === 'loading' ? (
              <p className="mt-3 text-sm text-slate-500">正在读取业务轨迹</p>
            ) : processContextState === 'error' ? (
              <p className="mt-3 text-sm text-red-600">
                业务轨迹暂时无法确认，请刷新后重试。
              </p>
            ) : processContext ? (
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">业务流程</dt>
                    <dd className="font-semibold text-slate-900">
                      {getProcessLabel(processContext.process_instance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">流程发起</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatProcessStartedAt(
                        processContext.process_instance.started_at
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">流程状态</dt>
                    <dd className="font-semibold text-slate-900">
                      {getProcessStatusLabel(processContext.process_instance)}
                    </dd>
                  </div>
                </dl>
                <WorkflowProcessStageTrack
                  context={processContext}
                  variant="mobile"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        <WorkflowTaskEventTrail
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
          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <LinkOutlined className="text-purple-500" aria-hidden="true" />
              相关单据（{relatedDocuments.length}）
            </h2>
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
        <div className="mobile-role-action-bar border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          {canOpenProcess ? (
            <button
              type="button"
              className="mobile-role-action-bar__button mobile-role-action-bar__button--done min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white"
              onClick={() =>
                onOpenAction?.(
                  selectedCanUrge && !selectedCanOperate ? 'urge' : undefined
                )
              }
            >
              处理任务
              <RightOutlined className="ml-2" aria-hidden="true" />
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
              className="mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white"
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
