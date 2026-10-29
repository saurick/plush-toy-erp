import React from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { TaskBusinessInformationContext } from '../../hooks/useBusinessPageContext.js'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import WorkflowFollowupDetails, { hasWorkflowFollowupDetails } from '../../components/workflow/WorkflowFollowupDetails.jsx'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import WorkflowTaskInfoCard from '../../components/workflow/WorkflowTaskInfoCard.jsx'
import { taskDeviceNotice, taskNeedsDesktop } from '../../utils/taskHandlingPolicy.mjs'
import WorkflowTaskCurrentSummary from '../../components/workflow/WorkflowTaskCurrentSummary.jsx'
import useWorkflowTaskAssignmentAccess from '../../hooks/useWorkflowTaskAssignmentAccess.js'
import { formatAdminIdentity } from '../../utils/adminIdentity.mjs'
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
import MobileTaskAttachments from './MobileTaskAttachments.jsx'
import ProductionRouteExecutionModal from '../../components/production-orders/ProductionRouteExecutionModal.jsx'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'
import WorkflowTaskHandlingChain from '../../components/workflow/WorkflowTaskHandlingChain.jsx'
import WorkflowTaskEventTrail from '../../components/workflow/WorkflowTaskEventTrail.jsx'
import { resolveMobileProductionArrangementContext } from '../utils/mobileProductionArrangement.mjs'
import EngineeringMaterialTaskSummaryEntry from '../../components/sales-orders/EngineeringMaterialTaskSummaryEntry.jsx'
import {
  canProcessEngineeringMaterialTask,
  canReadEngineeringMaterial,
  getEngineeringMaterialOrderContext,
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
  onOpenLinkedTask,
  processingComplete = false,
  onOpenAction,
  onOpenRecordedAction = null,
  onOpenTaskForm = null,
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
  const information = React.useContext(TaskBusinessInformationContext)
  const desktopHandling = taskNeedsDesktop(selectedTask)
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
    !desktopHandling && productionArrangementContext &&
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

  const assignmentAccess = useWorkflowTaskAssignmentAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask?.assignee_id && !selectedTask?.discovery?.assignee_name),
  })

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
  const assigneeLabel = selectedTask.assignee_id
    ? selectedTask.discovery?.assignee_name || (assignmentAccess.current_assignee ? formatAdminIdentity(assignmentAccess.current_assignee) : '已指定处理人')
    : '由岗位人员处理'
  const taskReason = resolveTaskReason(selectedTask)
  const taskReasonLabel = resolveTaskReasonLabel(selectedTask)
  const exceptionContact =
    getWorkflowTaskExceptionContactPresentation(selectedTask)
  const taskStatusLabel = processingComplete
    ? '本次已办理'
    : resolveMobileTaskStatusLabel(selectedTask)
  const completeCondition = selectedTask.complete_condition
  const canManageAttachments = selectedCanManageAttachments === true
  const canOpenBusiness = typeof onOpenTaskForm === 'function'
  const canOpenRecorded = typeof onOpenRecordedAction === 'function'
  const canOpenProcess = canOpenRecorded || canOpenBusiness || (materialContext
    ? canProcessMaterial || selectedCanUrge
    : selectedCanOperate || selectedCanUrge)
  const canViewReceipt = typeof onViewReceipt === 'function'
  const retryAccess =
    actionAccess?.failed && typeof actionAccess?.retry === 'function'
      ? actionAccess.retry
      : null
  const processUnavailableLabel = actionAccess?.loading
    ? '正在确认权限'
    : actionAccess?.failed
      ? '权限确认失败'
      : '当前仅供查看'
  const actionGuidance = canOpenProcess
    ? ''
    : actionAccess?.loading
      ? ''
      : actionAccess?.failed
        ? '暂时无法确认处理权限，请点击下方重试。'
        : !selectedCanOperate
          ? selectedCanUrge
            ? `这条任务由${ownerRoleLabel}办理，您可以查看并发起催办。`
            : actionAccess?.readonlyReason ||
              `这条任务由${ownerRoleLabel}办理，当前页面只供查看。`
          : ''
  const canReadMaterials = Boolean((materialContext || getEngineeringMaterialOrderContext(selectedTask)) && canReadEngineeringMaterial(adminProfile))
  const taskResources = canReadMaterials ? (
    <div className="mobile-detail-footer-resources">
      <EngineeringMaterialTaskSummaryEntry key={selectedTask.id} task={selectedTask} profile={adminProfile} mobile compact buttonText="材料汇总" />
    </div>
  ) : null
  const taskAttachments = <MobileTaskAttachments task={selectedTask} canManage={canManageAttachments} />

  return (
    <div
      className="mobile-role-tasks-page mobile-role-tasks-page--detail mobile-role-tasks-page--task-info mobile-task-screen md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      data-testid="mobile-task-detail-screen"
    >
      <MobileTaskFlowHeader
        backLabel={backLabel}
        canOpenProcess={canOpenProcess}
        canOpenReceipt={canViewReceipt}
        currentStep="detail"
        onBack={onBack}
        onOpenProcess={() =>
          canOpenRecorded ? onOpenRecordedAction() : canOpenBusiness ? onOpenTaskForm() : canProcessMaterial
            ? onOpenAction?.()
            : onOpenAction?.(
                selectedCanUrge && !selectedCanOperate ? 'urge' : undefined
              )
        }
        onOpenReceipt={onViewReceipt}
        processUnavailableLabel={processUnavailableLabel}
        title="任务详情"
        trailing={<WorkflowTaskCopySummary task={selectedTask} assigneeLabel={assigneeLabel} compact />}
      />

      <main className="mobile-role-tasks-page__detail-main mobile-detail-content">
        <WorkflowTaskInfoCard
          task={selectedTask}
          title={getWorkflowTaskDisplayName(selectedTask)}
          status={<span className={`mobile-task-flow-status ${selectedSeverity.badgeClass}`}>{taskStatusLabel}</span>}
          source={<div className="mobile-detail-source"><WorkflowTaskSource task={selectedTask} label={relatedSource} /></div>}
          assigneeLabel={assigneeLabel}
          events={taskEventsState === 'ready' ? taskEvents : []}
          summary={<WorkflowTaskCurrentSummary appearance="facts" task={selectedTask} roleLabel={ownerRoleLabel} assigneeLabel={assigneeLabel} events={taskEventsState === 'ready' ? taskEvents : []} processContext={processContextState === 'ready' ? processContext : null} reason={isTaskRisk(selectedTask) ? taskReason : ''} reasonLabel={taskReasonLabel} contact={exceptionContact} guidance={actionGuidance} />}
          businessInfo={factRows.length > 0 || completeCondition || hasWorkflowFollowupDetails(selectedTask) ? (
            <>
              <dl className="mobile-detail-facts">
                {factRows.map(([label, value]) => <div key={label} className="mobile-detail-fact"><dt>{label}</dt><dd>{mobileFactValueText(value)}</dd></div>)}
                {completeCondition ? <div className="mobile-detail-fact"><dt>完成条件</dt><dd>{completeCondition}</dd></div> : null}
              </dl>
              <WorkflowFollowupDetails task={selectedTask} />
            </>
          ) : null}
        />

        <div ref={information?.setHost} data-testid="workflow-task-business-information">{information?.retained}</div>
        <section className="workflow-task-info-card">
          <WorkflowTaskHandlingChain
            task={selectedTask}
            onOpenTask={onOpenLinkedTask}
            profile={adminProfile}
            processContext={processContext}
            processContextState={processContextState}
            onRetryProcess={() =>
              setProcessContextReloadKey((value) => value + 1)
            }
            variant="mobile"
            focused
          />
        </section>

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

        {taskDeviceNotice(selectedTask) ? <p>{taskDeviceNotice(selectedTask)}</p> : null}

        <WorkflowTaskEventTrail
          className="mobile-detail-section workflow-task-info-card workflow-task-info-card--records"
          approvalTask={approvalTask}
          errorMessage="本任务处理记录加载失败，请刷新后重试。"
          events={taskEvents}
          state={taskEventsState}
          task={selectedTask}
          truncated={taskEventsTruncated}
          variant="mobile"
          showResponsibility={false}
          compact
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
        <MobileBackToTop />
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

      <div className={`mobile-role-action-bar${canReadMaterials ? ' mobile-role-action-bar--with-resources' : ''}`}>
        {taskAttachments}
        {taskResources}
        {canOpenRecorded ? (
          <button type="button" className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white" onClick={onOpenRecordedAction}>查看办理资料</button>
        ) : canProcessMaterial ? (
          <button
            type="button"
            className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white"
            onClick={() => onOpenAction?.()}
          >
            {desktopHandling ? '查看办理资料' : '处理任务'}
          </button>
        ) : canOpenBusiness ? (
          <button type="button" className="mobile-detail-primary mobile-role-action-bar__button min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white" onClick={onOpenTaskForm}>
            {desktopHandling ? '查看办理资料' : '任务办理'}
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
            {selectedCanUrge && !selectedCanOperate ? '催办任务' : desktopHandling ? '查看办理资料' : '选择处理方式'}
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
    </div>
  )
}
