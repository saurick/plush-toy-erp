import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  RedoOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Input, Modal, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  listWorkflowTasks,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import { getRoleDisplayName } from '../utils/roleKeys.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../utils/workflowTaskActionSubmitGuard.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../utils/workflowTaskMutation.mjs'
import { formatWorkflowTaskSource } from '../utils/dashboardTaskDisplay.mjs'
import { isTerminalWorkflowTask } from '../utils/workflowTaskLifecycle.mjs'
import {
  getTaskOwnerRoleKey,
  getWorkflowTaskCodeLabel,
  getWorkflowTaskDueLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
} from '../utils/workflowTaskBoard.mjs'

function businessActionModalTitle(title, description) {
  return (
    <div className="erp-business-action-modal__title">
      <span>{title}</span>
      <small>{description}</small>
    </div>
  )
}

function workflowRoleOption(value) {
  return { label: getRoleDisplayName(value, '责任岗位'), value }
}

const TASK_STATUS_OPTIONS = Object.freeze([
  { label: '全部状态', value: '' },
  { label: '可执行', value: 'ready' },
  { label: '阻塞', value: 'blocked' },
  { label: '退回', value: 'rejected' },
  { label: '已完成', value: 'done' },
])
const DUE_DATE_FILTER_OPTIONS = Object.freeze([
  { label: '到期日期', value: 'due_at' },
])

const MODULE_WORKFLOW_CONFIG = Object.freeze({
  'production-scheduling': {
    taskGroup: 'production_scheduling',
    completionMessage:
      '排程协同任务已完成，领料、完工和入库仍需到对应业务页面办理。',
    emptyText: '暂无生产排程协同任务。',
    ownerRoleOptions: [
      workflowRoleOption('pmc'),
      workflowRoleOption('production'),
      workflowRoleOption('warehouse'),
    ],
    payloadScope: 'production_scheduling_workflow_only',
  },
  'production-exceptions': {
    taskGroup: 'production_exception',
    completionMessage:
      '异常协同任务已完成，返工、报废或库存调整仍需到对应业务页面办理。',
    emptyText: '暂无生产异常协同任务。',
    ownerRoleOptions: [
      workflowRoleOption('production'),
      workflowRoleOption('pmc'),
      workflowRoleOption('quality'),
      workflowRoleOption('warehouse'),
    ],
    payloadScope: 'production_exception_workflow_only',
  },
  'shipping-release': {
    taskGroup: 'shipment_release',
    completionMessage:
      '出货放行协同任务已完成，真实出货仍需出货单进入 SHIPPED。',
    emptyText: '暂无出货放行协同任务。',
    ownerRoleOptions: [
      workflowRoleOption('warehouse'),
      workflowRoleOption('sales'),
      workflowRoleOption('quality'),
      workflowRoleOption('finance'),
    ],
    payloadScope: 'shipment_release_workflow_only',
  },
})

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function toUnixSeconds(value) {
  if (!value) return undefined
  const parsed = dayjs(String(value).trim())
  return parsed.isValid() ? parsed.endOf('day').unix() : undefined
}

function toUnixStartSeconds(value) {
  if (!value) return undefined
  const parsed = dayjs(String(value).trim())
  return parsed.isValid() ? parsed.startOf('day').unix() : undefined
}

function getTaskID(task = {}) {
  return Number(task.id || 0)
}

export default function WorkflowBusinessModulePage({ moduleKey }) {
  const mutationAttemptsRef = useRef(null)
  mutationAttemptsRef.current ||= createTaskMutationAttemptStore()
  const mutationInFlightRef = useRef(null)
  mutationInFlightRef.current ||= createTaskMutationInFlightGuard()
  const runMutationInFlight = useCallback(async (scope, run) => {
    const lease = mutationInFlightRef.current.acquire(scope)
    if (!lease) return false
    try {
      return await run()
    } finally {
      mutationInFlightRef.current.release(lease)
    }
  }, [])
  const moduleItem = getBusinessModule(moduleKey)
  const config = MODULE_WORKFLOW_CONFIG[moduleKey]
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [taskReasonModal, setTaskReasonModal] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [ownerRoleKey, setOwnerRoleKey] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [selectedTaskKeys, setSelectedTaskKeys] = useState([])
  const [taskActionLoadingID, setTaskActionLoadingID] = useState(0)
  const [urgingTaskID, setUrgingTaskID] = useState(0)
  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )
  const canUpdateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.update'
  )
  const canCompleteWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.complete'
  )

  const loadWorkflowTasks = useCallback(async () => {
    if (!config || !canReadWorkflowTasks) {
      setTasks([])
      return false
    }
    setLoading(true)
    try {
      const data = await listWorkflowTasks({
        task_group: config.taskGroup,
        limit: 200,
      })
      const nextTasks = (data?.tasks || []).filter(
        (task) => task.task_group === config.taskGroup
      )
      setTasks(nextTasks)
      setSelectedTaskKeys((current) =>
        current.filter((key) => nextTasks.some((task) => task.id === key))
      )
      return true
    } catch (error) {
      setTasks([])
      message.error(
        getActionErrorMessage(
          error,
          `加载${moduleItem?.title || '协同'}协同任务失败`
        )
      )
      return false
    } finally {
      setLoading(false)
    }
  }, [canReadWorkflowTasks, config, moduleItem?.title])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  useEffect(() => {
    if (!moduleItem) return undefined
    return outletContext?.registerPageRefresh?.(async () => {
      const refreshed = await loadWorkflowTasks()
      if (refreshed) {
        message.success(`${moduleItem.title}协同任务已刷新`)
      }
      return false
    })
  }, [loadWorkflowTasks, moduleItem, outletContext])

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = normalizeText(keyword)
    const dueFromUnix = toUnixStartSeconds(dueFrom)
    const dueToUnix = toUnixSeconds(dueTo)
    return tasks.filter((task) => {
      if (status && task.task_status_key !== status) return false
      if (ownerRoleKey && getTaskOwnerRoleKey(task) !== ownerRoleKey) {
        return false
      }
      const dueAt = Number(task.due_at || 0)
      if (dueFromUnix && (!dueAt || dueAt < dueFromUnix)) return false
      if (dueToUnix && (!dueAt || dueAt > dueToUnix)) return false
      if (!normalizedKeyword) return true
      return [
        task.task_code,
        task.task_name,
        task.source_no,
        task.business_status_key,
        getWorkflowTaskReason(task),
      ].some((item) => normalizeText(item).includes(normalizedKeyword))
    })
  }, [dueFrom, dueTo, keyword, ownerRoleKey, status, tasks])

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskKeys.includes(task.id)),
    [selectedTaskKeys, tasks]
  )
  const selectedTask = selectedTasks[0] || null

  const stats = useMemo(() => {
    const activeCount = tasks.filter(
      (task) => !isTerminalWorkflowTask(task)
    ).length
    const blockedCount = tasks.filter((task) =>
      ['blocked', 'rejected'].includes(task.task_status_key)
    ).length
    return [
      { key: 'total', label: '协同任务', value: tasks.length },
      { key: 'active', label: '待处理', value: activeCount },
      { key: 'blocked', label: '阻塞 / 退回', value: blockedCount },
      { key: 'shown', label: '当前结果', value: filteredTasks.length },
    ]
  }, [filteredTasks.length, tasks])

  const selectedTaskLabel = selectedTask
    ? `${getWorkflowTaskCodeLabel(selectedTask)} / ${
        selectedTask.task_name || '未填写任务名称'
      }`
    : `请先选择一条${moduleItem?.shortLabel || ''}协同任务`
  const selectedTaskItems = selectedTask
    ? [
        {
          key: selectedTask.id,
          label: selectedTask.task_name || selectedTask.task_code,
          title: selectedTask.task_code || '',
        },
      ]
    : []
  const selectedTaskStatusMeta = selectedTask
    ? getWorkflowTaskStatusMeta(selectedTask)
    : null
  const selectedTaskActionAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask && canReadWorkflowTasks),
  })
  const selectedTaskReadonlyReason = selectedTaskActionAccess.loading
    ? '正在确认您是否可以处理当前任务。'
    : selectedTaskActionAccess.readonlyReason
  const canCompleteSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('complete')
  const canBlockSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('block')
  const canRejectSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('reject')
  const canResumeSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('resume')
  const canUrgeSelected =
    Boolean(selectedTask) && selectedTaskActionAccess.canRun('urge')

  const verifyMutationAccess = useCallback(
    ({ task, actionKey, reason = '', scope, operation, params }) =>
      verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttemptsRef.current,
        scope,
        operation,
        params,
        verify: () =>
          verifyWorkflowTaskActionAccessBeforeSubmit({
            task,
            actionKey,
            reason,
            onWarning: message.warning,
            onError: message.error,
          }),
      }),
    []
  )

  const completeWorkflowTask = useCallback(
    async (task) => {
      const scope = `${task.id}:complete`
      const operation = 'complete'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason: '',
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          scope,
          operation,
          params,
        })
        if (!accessVerified) return false
        setTaskActionLoadingID(getTaskID(task))
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate: completeWorkflowTaskAction,
            params,
          })
          message.success(config.completionMessage)
          try {
            await loadWorkflowTasks()
          } catch {
            message.warning('操作已成功但列表刷新失败，请手动刷新')
          }
          return true
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(getActionErrorMessage(error, '完成协同任务失败'))
            await loadWorkflowTasks().catch(() => {})
          }
          return false
        } finally {
          setTaskActionLoadingID(0)
        }
      })
    },
    [
      config,
      loadWorkflowTasks,
      moduleItem?.path,
      runMutationInFlight,
      verifyMutationAccess,
    ]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:block`
      const operation = 'block'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          reason,
          scope,
          operation,
          params,
        })
        if (!accessVerified) return false
        setTaskActionLoadingID(getTaskID(task))
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate: blockWorkflowTaskAction,
            params,
          })
          message.success('阻塞原因已记录')
          try {
            await loadWorkflowTasks()
          } catch {
            message.warning('操作已成功但列表刷新失败，请手动刷新')
          }
          return true
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(getActionErrorMessage(error, '标记阻塞失败'))
            await loadWorkflowTasks().catch(() => {})
          }
          return false
        } finally {
          setTaskActionLoadingID(0)
        }
      })
    },
    [
      loadWorkflowTasks,
      moduleItem?.path,
      runMutationInFlight,
      verifyMutationAccess,
    ]
  )

  const rejectWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:reject`
      const operation = 'reject'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          reason,
          scope,
          operation,
          params,
        })
        if (!accessVerified) return false
        setTaskActionLoadingID(getTaskID(task))
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate: rejectWorkflowTaskAction,
            params,
          })
          message.success('退回原因已记录')
          try {
            await loadWorkflowTasks()
          } catch {
            message.warning('操作已成功但列表刷新失败，请手动刷新')
          }
          return true
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(getActionErrorMessage(error, '退回协同任务失败'))
            await loadWorkflowTasks().catch(() => {})
          }
          return false
        } finally {
          setTaskActionLoadingID(0)
        }
      })
    },
    [
      loadWorkflowTasks,
      moduleItem?.path,
      runMutationInFlight,
      verifyMutationAccess,
    ]
  )

  const resumeWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:resume`
      const operation = 'resume'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          reason,
          scope,
          operation,
          params,
        })
        if (!accessVerified) return false
        setTaskActionLoadingID(getTaskID(task))
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate: resumeWorkflowTaskAction,
            params,
          })
          message.success('任务已解除阻塞')
          try {
            await loadWorkflowTasks()
          } catch {
            message.warning('操作已成功但列表刷新失败，请手动刷新')
          }
          return true
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(getActionErrorMessage(error, '解除任务阻塞失败'))
            await loadWorkflowTasks().catch(() => {})
          }
          return false
        } finally {
          setTaskActionLoadingID(0)
        }
      })
    },
    [
      loadWorkflowTasks,
      moduleItem?.path,
      runMutationInFlight,
      verifyMutationAccess,
    ]
  )

  const urgeWorkflowTaskFromPage = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:urge`
      const operation = 'urge'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action: 'urge_task',
        reason,
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          reason,
          scope,
          operation,
          params,
        })
        if (!accessVerified) return false
        setUrgingTaskID(getTaskID(task))
        try {
          await mutationAttemptsRef.current.run({
            scope,
            operation,
            mutate: urgeWorkflowTask,
            params,
          })
          message.success('催办已记录')
          try {
            await loadWorkflowTasks()
          } catch {
            message.warning('操作已成功但列表刷新失败，请手动刷新')
          }
          return true
        } catch (error) {
          if (isWorkflowTaskMutationResultUnknown(error)) {
            message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
          } else {
            message.error(getActionErrorMessage(error, '催办协同任务失败'))
            await loadWorkflowTasks().catch(() => {})
          }
          return false
        } finally {
          setUrgingTaskID(0)
        }
      })
    },
    [
      loadWorkflowTasks,
      moduleItem?.path,
      runMutationInFlight,
      verifyMutationAccess,
    ]
  )

  const openTaskReasonModal = useCallback((mode) => {
    setTaskReasonModal({ mode, reason: '' })
  }, [])

  const closeTaskReasonModal = useCallback(() => {
    setTaskReasonModal(null)
  }, [])

  const submitTaskReasonAction = useCallback(async () => {
    if (!selectedTask || !taskReasonModal?.mode) return
    const reason = String(taskReasonModal.reason || '').trim()
    if (!reason) {
      message.warning('请先填写原因')
      return
    }
    let succeeded = false
    if (taskReasonModal.mode === 'block') {
      succeeded = await blockWorkflowTask(selectedTask, { reason })
    } else if (taskReasonModal.mode === 'reject') {
      succeeded = await rejectWorkflowTask(selectedTask, { reason })
    } else if (taskReasonModal.mode === 'resume') {
      succeeded = await resumeWorkflowTask(selectedTask, { reason })
    } else if (taskReasonModal.mode === 'urge') {
      succeeded = await urgeWorkflowTaskFromPage(selectedTask, { reason })
    }
    if (succeeded) closeTaskReasonModal()
  }, [
    blockWorkflowTask,
    closeTaskReasonModal,
    rejectWorkflowTask,
    resumeWorkflowTask,
    selectedTask,
    taskReasonModal,
    urgeWorkflowTaskFromPage,
  ])

  const columns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '任务编号',
          exportTitle: '任务编号',
          dataIndex: 'task_code',
          key: 'task_code',
          width: 190,
          fixed: 'left',
          render: (value, record) => (
            <Space direction="vertical" size={2}>
              <strong>{value || getWorkflowTaskCodeLabel(record)}</strong>
              <span>{record.task_name}</span>
            </Space>
          ),
          exportValue: getWorkflowTaskCodeLabel,
        },
        {
          title: '来源',
          exportTitle: '来源',
          dataIndex: 'source_no',
          key: 'source_no',
          width: 170,
          render: (_, record) => formatWorkflowTaskSource(record),
          exportValue: formatWorkflowTaskSource,
        },
        {
          title: '状态',
          exportTitle: '状态',
          key: 'task_status',
          width: 120,
          render: (_, record) => {
            const statusMeta = getWorkflowTaskStatusMeta(record)
            return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          },
          exportValue: (record) => getWorkflowTaskStatusMeta(record).label,
        },
        {
          title: '责任角色',
          exportTitle: '责任角色',
          key: 'owner_role',
          width: 120,
          render: (_, record) => getWorkflowTaskOwnerRoleLabel(record),
          exportValue: (record) => getWorkflowTaskOwnerRoleLabel(record),
        },
        {
          title: '到期',
          exportTitle: '到期',
          dataIndex: 'due_at',
          key: 'due_at',
          width: 140,
          render: (_, record) => getWorkflowTaskDueLabel(record),
          exportValue: getWorkflowTaskDueLabel,
        },
        {
          title: '原因 / 备注',
          exportTitle: '原因 / 备注',
          dataIndex: 'blocked_reason',
          key: 'reason',
          width: 340,
          render: (_, record) =>
            getWorkflowTaskReason(record) || '按当前协同任务要求处理',
          exportValue: (record) => getWorkflowTaskReason(record),
        },
      ]),
    []
  )
  const { tableColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey,
      moduleTitle: moduleItem?.title || '模块未登记',
      columns,
    })
  const hasActiveFilters = Boolean(
    keyword.trim() || status || ownerRoleKey || dueFrom || dueTo
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatus('')
    setOwnerRoleKey('')
    setDueFrom('')
    setDueTo('')
  }, [])

  if (!moduleItem || !config) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="模块未登记"
          description="当前页面暂不可用，请返回工作台或联系管理员。"
          tags={<Tag color="red">未登记</Tag>}
        />
      </BusinessPageLayout>
    )
  }

  return (
    <BusinessPageLayout className="erp-workflow-business-page">
      <PageHeaderCard
        title={moduleItem.title}
        description={moduleItem.description}
        tags={
          <Space size={6} wrap>
            <Tag color="blue">协同任务</Tag>
            <Tag color="gold">业务处理分开完成</Tag>
          </Space>
        }
        stats={stats}
        compact
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              aria-label="搜索协同任务"
              placeholder="搜索任务"
              searchHint="可搜索：任务、来源号、原因"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <SelectFilter
              aria-label="任务状态"
              value={status}
              options={TASK_STATUS_OPTIONS}
              onChange={setStatus}
            />
            <SelectFilter
              aria-label="责任角色"
              value={ownerRoleKey}
              options={[
                { label: '全部角色', value: '' },
                ...config.ownerRoleOptions,
              ]}
              onChange={setOwnerRoleKey}
            />
            <DateRangeFilter
              options={DUE_DATE_FILTER_OPTIONS}
              value="due_at"
              startValue={dueFrom}
              endValue={dueTo}
              onStartChange={setDueFrom}
              onEndChange={setDueTo}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle={moduleItem.title}
            exportDisabled
            exportDisabledReason="当前页面只处理协同任务，暂不提供业务数据导出。"
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedTask ? 1 : 0}
          selectedLabel={selectedTaskLabel}
          selectedItems={selectedTaskItems}
          collaborationItems={
            selectedTaskStatusMeta
              ? [
                  {
                    key: 'status',
                    label: '状态',
                    value: selectedTaskStatusMeta.label,
                    color: selectedTaskStatusMeta.color,
                  },
                  {
                    key: 'owner',
                    label: '责任',
                    value: getWorkflowTaskOwnerRoleLabel(selectedTask),
                  },
                ]
              : []
          }
          boundaryText={
            selectedTaskReadonlyReason ||
            '当前操作只更新协同任务；生产、库存、出货、财务、开票和收付款仍需在对应业务页面完成。'
          }
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedTask}
            onClick={() => setSelectedTaskKeys([])}
          >
            清空已选
          </Button>
          {canCompleteSelected ? (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={taskActionLoadingID === selectedTask?.id}
              disabled={taskActionLoadingID > 0}
              onClick={() => completeWorkflowTask(selectedTask)}
            >
              完成协同
            </Button>
          ) : null}
          {canBlockSelected ? (
            <Button
              size="small"
              danger
              icon={<ExclamationCircleOutlined />}
              disabled={taskActionLoadingID > 0}
              onClick={() => openTaskReasonModal('block')}
            >
              标记阻塞
            </Button>
          ) : null}
          {canRejectSelected ? (
            <Button
              size="small"
              danger
              icon={<ExclamationCircleOutlined />}
              disabled={taskActionLoadingID > 0}
              onClick={() => openTaskReasonModal('reject')}
            >
              退回任务
            </Button>
          ) : null}
          {canResumeSelected ? (
            <Button
              size="small"
              type="primary"
              icon={<RedoOutlined />}
              disabled={taskActionLoadingID > 0}
              onClick={() => openTaskReasonModal('resume')}
            >
              解除阻塞
            </Button>
          ) : null}
          {canUrgeSelected ? (
            <Button
              size="small"
              icon={<SendOutlined />}
              loading={urgingTaskID === selectedTask?.id}
              disabled={urgingTaskID > 0}
              onClick={() => openTaskReasonModal('urge')}
            >
              催办
            </Button>
          ) : null}
          <BusinessAttachmentModalButton
            ownerType="workflow_task"
            ownerId={selectedTask?.id}
            ownerVersion={selectedTask?.version}
            modalTitle="协同任务附件"
            panelTitle="协同任务附件"
            description="上传现场照片、异常截图或任务处理证据；附件不代表任务已完成，也不会改变相关业务记录。"
            canUpload={canUpdateWorkflowTasks || canCompleteWorkflowTasks}
            canDelete={canUpdateWorkflowTasks}
            disabled={!selectedTask}
            disabledReason="请先选择一条协同任务"
          />
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={tableColumns}
        dataSource={filteredTasks}
        scroll={{ x: 1000 }}
        emptyDescription={
          canReadWorkflowTasks
            ? config.emptyText
            : '当前账号不能查看此类协同任务。'
        }
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedTaskKeys,
          onChange: (nextKeys) => setSelectedTaskKeys(nextKeys.slice(-1)),
        }}
        rowClassName={(record) =>
          selectedTaskKeys.includes(record.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedTaskKeys([record.id]),
        })}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
      {columnOrderModal}

      <CollaborationTaskPanel
        tasks={tasks}
        selectedTasks={selectedTasks}
        selectedRecordLabel={
          selectedTasks[0]?.task_name ||
          `请先选择一条${moduleItem.shortLabel}协同`
        }
        adminProfile={adminProfile}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onRejectTask={canUpdateWorkflowTasks ? rejectWorkflowTask : undefined}
        onResumeTask={canUpdateWorkflowTasks ? resumeWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeWorkflowTaskFromPage : undefined
        }
        taskActionLoadingID={taskActionLoadingID}
        urgingTaskID={urgingTaskID}
      />

      <Modal
        className="erp-business-action-modal"
        width={520}
        title={businessActionModalTitle(
          taskReasonModal?.mode === 'block'
            ? '标记阻塞'
            : taskReasonModal?.mode === 'reject'
              ? '退回任务'
              : taskReasonModal?.mode === 'resume'
                ? '解除阻塞'
                : '催办协同',
          selectedTaskLabel
        )}
        open={Boolean(taskReasonModal)}
        onCancel={closeTaskReasonModal}
        onOk={submitTaskReasonAction}
        okText={
          taskReasonModal?.mode === 'block'
            ? '确认阻塞'
            : taskReasonModal?.mode === 'reject'
              ? '确认退回'
              : taskReasonModal?.mode === 'resume'
                ? '确认恢复'
                : '确认催办'
        }
        confirmLoading={taskActionLoadingID > 0 || urgingTaskID > 0}
        destroyOnHidden
      >
        <Input.TextArea
          rows={4}
          maxLength={240}
          showCount
          autoFocus
          placeholder={
            taskReasonModal?.mode === 'block'
              ? '填写阻塞原因；只更新当前协同任务状态。'
              : taskReasonModal?.mode === 'reject'
                ? '填写退回原因；只更新当前协同任务状态。'
                : taskReasonModal?.mode === 'resume'
                  ? '填写阻塞解除说明；任务将恢复为可执行。'
                  : '填写催办原因；只记录协同事件。'
          }
          value={taskReasonModal?.reason || ''}
          onChange={(event) =>
            setTaskReasonModal((current) =>
              current ? { ...current, reason: event.target.value } : current
            )
          }
        />
      </Modal>
    </BusinessPageLayout>
  )
}
