import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Form, Grid, Input, Select, Space, Spin, Tag, Typography } from 'antd'
import { useLocation } from 'react-router-dom'
import useWorkflowTaskAssignmentAccess from '../../hooks/useWorkflowTaskAssignmentAccess.js'
import EngineeringMaterialTaskAction from '../sales-orders/EngineeringMaterialTaskAction.jsx'
import EngineeringMaterialTaskSummaryEntry from '../sales-orders/EngineeringMaterialTaskSummaryEntry.jsx'
import { canProcessEngineeringMaterialTask, ENGINEERING_MATERIAL_STATUS } from '../../utils/engineeringMaterialTask.mjs'
import useReturnedWorkflowTask from '../../hooks/useReturnedWorkflowTask.js'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import { getWorkflowTaskSourceTypeLabel, resolveWorkflowTaskEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { canOpenWorkflowTaskEntry } from '../../utils/workflowTaskEntryAccess.mjs'
import { workflowTaskEntryNavigation } from '../../utils/workflowTaskNavigation.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import Table from '@/common/components/table/AppTable.jsx'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { DateTimeInput, SelectionActionOverlayContext } from '../business-list/BusinessListLayout.jsx'
import WorkflowTaskActionDrawer, { getWorkflowTaskActionMeta } from './WorkflowTaskActionDrawer.jsx'
import WorkflowFollowupDetails from './WorkflowFollowupDetails.jsx'
import WorkflowSourceProgressButton from './WorkflowSourceProgressButton.jsx'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { useSourceOrderWorkflowActions } from './useSourceOrderWorkflowActions.mjs'
import { getWorkflowTaskCreateOptions, createWorkflowFollowupTask, listWorkflowTasks } from '../../api/workflowApi.mjs'
import { canCreateFollowupFromRecord, followupSource, businessTaskSource, requireFollowupTaskPage } from '../../utils/workflowFollowup.mjs'
import { hasActionPermission, formatUnixDate } from '../../utils/masterDataOrderView.mjs'
import { getWorkflowTaskOwnerRoleLabel, getWorkflowTaskStatusMeta, writeWorkflowTaskBoardFiltersToSearch } from '../../utils/workflowTaskBoard.mjs'
import { isWorkflowTaskMutationResultUnknown, workflowTaskMutationUUID } from '../../utils/workflowTaskMutation.mjs'
import { buildWorkflowDeadlineQuickOptions } from '../../utils/workflowTaskTiming.mjs'
import './businessTaskPanel.css'

const WORKFLOW_DEADLINE_QUICK_OPTIONS = buildWorkflowDeadlineQuickOptions()

export default function BusinessTaskActions({ sourceType, record, adminProfile, disabled = false, allowCreate = true, onCreated, panelOpen, onPanelClose, renderSourceContext, sourceLoading = false, sourceEmptyText = '请先选择来源单据' }) {
  const navigate = useBusinessNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const setActionOverlayOpen = useContext(SelectionActionOverlayContext)
  const compact = screens.sm === false
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('create')
  const [context, setContext] = useState(null)
  const [options, setOptions] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [receipt, setReceipt] = useState(null)
  const [task, setTask] = useState(null)
  const [actionMode, setActionMode] = useState('')
  const [assignmentTarget, setAssignmentTarget] = useState()
  const [materialSaving, setMaterialSaving] = useState(false)
  const materialLeaveGuardRef = useRef(null)
  const materialDraftRef = useRef(null)
  const [actionReason, setActionReason] = useState('')
  const [actionReceipt, setActionReceipt] = useState(null)
  const [actionSaving, setActionSaving] = useState(false)
  const busyRef = useRef(false)
  const attemptRef = useRef(null)
  const taskRequestRef = useRef(null)
  const roleKey = Form.useWatch('owner_role_key', form)
  const selectedRole = options?.roles.find((role) => role.role_key === roleKey)
  const canRead = hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_READ)
  const canCreate = allowCreate && Boolean(followupSource(sourceType, record)) && hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_CREATE)
  const source = businessTaskSource(sourceType, record)
  const recordID = source?.source_id
  const recordNo = record?.order_no || record?.purchase_order_no || record?.outsourcing_order_no || record?.shipment_no || record?.receipt_no || record?.inspection_no || record?.fact_no || record?.payment_no || record?.operation_no || record?.source_no || ''
  const sourceID = context?.source_id
  const contextType = context?.source_type
  const matchingSource = panelOpen === undefined || (sourceID === recordID && contextType === sourceType)
  const visibleTasks = matchingSource ? tasks : []
  const listLoading = loading || sourceLoading || !matchingSource
  const moreTasksRef = useRef(null)

  useEffect(() => {
    setActionOverlayOpen?.(open || Boolean(task) || pending)
    return () => setActionOverlayOpen?.(false)
  }, [open, task, pending, setActionOverlayOpen])

  useEffect(() => {
    setPage(1)
    setTasks([])
    setTotal(0)
  }, [compact])

  useEffect(() => {
    if (!open || view !== 'create' || !sourceID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setOptions(null)
    setError('')
    getWorkflowTaskCreateOptions({ source_type: contextType, source_id: sourceID }, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setOptions(value) })
      .catch((err) => { if (!controller.signal.aborted && !isRpcAbortError(err)) setError(getActionErrorMessage(err, '读取跟进任务资料')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, view, sourceID, contextType, revision])

  const loadTasks = useCallback(async () => {
    if (!sourceID) return
    taskRequestRef.current?.abort()
    const controller = new AbortController()
    taskRequestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const data = requireFollowupTaskPage(await listWorkflowTasks({ source_type: contextType, source_id: sourceID, limit: 10, offset: (page - 1) * 10 }, { signal: controller.signal }), { source_type: contextType, source_id: sourceID })
      if (controller.signal.aborted) return
      setTasks((current) => compact && page > 1
        ? [...new Map([...current, ...data.tasks].map((item) => [item.id, item])).values()]
        : data.tasks)
      setTotal(data.total)
    } catch (err) {
      if (!controller.signal.aborted && !isRpcAbortError(err)) {
        if (!compact || page === 1) { setTasks([]); setTotal(0) }
        setError(getActionErrorMessage(err, '读取相关任务'))
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [sourceID, contextType, page, compact])
  useEffect(() => {
    if (open && view === 'related') loadTasks()
    return () => taskRequestRef.current?.abort()
  }, [open, view, loadTasks])
  useEffect(() => {
    if (!compact || !open || view !== 'related' || loading || sourceLoading || error || !matchingSource || tasks.length >= total || !moreTasksRef.current) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { observer.disconnect(); setPage((value) => value + 1) }
    })
    observer.observe(moreTasksRef.current)
    return () => observer.disconnect()
  }, [compact, open, view, loading, sourceLoading, error, matchingSource, tasks.length, total])
  const handlers = useSourceOrderWorkflowActions({ loadWorkflowTasks: loadTasks, surfaceKey: 'business_record_tasks' })
  const access = useWorkflowTaskActionAccess({ adminProfile, task, enabled: Boolean(task) })
  const assignmentAccess = useWorkflowTaskAssignmentAccess({ adminProfile, task, enabled: Boolean(task) })
  const entryPath = resolveWorkflowTaskEntryPath(task)
  const canOpenEntry = canOpenWorkflowTaskEntry(adminProfile, entryPath, access.sourceAccess)
  const openEntry = () => {
    if (!canOpenEntry) return
    setTask(null)
    navigate(entryPath, workflowTaskEntryNavigation(task, entryPath, `${location.pathname}${location.search}`, adminProfile?.id, source))
  }
  const allowedModes = [...access.allowedModes.filter((mode) => ['complete', 'block', 'reject', 'resume', 'urge'].includes(mode)), ...(assignmentAccess.can_reassign ? ['assign'] : [])]
  const openTaskBoard = (item = null) => {
    const filters = { keyword: item?.task_code || context?.source_no, sourceType: contextType }
    navigate(`/erp/task-board?${writeWorkflowTaskBoardFiltersToSearch('', filters)}`)
  }
  const openTask = (item) => {
    setOpen(false)
    setTask(item)
    setActionMode('')
    setAssignmentTarget(undefined)
    setActionReason('')
    setActionReceipt(null)
  }

  useReturnedWorkflowTask(adminProfile?.id, openTask, source, Boolean(canRead && source))

  const openView = useCallback((nextView) => {
    if (nextView === 'create' && attemptRef.current) {
      setContext(attemptRef.current.context)
      setPending(true)
    } else {
      setContext({ source_type: sourceType, source_id: recordID, source_no: recordNo })
      if (nextView === 'create') {
        form.resetFields()
        setPending(false)
      }
    }
    setError('')
    setLoading(false)
    setOptions(null)
    setTasks([])
    setTotal(0)
    setPage(1)
    setReceipt(null)
    setView(nextView)
    setOpen(true)
  }, [sourceType, recordID, recordNo, form])
  useEffect(() => {
    if (panelOpen === undefined) return
    if (panelOpen) openView(attemptRef.current ? 'create' : 'related')
    else setOpen(false)
  }, [panelOpen, openView])
  const submit = async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (!attemptRef.current) {
        const values = await form.validateFields()
        const dueAt = Math.floor(new Date(values.deadline).getTime() / 1000)
        if (!Number.isFinite(dueAt) || dueAt <= Date.now() / 1000) {
          form.setFields([{ name: 'deadline', errors: ['截止时间须晚于当前时间'] }])
          return
        }
        attemptRef.current = {
          context,
          params: {
            source_type: contextType,
            source_id: sourceID,
            task_name: values.task_name.trim(),
            description: values.description.trim(),
            owner_role_key: values.owner_role_key,
            assignee_id: values.assignee_id === 'pool' ? null : values.assignee_id,
            due_at: dueAt,
            priority: values.priority || 0,
            idempotency_key: `followup:${workflowTaskMutationUUID()}`,
          },
        }
      }
      setSaving(true)
      setError('')
      const created = await createWorkflowFollowupTask(attemptRef.current.params)
      attemptRef.current = null
      setPending(false)
      setReceipt(created)
      setView('receipt')
      if (onCreated) Promise.resolve().then(() => onCreated(created)).catch(() => message.warning('跟进任务已创建，来源页面刷新失败，请重新读取'))
    } catch (err) {
      if (err?.errorFields) return
      const unknown = isWorkflowTaskMutationResultUnknown(err)
      setPending(unknown)
      if (!unknown) attemptRef.current = null
      setError(unknown ? '创建结果暂未确认，内容已保留。请使用原内容重试，系统会核对已有结果。' : getActionErrorMessage(err, '新建跟进任务'))
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }
  const leaveModal = (onLeave) => {
    if (saving) return
    if (view === 'create' && !pending && form.isFieldsTouched()) {
      modal.confirm({
        maskClosable: true,
        centered: true,
        title: '放弃未创建的跟进任务？',
        content: '当前填写的跟进任务尚未创建。',
        okText: '放弃填写',
        cancelText: '继续编辑',
        onOk: onLeave,
      })
    } else onLeave()
  }
  const closeModal = () => leaveModal(() => { setOpen(false); onPanelClose?.() })
  const returnToTasks = () => leaveModal(() => { setError(''); setView('related') })
  const closeTask = () => {
    if (actionSaving || materialSaving) return
    const close = () => {
      setTask(null); setActionReceipt(null); setActionMode(''); setActionReason('')
      if (compact) { setPage(1); setTasks([]); setTotal(0) }
      if (!context) openView('related')
      else { setView('related'); setOpen(true) }
    }
    if (materialLeaveGuardRef.current) materialLeaveGuardRef.current(close)
    else close()
  }
  const submitTask = async ({ processDecision = null } = {}) => {
    if (!task || actionSaving || !allowedModes.includes(actionMode)) return
    const meta = getWorkflowTaskActionMeta(task, actionMode)
    if (meta?.requireReason && !actionReason.trim()) return
    const actionHandlers = { assign: handlers.assignWorkflowTask, complete: handlers.completeWorkflowTask, block: handlers.blockWorkflowTask, reject: handlers.rejectWorkflowTask, resume: handlers.resumeWorkflowTask, urge: handlers.urgeSourceWorkflowTask }
    setActionSaving(true)
    try {
      const updated = await actionHandlers[actionMode](task, { reason: actionReason, processDecision, assignmentTarget })
      if (updated === false) return
      setTask(updated)
      setActionReceipt({ actionMode, actionTitle: meta.title, reason: actionReason, successMessage: meta.successMessage })
      onCreated?.(updated)
    } catch (err) {
      message.error(isWorkflowTaskMutationResultUnknown(err) ? '处理结果暂未确认，请保持原内容重试' : getActionErrorMessage(err, '处理任务'))
    } finally { setActionSaving(false) }
  }

  if (!canRead) return null
  const taskColumns = [
    { title: '任务事项', key: 'name', width: '40%', render: (_, item) => <Button type="link" className="business-task-panel__task-name" onClick={() => openTask(item)}>{getWorkflowTaskDisplayName(item)}</Button> },
    { title: '责任岗位', key: 'role', width: '18%', render: (_, item) => getWorkflowTaskOwnerRoleLabel(item) },
    { title: '状态', key: 'state', width: '18%', render: (_, item) => <Tag>{getWorkflowTaskStatusMeta(item).label}</Tag> },
    { title: '截止时间', dataIndex: 'due_at', width: '24%', render: (value) => value ? formatUnixDate(value) : '未设置' },
  ]
  const createAction = canCreate ? (
    <Button size="small" icon={<CalendarOutlined />} data-business-action-key="create-followup" disabled={disabled || sourceLoading || !matchingSource || (!pending && !canCreateFollowupFromRecord(sourceType, record))} title={!source ? '请先选择一张单据' : !canCreateFollowupFromRecord(sourceType, record) ? '当前单据已结束，可查看已有任务' : undefined} onClick={() => openView('create')}>{pending ? '确认创建结果' : '新建跟进任务'}</Button>
  ) : null
  return (
    <>
      {panelOpen === undefined ? <Button size="small" icon={<UnorderedListOutlined />} data-business-action-key="related-tasks" disabled={disabled || (!source && !pending)} title={!source && !pending ? '请先选择一张单据' : undefined} onClick={() => openView(pending ? 'create' : 'related')}>{pending ? '确认任务创建结果' : '相关任务'}</Button> : null}
      <BusinessFormModal
        open={open}
        forceRender
        title={view === 'related' ? '相关任务' : view === 'receipt' ? '跟进任务已创建' : '新建跟进任务'}
        className="business-task-panel"
        onCancel={closeModal}
        closable={!saving}
        keyboard={!saving}
        maskClosable={!saving}
        footer={
          <Space wrap>
            <Button disabled={saving} onClick={closeModal}>关闭</Button>
            {view === 'create' ? <Button disabled={saving} onClick={returnToTasks}>返回相关任务</Button> : null}
            {view === 'create' ? <Button type="primary" loading={saving} disabled={!pending && (loading || !options?.can_create)} onClick={submit}>{pending ? '重试并确认结果' : '新建跟进任务'}</Button> : null}
            {view === 'receipt' ? <Button type="primary" onClick={() => openView('related')}>查看相关任务</Button> : null}
            {view === 'related' ? <Button disabled={!sourceID || !matchingSource || sourceLoading} onClick={() => openTaskBoard()}>打开任务管理</Button> : null}
          </Space>
      }
      >
        <div className="business-task-panel__content">
          <div className="business-task-panel__context">
            {view === 'related' && renderSourceContext ? renderSourceContext() : (
              <div className="business-task-panel__source"><span>来源单据 · {getWorkflowTaskSourceTypeLabel(contextType)}</span><strong>{options?.source_no || context?.source_no}</strong></div>
            )}
          </div>
          {error && !(view === 'related' && compact && page > 1) ? <Alert type="error" showIcon message={error} action={!saving && !pending ? <Button size="small" onClick={() => view === 'related' ? loadTasks() : setRevision((value) => value + 1)}>重新读取</Button> : null} /> : null}
          <div hidden={view !== 'create'}>
            <Spin spinning={loading && view === 'create'}>
              {options && !options.can_create && !pending ? <Alert type="info" message={options.reason} /> : null}
              <Form form={form} layout="vertical" initialValues={{ assignee_id: 'pool', priority: 0 }} disabled={saving || pending || loading || !options?.can_create} className="erp-business-task-form">
                <Form.Item name="task_name" label="任务事项" className="erp-business-task-form__wide" rules={[{ required: true, whitespace: true, message: '请填写任务事项' }]}><Input maxLength={128} placeholder="例如：补充包装稿、确认交期变化" /></Form.Item>
                <Form.Item name="owner_role_key" label="责任岗位" rules={[{ required: true, message: '请选择责任岗位' }]}><Select placeholder="请选择责任岗位" options={(options?.roles || []).map((role) => ({ value: role.role_key, label: role.label }))} onChange={() => form.setFieldsValue({ assignee_id: 'pool' })} /></Form.Item>
                <Form.Item name="assignee_id" label="办理人"><Select options={[{ value: 'pool', label: '由岗位人员处理' }, ...(selectedRole?.assignees || []).map((person) => ({ value: person.admin_id, label: person.display_name }))]} /></Form.Item>
                <Form.Item name="deadline" label="截止时间" rules={[{ required: true, message: '请选择截止时间' }]}><DateTimeInput quickOptions={WORKFLOW_DEADLINE_QUICK_OPTIONS} quickOptionsLabel="快捷截止" showNow={false} /></Form.Item>
                <Form.Item name="priority" label="优先级"><Select options={[{ value: 0, label: '普通' }, { value: 10, label: '紧急' }]} /></Form.Item>
                <Form.Item name="description" label="需要对方完成什么" className="erp-business-task-form__wide" rules={[{ required: true, whitespace: true, message: '请写清任务要求和期望结果' }]}><Input.TextArea maxLength={2000} showCount autoSize={{ minRows: 3, maxRows: 7 }} /></Form.Item>
              </Form>
            </Spin>
          </div>
          {view === 'receipt' && receipt ? <><Typography.Paragraph>已发给{getWorkflowTaskOwnerRoleLabel(receipt)}，可在相关任务中查看进度和催办。</Typography.Paragraph><Typography.Title level={5}>{receipt.task_name}</Typography.Title><WorkflowFollowupDetails task={receipt} /></> : null}
          {view === 'related' ? (
            <Space wrap size={8} className="business-task-panel__toolbar" aria-label="当前单据任务操作">
              {createAction}
              <WorkflowSourceProgressButton sourceType={contextType} sourceID={sourceID} profile={adminProfile} disabled={disabled || sourceLoading || !matchingSource} />
            </Space>
          ) : null}
          {view === 'related' ? compact ? (
            <Spin spinning={listLoading}>
              <div className="business-task-panel__mobile-list" role="list" aria-label="相关任务">
                {visibleTasks.map((item) => (
                  <article role="listitem" key={item.id} className="business-task-panel__mobile-task">
                    <Button type="link" className="business-task-panel__task-name" onClick={() => openTask(item)}>{getWorkflowTaskDisplayName(item)}</Button>
                    <div><span>{getWorkflowTaskOwnerRoleLabel(item)}</span><Tag>{getWorkflowTaskStatusMeta(item).label}</Tag></div>
                    <small>截止时间：{item.due_at ? formatUnixDate(item.due_at) : '未设置'}</small>
                  </article>
                ))}
                {!visibleTasks.length && !listLoading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={sourceID ? '当前单据暂无可见任务' : sourceEmptyText} /> : null}
                {visibleTasks.length < total ? <div ref={moreTasksRef} className="business-task-panel__more" role="status">{error ? <><span>{error}</span><Button size="small" onClick={loadTasks}>重新读取</Button></> : '继续下滑加载任务'}</div> : null}
              </div>
            </Spin>
          ) : <Table size="small" rowKey="id" loading={listLoading} dataSource={visibleTasks} columns={taskColumns} pagination={{ current: page, pageSize: 10, total, hideOnSinglePage: true, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={sourceID ? '当前单据暂无可见任务' : sourceEmptyText} /> }} /> : null}
        </div>
      </BusinessFormModal>
      <WorkflowTaskActionDrawer
        onOpenRelatedTask={openTask}
        assignmentAccess={assignmentAccess}
        assignmentTarget={assignmentTarget}
        onAssignmentTargetChange={setAssignmentTarget}
        sourceSummary={<EngineeringMaterialTaskSummaryEntry key={task?.id} task={task} profile={adminProfile} />}
        renderSourceAction={task && !actionMode && canProcessEngineeringMaterialTask(adminProfile, task) ? (render) => <EngineeringMaterialTaskAction task={task} profile={adminProfile} render={render} leaveGuardRef={materialLeaveGuardRef} draftRef={materialDraftRef} onBusyChange={setMaterialSaving} onChanged={(value, result) => { setActionReceipt({ successMessage: result.successMessage, actionTitle: result.action === 'REJECT' ? '退回工程' : result.action === 'SUBMIT' ? '提交老板审核' : '审批通过', statusLabel: ENGINEERING_MATERIAL_STATUS[value.status], handoffMessage: result.successMessage }); loadTasks(); onCreated?.(value) }} /> : null}
        canOpenEntry={canOpenEntry}
        onOpenEntry={openEntry}
        task={task}
        profile={adminProfile}
        actionMode={actionMode}
        actionReason={actionReason}
        actionSaving={actionSaving || materialSaving}
        actionReceipt={actionReceipt}
        allowedActionModes={allowedModes}
        actionAvailabilityLoading={access.loading}
        readonlyReason={access.readonlyReason}
        onActionModeChange={setActionMode}
        onActionReasonChange={setActionReason}
        onClose={closeTask}
        onSubmit={submitTask}
        canViewAttachments={canRead}
        canManageAttachments={access.canHandle && hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_UPDATE)}
      />
    </>
  )
}

BusinessTaskActions.selectionActionRole = 'related'
BusinessTaskActions.selectionActionVisible = ({ adminProfile }) => hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_READ)
