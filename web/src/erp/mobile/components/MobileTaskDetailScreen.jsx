import React from 'react'
import {
  BellOutlined,
  CameraOutlined,
  CaretRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  LeftOutlined,
  LinkOutlined,
  MoreOutlined,
  PauseOutlined,
} from '@ant-design/icons'
import { formatMobileTaskTime } from '../../utils/mobileTaskView.mjs'
import {
  QUICK_REASONS,
  buildTaskFactRows,
  getMobileRoleLabel,
  resolveDetailActionLabel,
  resolveTaskSourceLabel,
  supportsRejectedAction,
} from '../utils/mobileRoleTaskModel.mjs'

export default function MobileTaskDetailScreen({
  activeRoleKey,
  appendQuickReason,
  detailAction,
  detailEvidenceValue,
  detailReasonValue,
  handleTaskAction,
  roleLabel,
  savedEvidenceRefs,
  selectedCanOperate,
  selectedCanUrge,
  selectedSeverity,
  selectedTask,
  setDetailAction,
  setSelectedTaskID,
  submitDetailAction,
  updateDetailReason,
  updateEvidenceText,
  updatingID,
  urgingID,
}) {
  if (!selectedTask || !selectedSeverity) return null

  const factRows = buildTaskFactRows(selectedTask)
  const relatedSource = resolveTaskSourceLabel(selectedTask)
  const latestMobileAction = selectedTask.mobile_action
  const latestMobileActionRoleLabel = latestMobileAction
    ? getMobileRoleLabel(latestMobileAction.role_key || activeRoleKey)
    : roleLabel
  const showRejected = supportsRejectedAction(activeRoleKey, selectedTask)
  const isUpdating = updatingID === selectedTask.id
  const isUrging = urgingID === selectedTask.id

  return (
    <div className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
      <header className="mobile-role-detail-header shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-[112px_minmax(0,1fr)_92px] items-center gap-2 px-4 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-lg text-slate-950"
            onClick={() => {
              setSelectedTaskID(null)
              setDetailAction(null)
            }}
          >
            <LeftOutlined />
            <span>任务列表</span>
          </button>
          <h1 className="truncate text-center text-2xl font-semibold text-slate-950">
            {selectedTask.task_name}
          </h1>
          <div className="flex items-center justify-end gap-2">
            <span
              className={`rounded-full px-3 py-1 text-base font-semibold ${selectedSeverity.badgeClass}`}
            >
              {selectedSeverity.label}
            </span>
            <MoreOutlined className="text-xl text-slate-700" />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 px-5 pb-4 text-base text-slate-500">
          <FileTextOutlined />
          <span className="shrink-0">单号：</span>
          <span className="min-w-0 break-all">{relatedSource}</span>
        </div>
      </header>

      <main className="mobile-role-tasks-page__detail-main space-y-5 bg-slate-50 px-4 py-5">
        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <FileTextOutlined className="text-blue-500" />
              任务关键信息
            </h2>
            <button
              type="button"
              className="text-base font-semibold text-blue-600"
            >
              编辑查看详情 &gt;
            </button>
          </div>
          <div className="mobile-role-detail-fact-grid mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200">
            {factRows.slice(0, 6).map(([label, value]) => (
              <div
                key={label}
                className="min-h-[84px] border-b border-r border-slate-200 p-4 last:border-b-0"
              >
                <div className="text-base text-slate-500">{label}</div>
                <div className="mt-2 break-words text-lg font-medium text-slate-950">
                  {value || '-'}
                </div>
              </div>
            ))}
          </div>
        </section>

        {selectedTask.business_status_label || selectedTask.blocked_reason ? (
          <section className="mobile-role-detail-risk rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-lg font-semibold text-red-700">
            <ExclamationCircleFilled className="mr-2" />
            {selectedTask.business_status_label || '任务需要处理'}
            {selectedTask.blocked_reason
              ? ` · ${selectedTask.blocked_reason}`
              : ' · 需要确认后继续流转'}
          </section>
        ) : null}

        {selectedTask.mobile_exception_report ? (
          <section className="mobile-role-detail-exception rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-base text-orange-800">
            <div className="font-semibold">异常上报</div>
            <div className="mt-2 break-words">
              {selectedTask.mobile_exception_report.reason || '已记录异常'}
            </div>
          </section>
        ) : null}

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <LinkOutlined className="text-purple-500" />
              关联单据（1）
            </h2>
            <button
              type="button"
              className="text-base font-semibold text-blue-600"
            >
              查看全部 &gt;
            </button>
          </div>
          <div className="mobile-role-detail-related-item mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-600">
            <span className="min-w-0 break-all">订单：{relatedSource}</span>
            <span className="shrink-0 text-slate-400">&gt;</span>
          </div>
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <CameraOutlined className="text-emerald-500" />
              现场留痕
            </h2>
            <span className="text-sm font-semibold text-slate-400">可选</span>
          </div>
          <textarea
            data-testid="mobile-role-evidence-input"
            className="mt-4 min-h-[96px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="填写照片、附件编号或链接；多条可换行"
            maxLength={500}
            value={detailEvidenceValue}
            onChange={(event) => updateEvidenceText(event.target.value)}
          />
          <div className="mt-1 text-right text-sm text-slate-400">
            {detailEvidenceValue.length}/500
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
          ) : null}
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <ClockCircleOutlined className="text-orange-500" />
              最近动态
            </h2>
            <button
              type="button"
              className="text-base font-semibold text-blue-600"
            >
              查看全部 &gt;
            </button>
          </div>
          <div className="mobile-role-detail-event mt-4 rounded-xl bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-3 w-3 rounded-full bg-blue-500" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-950">
                  <span>系统</span>
                  <span className="rounded-md bg-blue-100 px-2 py-1 text-sm text-blue-700">
                    {selectedTask.task_status_label}
                  </span>
                  <span className="text-sm text-slate-400">
                    {formatMobileTaskTime(selectedTask.updated_at)}
                  </span>
                </div>
                <div className="mt-2 break-words text-base text-slate-700">
                  {latestMobileAction
                    ? `${latestMobileActionRoleLabel} 已执行 ${
                        latestMobileAction.action_key || '移动处理'
                      }${
                        latestMobileAction.reason
                          ? `：${latestMobileAction.reason}`
                          : ''
                      }`
                    : `任务已流转至 ${roleLabel} / ${
                        selectedTask.owner_role_key || '-'
                      }`}
                </div>
                {latestMobileAction?.evidence_refs?.length > 0 ? (
                  <div className="mt-2 break-words text-sm text-slate-500">
                    留痕：{latestMobileAction.evidence_refs.join(' / ')}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {detailAction ? (
          <section className="rounded-t-[28px] border border-slate-200 bg-white p-4 shadow-[0_-8px_28px_rgba(15,23,42,0.10)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-slate-950">
                {resolveDetailActionLabel(detailAction)}
                <span className="ml-2 text-red-500">·</span>
              </h2>
              <button
                type="button"
                className="text-base text-slate-500"
                onClick={() => setDetailAction(null)}
              >
                收起 ^
              </button>
            </div>
            <textarea
              className="mt-4 min-h-[128px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="请填写原因，至少 5 个字..."
              maxLength={500}
              value={detailReasonValue}
              onChange={(event) => updateDetailReason(event.target.value)}
            />
            <div className="mt-1 text-right text-sm text-slate-400">
              {detailReasonValue.length}/500
            </div>
            <div className="mt-4 text-base text-slate-500">
              快捷选择（可选）
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-600"
                  onClick={() => appendQuickReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-600"
                onClick={() => setDetailAction(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                disabled={isUpdating || isUrging}
                onClick={submitDetailAction}
              >
                提交
              </button>
            </div>
          </section>
        ) : null}
      </main>

      <div className="mobile-role-action-bar grid grid-cols-4 gap-3 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <button
          type="button"
          className="mobile-role-action-bar__button mobile-role-action-bar__button--processing rounded-xl bg-blue-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
          disabled={!selectedCanOperate || isUpdating}
          onClick={() => handleTaskAction(selectedTask, 'processing')}
        >
          <CaretRightOutlined className="mr-2" />
          处理
        </button>
        <button
          type="button"
          className="mobile-role-action-bar__button mobile-role-action-bar__button--blocked rounded-xl bg-orange-500 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
          disabled={!selectedCanOperate || isUpdating}
          onClick={() => handleTaskAction(selectedTask, 'blocked')}
        >
          <PauseOutlined className="mr-2" />
          阻塞
        </button>
        <button
          type="button"
          className="mobile-role-action-bar__button mobile-role-action-bar__button--done rounded-xl bg-emerald-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
          disabled={!selectedCanOperate || isUpdating}
          onClick={() => handleTaskAction(selectedTask, 'done')}
        >
          <CheckOutlined className="mr-2" />
          完成
        </button>
        <button
          type="button"
          className="mobile-role-action-bar__button mobile-role-action-bar__button--urge rounded-xl border border-slate-200 bg-white px-3 py-4 text-lg font-semibold text-slate-700 disabled:opacity-50"
          disabled={!selectedCanUrge || isUrging}
          onClick={() => handleTaskAction(selectedTask, 'urge')}
        >
          <BellOutlined className="mr-2" />
          催办
        </button>
        {showRejected ? (
          <button
            type="button"
            className="mobile-role-action-bar__button mobile-role-action-bar__button--rejected col-span-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-base font-semibold text-red-600 disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'rejected')}
          >
            退回当前任务
          </button>
        ) : null}
      </div>
    </div>
  )
}
