import React from 'react'
import {
  CameraOutlined,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { formatMobileTaskTime } from '../../utils/mobileTaskView.mjs'
import {
  buildTaskFactRows,
  getMobileRoleLabel,
  isTaskRisk,
  resolveMobileTaskCompletionFeedback,
  resolveMobileTaskStatusLabel,
  resolveTaskBusinessStatusLabel,
  resolveTaskReason,
  resolveTaskReasonLabel,
  resolveTaskRelatedSourceLabel,
  resolveTaskSourceLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import BusinessAttachmentModalButton from '../../components/business-list/BusinessAttachmentModalButton.jsx'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'

function mobileFactValueText(value) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string' && value.trim() === '') return '-'
  return value
}

export default function MobileTaskDetailScreen({
  actionAccess,
  onBack,
  onOpenAction,
  onViewReceipt,
  roleLabel,
  savedEvidenceRefs,
  selectedCanOperate,
  selectedCanUrge,
  selectedSeverity,
  selectedTask,
}) {
  if (!selectedTask || !selectedSeverity) return null

  const factRows = buildTaskFactRows(selectedTask)
  const relatedDocuments = Array.isArray(selectedTask.related_documents)
    ? selectedTask.related_documents
    : []
  const relatedSource = resolveTaskSourceLabel(selectedTask)
  const ownerRoleLabel = getMobileRoleLabel(selectedTask.owner_role_key)
  const taskReason = resolveTaskReason(selectedTask)
  const taskReasonLabel = resolveTaskReasonLabel(selectedTask)
  const taskStatusLabel = resolveMobileTaskStatusLabel(selectedTask)
  const completionFeedback = resolveMobileTaskCompletionFeedback(selectedTask)
  const taskBusinessStatusLabel = resolveTaskBusinessStatusLabel(
    selectedTask,
    ''
  )
  const canManageEvidence = selectedCanOperate
  const canOpenProcess = selectedCanOperate || selectedCanUrge
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
          <div className="text-sm font-semibold text-blue-600">当前任务</div>
          <h2 className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950 [overflow-wrap:anywhere]">
            {selectedTask.task_name}
          </h2>
          <div className="mt-3 flex min-w-0 items-start gap-2 text-sm leading-6 text-slate-500">
            <FileTextOutlined className="mt-1 shrink-0" aria-hidden="true" />
            <span className="shrink-0">来源：</span>
            <span className="min-w-0 break-all">{relatedSource}</span>
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

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <FileTextOutlined className="text-blue-500" aria-hidden="true" />
              任务关键信息
            </h2>
            <span className="mobile-role-detail-meta text-xs font-semibold text-slate-400">
              {roleLabel}
            </span>
          </div>
          <div className="mobile-role-detail-fact-grid mt-4 grid grid-cols-1 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-2">
            {factRows.map(([label, value]) => (
              <div key={label} className="mobile-role-detail-fact-row p-4">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="mt-1 break-words text-base font-medium leading-6 text-slate-950">
                  {mobileFactValueText(value)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {isTaskRisk(selectedTask) &&
        (taskBusinessStatusLabel || taskReason || selectedSeverity.label) ? (
          <section className="mobile-role-detail-risk rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-base font-semibold leading-6 text-red-700">
            <ExclamationCircleFilled className="mr-2" aria-hidden="true" />
            {taskBusinessStatusLabel || selectedSeverity.label}
            {taskReason
              ? ` · ${taskReasonLabel}：${taskReason}`
              : ' · 请优先核对并处理'}
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

        {completionFeedback ? (
          <section className="erp-mobile-card rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="text-sm font-semibold text-emerald-700">
              完成反馈
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-800 [overflow-wrap:anywhere]">
              {completionFeedback}
            </p>
          </section>
        ) : null}

        {selectedTask.mobile_exception_report ? (
          <section className="mobile-role-detail-exception rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-base text-orange-800">
            <div className="font-semibold">异常上报</div>
            <div className="mt-2 break-words leading-6">
              {selectedTask.mobile_exception_report.reason || '已记录异常'}
            </div>
          </section>
        ) : null}

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <LinkOutlined className="text-purple-500" aria-hidden="true" />
              关联来源（{relatedDocuments.length + 1}）
            </h2>
          </div>
          <div className="mt-4 space-y-2">
            {[
              resolveTaskRelatedSourceLabel(selectedTask),
              ...relatedDocuments,
            ].map((document, index) => (
              <div
                key={`${document}-${index}`}
                className="mobile-role-detail-related-item rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600"
              >
                <span className="break-all">{document}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <CameraOutlined className="text-emerald-500" aria-hidden="true" />
              现场证据
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              {canManageEvidence ? '可补充' : '只读'}
            </span>
          </div>
          {savedEvidenceRefs.length > 0 ? (
            <div
              data-testid="mobile-role-saved-evidence"
              className="mt-3 flex flex-wrap gap-2"
            >
              {savedEvidenceRefs.map((ref) => (
                <span
                  key={ref}
                  className="min-w-0 max-w-full break-all rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700"
                >
                  {ref}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-500">
              当前任务尚无可显示的处理证据。
            </p>
          )}
          <div className="mt-4">
            <BusinessAttachmentModalButton
              ownerType="workflow_task"
              ownerId={selectedTask.id}
              ownerVersion={selectedTask.version}
              buttonText={canManageEvidence ? '管理现场附件' : '查看现场附件'}
              modalTitle="现场附件"
              panelTitle="现场附件"
              description="现场照片、异常截图和处理凭证只用于记录任务办理情况，不会改变库存、质检、出货、开票或收付款结果。"
              canUpload={canManageEvidence}
              canDelete={false}
              disabled={!selectedTask}
              disabledReason="请先进入一条任务详情"
              buttonProps={{
                className: 'w-full min-h-11 justify-center',
                size: 'large',
              }}
            />
          </div>
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <ClockCircleOutlined
                className="text-orange-500"
                aria-hidden="true"
              />
              当前办理状态
            </h2>
            <span className="mobile-role-detail-meta text-xs font-semibold text-slate-400">
              {formatMobileTaskTime(selectedTask.updated_at)}
            </span>
          </div>
          <div className="mobile-role-detail-event mt-4 rounded-xl bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                  <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-700">
                    {taskStatusLabel}
                  </span>
                  {taskBusinessStatusLabel ? (
                    <span className="text-slate-500">
                      {taskBusinessStatusLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-slate-700">
                  {taskReason
                    ? `${taskReasonLabel}：${taskReason}`
                    : `任务当前由${ownerRoleLabel}负责。`}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div
        className={`mobile-role-action-bar grid border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur ${
          canOpenProcess ||
          canViewReceipt ||
          retryAccess ||
          actionAccess?.loading
            ? 'grid-cols-2 gap-3'
            : ''
        }`}
      >
        <button
          type="button"
          className="mobile-role-action-bar__button min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700"
          onClick={onBack}
        >
          返回列表
        </button>
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
        ) : null}
      </div>
    </div>
  )
}
