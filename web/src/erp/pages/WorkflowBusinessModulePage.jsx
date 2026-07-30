import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  RedoOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Alert, Button, Input, Modal, Space, Tabs, Tag } from 'antd'
import dayjs from 'dayjs'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  getWorkflowTaskProcessContext,
  listWorkflowTasks,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import ProductionExceptionDecisionPanel, {
  canReadProductionExceptionDecisions,
} from '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
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
import {
  createBusinessTablePagination,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  buildWorkflowBusinessTaskQuery,
  buildWorkflowBusinessTaskStats,
  reconcileWorkflowBusinessTaskPage,
  requireWorkflowBusinessTaskPage,
} from '../utils/workflowBusinessModuleModel.mjs'
import {
  getWorkflowTaskCodeLabel,
  getWorkflowTaskDueLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
} from '../utils/workflowTaskBoard.mjs'
import { isWorkflowProcessDecisionTask } from '../utils/workflowTaskActionContract.mjs'
import {
  buildWorkflowProcessDecision,
  getWorkflowProcessDecisionApprovalForm,
  getWorkflowProcessDecisionApprovedQuantityError,
  requireWorkflowProcessDecisionSubmission,
  workflowProcessDecisionAllowsApprovedQuantity,
} from '../utils/workflowProcessDecision.mjs'

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
const PRODUCTION_EXCEPTION_TAB_KEYS = Object.freeze({
  DECISIONS: 'decisions',
  TASKS: 'tasks',
})

const MODULE_WORKFLOW_CONFIG = Object.freeze({
  'production-scheduling': {
    taskGroup: 'production_scheduling',
    completionMessage:
      '排程任务已完成，领料、完工和入库仍需到对应业务页面办理。',
    emptyText: '暂无生产排程任务。',
    ownerRoleOptions: [
      workflowRoleOption('pmc'),
      workflowRoleOption('production'),
      workflowRoleOption('warehouse'),
    ],
    payloadScope: 'production_scheduling_workflow_only',
  },
  'production-exceptions': {
    taskGroup: 'production_exception_decision_approval',
    completionMessage:
      '异常审批已完成；生产岗位仍需在异常来源记录中执行或冲正，任务完成本身不写生产或库存事实。',
    emptyText: '暂无待审批的生产异常处置申请。',
    ownerRoleOptions: [workflowRoleOption('boss')],
    payloadScope: 'production_exception_decision_process_approval',
  },
  'shipping-release': {
    taskGroup: 'shipment_finance_approval',
    completionMessage:
      '出货财务审批已完成；仓库仍需在出货单中独立确认实际出货。',
    emptyText: '暂无出货财务审批任务。',
    ownerRoleOptions: [
      workflowRoleOption('finance'),
      workflowRoleOption('boss'),
    ],
    payloadScope: 'shipment_finance_approval_process_only',
  },
})

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
  const [searchParams] = useSearchParams()
  const beginLatestRequest = useLatestRequestCoordinator()
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
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [loading, setLoading] = useState(false)
  const [taskReasonModal, setTaskReasonModal] = useState(null)
  const [taskReasonProcessContext, setTaskReasonProcessContext] = useState(null)
  const [taskReasonProcessContextState, setTaskReasonProcessContextState] =
    useState('idle')
  const linkedKeyword = String(searchParams.get('link_keyword') || '').trim()
  const [keyword, setKeyword] = useState(linkedKeyword)
  const [status, setStatus] = useState('')
  const [ownerRoleKey, setOwnerRoleKey] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [selectedTaskKeys, setSelectedTaskKeys] = useState([])
  const [detailTask, setDetailTask] = useState(null)
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
  const canApproveWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.approve'
  )
  const canCompleteOrApproveWorkflowTasks =
    canCompleteWorkflowTasks ||
    canApproveWorkflowTasks ||
    [
      'sales_return.approve',
      'finance.payment.approve',
      'warehouse.adjustment.approve',
      'production.exception.approve',
    ].some((permission) => hasActionPermission(adminProfile, permission))
  const canRejectWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.reject'
  )
  const isProductionExceptionPage = moduleKey === 'production-exceptions'
  const canReadProductionExceptionRecords =
    isProductionExceptionPage &&
    canReadProductionExceptionDecisions(adminProfile)
  const linkedProductionExceptionID = Number(
    searchParams.get('production_exception_id') || 0
  )
  const [activeProductionExceptionTab, setActiveProductionExceptionTab] =
    useState(() =>
      linkedProductionExceptionID > 0 && canReadProductionExceptionRecords
        ? PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
        : linkedKeyword && canReadWorkflowTasks
          ? PRODUCTION_EXCEPTION_TAB_KEYS.TASKS
          : canReadProductionExceptionRecords
            ? PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
            : PRODUCTION_EXCEPTION_TAB_KEYS.TASKS
    )
  const [productionExceptionSummary, setProductionExceptionSummary] = useState({
    total: 0,
    pageCount: 0,
  })
  const productionExceptionRefreshRef = useRef(null)
  const productionExceptionTabKeys = useMemo(
    () =>
      [
        canReadProductionExceptionRecords
          ? PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
          : null,
        canReadWorkflowTasks ? PRODUCTION_EXCEPTION_TAB_KEYS.TASKS : null,
      ].filter(Boolean),
    [canReadProductionExceptionRecords, canReadWorkflowTasks]
  )
  const effectiveProductionExceptionTab = productionExceptionTabKeys.includes(
    activeProductionExceptionTab
  )
    ? activeProductionExceptionTab
    : productionExceptionTabKeys[0] || PRODUCTION_EXCEPTION_TAB_KEYS.TASKS
  const isWorkflowTaskWorkspaceActive =
    !isProductionExceptionPage ||
    effectiveProductionExceptionTab === PRODUCTION_EXCEPTION_TAB_KEYS.TASKS

  useEffect(() => {
    if (!isProductionExceptionPage) return
    setActiveProductionExceptionTab((current) => {
      if (
        linkedProductionExceptionID > 0 &&
        canReadProductionExceptionRecords
      ) {
        return PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
      }
      if (linkedKeyword && canReadWorkflowTasks) {
        return PRODUCTION_EXCEPTION_TAB_KEYS.TASKS
      }
      return productionExceptionTabKeys.includes(current)
        ? current
        : productionExceptionTabKeys[0] || PRODUCTION_EXCEPTION_TAB_KEYS.TASKS
    })
  }, [
    canReadProductionExceptionRecords,
    canReadWorkflowTasks,
    isProductionExceptionPage,
    linkedKeyword,
    linkedProductionExceptionID,
    productionExceptionTabKeys,
  ])

  const loadWorkflowTasks = useCallback(async () => {
    const request = beginLatestRequest('workflow-business-tasks')
    if (!isWorkflowTaskWorkspaceActive) {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
      return false
    }
    if (!config || !canReadWorkflowTasks) {
      if (request.isCurrent()) {
        setTasks([])
        setTotal(0)
        setSelectedTaskKeys([])
        setDetailTask(null)
        setLoading(false)
        request.finish()
      }
      return false
    }
    setLoading(true)
    try {
      const query = buildWorkflowBusinessTaskQuery({
        taskGroup: config.taskGroup,
        keyword,
        status,
        ownerRoleKey,
        dueFrom: toUnixStartSeconds(dueFrom),
        dueTo: toUnixSeconds(dueTo),
        pagination,
      })
      const data = await listWorkflowTasks(query, { signal: request.signal })
      if (!request.isCurrent()) return false
      const page = requireWorkflowBusinessTaskPage(data, {
        taskGroup: config.taskGroup,
        limit: query.limit,
        offset: query.offset,
      })
      const pageState = reconcileWorkflowBusinessTaskPage({
        tasks: page.tasks,
        total: page.total,
        pagination,
      })
      setTotal(page.total)
      setTasks(pageState.tasks)
      setSelectedTaskKeys(
        (current) =>
          reconcileWorkflowBusinessTaskPage({
            tasks: page.tasks,
            total: page.total,
            pagination,
            selectedTaskKeys: current,
          }).selectedTaskKeys
      )
      setDetailTask((current) =>
        current
          ? pageState.tasks.find((task) => task.id === current.id) || null
          : null
      )
      if (pageState.shouldRetreat) {
        setPagination((current) => ({
          ...current,
          current: pageState.current,
        }))
      }
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      setTasks([])
      setTotal(0)
      setSelectedTaskKeys([])
      setDetailTask(null)
      message.error(
        getActionErrorMessage(
          error,
          `加载${moduleItem?.title || '当前页面'}任务失败`
        )
      )
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    canReadWorkflowTasks,
    config,
    dueFrom,
    dueTo,
    keyword,
    isWorkflowTaskWorkspaceActive,
    moduleItem?.title,
    ownerRoleKey,
    pagination,
    status,
  ])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  useEffect(() => {
    setKeyword(linkedKeyword)
    resetBusinessPaginationCurrent(setPagination)
  }, [linkedKeyword])

  useEffect(() => {
    if (!moduleItem) return undefined
    return outletContext?.registerPageRefresh?.(async () => {
      if (
        isProductionExceptionPage &&
        effectiveProductionExceptionTab ===
          PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
      ) {
        const refreshed = await productionExceptionRefreshRef.current?.()
        if (refreshed) {
          message.success('生产异常处置申请已刷新')
        }
        return false
      }
      const refreshed = await loadWorkflowTasks()
      if (refreshed) {
        message.success(`${moduleItem.title}任务已刷新`)
      }
      return false
    })
  }, [
    effectiveProductionExceptionTab,
    isProductionExceptionPage,
    loadWorkflowTasks,
    moduleItem,
    outletContext,
  ])

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskKeys.includes(task.id)),
    [selectedTaskKeys, tasks]
  )
  const selectedTask = selectedTasks[0] || null
  const taskReasonProcessDecisionRequired = Boolean(
    taskReasonModal?.mode === 'complete' &&
      isWorkflowProcessDecisionTask(selectedTask)
  )
  const taskReasonProcessApprovalForm = getWorkflowProcessDecisionApprovalForm(
    selectedTask,
    taskReasonProcessContext
  )
  const taskReasonProcessDecisionReady =
    !taskReasonProcessDecisionRequired ||
    (taskReasonProcessContextState === 'ready' &&
      Boolean(taskReasonProcessApprovalForm))
  const taskReasonApprovedQuantityAllowed =
    taskReasonProcessDecisionRequired &&
    workflowProcessDecisionAllowsApprovedQuantity(taskReasonProcessApprovalForm)
  const taskReasonApprovedQuantityError = taskReasonApprovedQuantityAllowed
    ? getWorkflowProcessDecisionApprovedQuantityError(
        taskReasonProcessApprovalForm,
        taskReasonModal?.approvedQuantity || ''
      )
    : ''

  useEffect(() => {
    if (!taskReasonProcessDecisionRequired) {
      setTaskReasonProcessContext(null)
      setTaskReasonProcessContextState('idle')
      return undefined
    }
    if (!selectedTask?.id || !selectedTask?.process_instance_id) {
      setTaskReasonProcessContext(null)
      setTaskReasonProcessContextState('error')
      return undefined
    }

    const controller = new AbortController()
    setTaskReasonProcessContext(null)
    setTaskReasonProcessContextState('loading')
    getWorkflowTaskProcessContext(selectedTask.id, {
      signal: controller.signal,
    })
      .then((context) => {
        if (!getWorkflowProcessDecisionApprovalForm(selectedTask, context)) {
          throw new Error('审批表单与流程节点不一致')
        }
        setTaskReasonProcessContext(context)
        setTaskReasonProcessContextState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setTaskReasonProcessContext(null)
        setTaskReasonProcessContextState('error')
      })
    return () => controller.abort()
  }, [selectedTask, taskReasonProcessDecisionRequired])

  const stats = useMemo(
    () => buildWorkflowBusinessTaskStats({ total, pageCount: tasks.length }),
    [tasks.length, total]
  )
  const productionExceptionStats = useMemo(
    () => [
      {
        key: 'production-exception-total',
        label: '异常记录',
        value: productionExceptionSummary.total,
      },
      {
        key: 'production-exception-page',
        label: '当前显示',
        value: productionExceptionSummary.pageCount,
      },
    ],
    [productionExceptionSummary.pageCount, productionExceptionSummary.total]
  )
  const headerStats =
    isProductionExceptionPage &&
    effectiveProductionExceptionTab === PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS
      ? productionExceptionStats
      : stats

  const selectedTaskLabel = selectedTask
    ? `${getWorkflowTaskCodeLabel(selectedTask)} / ${
        selectedTask.task_name || '未填写任务名称'
      }`
    : `请先选择一条${moduleItem?.shortLabel || ''}任务`
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
    enabled: Boolean(
      selectedTask && canReadWorkflowTasks && isWorkflowTaskWorkspaceActive
    ),
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
  const shouldShowWorkflowAction = (actionMode) =>
    !selectedTask ||
    selectedTaskActionAccess.loading ||
    selectedTaskActionAccess.failed ||
    selectedTaskActionAccess.canRun(actionMode)
  const workflowActionDisabledReason = (actionMode, actionLabel) => {
    if (!selectedTask) return '请先选择一条任务'
    if (selectedTaskActionAccess.loading) {
      return `正在确认是否可以${actionLabel}`
    }
    if (!selectedTaskActionAccess.canRun(actionMode)) {
      return (
        selectedTaskActionAccess.getReason(actionMode) ||
        `当前任务暂不能${actionLabel}`
      )
    }
    if (taskActionLoadingID > 0 || urgingTaskID > 0) {
      return '当前操作完成后可继续办理'
    }
    return ''
  }

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
    async (task, { processDecision = null, reason = '' } = {}) => {
      const requiresDecision = isWorkflowProcessDecisionTask(task)
      const normalizedReason = String(reason || '').trim()
      if (requiresDecision && !normalizedReason) {
        message.warning('请先填写审批意见')
        return false
      }
      let canonicalProcessDecision = null
      if (requiresDecision) {
        try {
          canonicalProcessDecision = requireWorkflowProcessDecisionSubmission(
            task,
            processDecision,
            {
              reason: normalizedReason,
            }
          )
        } catch (error) {
          message.warning(
            getActionErrorMessage(
              error,
              '审批表单与当前流程节点不一致，请刷新后重试'
            )
          )
          return false
        }
      }
      const scope = `${task.id}:complete`
      const operation = 'complete'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        ...(normalizedReason ? { reason: normalizedReason } : {}),
        payload: {
          entry_path: moduleItem?.path || '',
          surface_key: 'workflow_business_module',
          ...(canonicalProcessDecision
            ? { process_decision: canonicalProcessDecision }
            : {}),
        },
      }
      return runMutationInFlight(`task:${task.id}`, async () => {
        const accessVerified = await verifyMutationAccess({
          task,
          actionKey: operation,
          reason: normalizedReason,
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
            message.error(getActionErrorMessage(error, '完成任务失败'))
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
            message.error(getActionErrorMessage(error, '退回任务失败'))
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
            message.error(getActionErrorMessage(error, '催办任务失败'))
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
    setTaskReasonModal({ approvedQuantity: '', mode, reason: '' })
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
    const approvedQuantity = String(
      taskReasonModal.approvedQuantity || ''
    ).trim()
    let succeeded = false
    if (taskReasonModal.mode === 'complete') {
      let processDecision = null
      if (taskReasonProcessDecisionRequired) {
        if (!taskReasonProcessDecisionReady) {
          message.warning('审批表单与当前流程节点不一致，请关闭后刷新任务再试')
          return
        }
        try {
          processDecision = buildWorkflowProcessDecision({
            task: selectedTask,
            processContext: taskReasonProcessContext,
            reason,
            approvedQuantity,
          })
        } catch (error) {
          message.warning(
            getActionErrorMessage(
              error,
              '审批表单与当前流程节点不一致，请刷新后重试'
            )
          )
          return
        }
      }
      succeeded = await completeWorkflowTask(selectedTask, {
        processDecision,
        reason,
      })
    } else if (taskReasonModal.mode === 'block') {
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
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    selectedTask,
    taskReasonModal,
    taskReasonProcessContext,
    taskReasonProcessDecisionReady,
    taskReasonProcessDecisionRequired,
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
          title: '负责岗位',
          exportTitle: '负责岗位',
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
            getWorkflowTaskReason(record) || '按当前任务要求处理',
          exportValue: (record) => getWorkflowTaskReason(record),
        },
      ]),
    []
  )
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey,
      moduleTitle: moduleItem?.title || '页面暂不可用',
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
    resetBusinessPaginationCurrent(setPagination)
  }, [])
  const handleProductionExceptionTabChange = useCallback((nextTab) => {
    setActiveProductionExceptionTab(nextTab)
    if (nextTab !== PRODUCTION_EXCEPTION_TAB_KEYS.TASKS) {
      setDetailTask(null)
      setTaskReasonModal(null)
      setTaskReasonProcessContext(null)
      setTaskReasonProcessContextState('idle')
    }
  }, [])
  const handleProductionExceptionRefreshReady = useCallback((refresh) => {
    productionExceptionRefreshRef.current = refresh
  }, [])

  if (!moduleItem || !config) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="页面暂不可用"
          description="当前页面暂不可用，请返回工作台或联系管理员。"
          tags={<Tag color="red">暂不可用</Tag>}
        />
      </BusinessPageLayout>
    )
  }

  const productionExceptionTabItems = [
    ...(canReadProductionExceptionRecords
      ? [
          {
            key: PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS,
            label: '处置申请',
          },
        ]
      : []),
    ...(canReadWorkflowTasks
      ? [
          {
            key: PRODUCTION_EXCEPTION_TAB_KEYS.TASKS,
            label: '待审批',
          },
        ]
      : []),
  ]
  const productionExceptionViewTabs =
    isProductionExceptionPage && productionExceptionTabItems.length > 0 ? (
      <Tabs
        aria-label="生产异常处置工作区"
        activeKey={effectiveProductionExceptionTab}
        items={productionExceptionTabItems}
        onChange={handleProductionExceptionTabChange}
      />
    ) : null
  const showingProductionExceptionDecisions =
    isProductionExceptionPage &&
    effectiveProductionExceptionTab === PRODUCTION_EXCEPTION_TAB_KEYS.DECISIONS

  const workflowTaskWorkspace = (
    <>
      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              aria-label="搜索待办任务"
              placeholder="搜索任务"
              searchHint="可搜索：任务、来源号、原因"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="任务状态"
              value={status}
              options={TASK_STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="负责岗位"
              value={ownerRoleKey}
              options={[
                { label: '全部岗位', value: '' },
                ...config.ownerRoleOptions,
              ]}
              onChange={(value) => {
                setOwnerRoleKey(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={DUE_DATE_FILTER_OPTIONS}
              value="due_at"
              startValue={dueFrom}
              endValue={dueTo}
              onStartChange={(value) => {
                setDueFrom(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onEndChange={(value) => {
                setDueTo(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle={moduleItem.title}
            exportDisabled
            exportDisabledReason="当前页面只用于处理任务，暂不提供业务数据导出。"
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
            '当前操作只更新任务状态；生产、库存、出货、财务、开票和收付款仍需在对应业务页面完成。'
          }
        >
          <SelectionClearAction
            selectedCount={selectedTask ? 1 : 0}
            selectionLabel="任务"
            onClear={() => setSelectedTaskKeys([])}
          />
          <BusinessActionTooltip
            disabled={!selectedTask}
            disabledReason="请先选择一条任务"
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedTask}
              onClick={() => setDetailTask(selectedTask)}
            >
              查看任务
            </Button>
          </BusinessActionTooltip>
          {canCompleteOrApproveWorkflowTasks &&
          shouldShowWorkflowAction('complete') ? (
            <BusinessActionTooltip
              disabled={
                !canCompleteSelected ||
                taskActionLoadingID > 0 ||
                urgingTaskID > 0
              }
              disabledReason={workflowActionDisabledReason(
                'complete',
                isWorkflowProcessDecisionTask(selectedTask)
                  ? '审批通过'
                  : '完成任务'
              )}
            >
              <Button
                size="small"
                type="primary"
                className="erp-business-module-status-action"
                icon={<CheckCircleOutlined />}
                loading={taskActionLoadingID === selectedTask?.id}
                disabled={
                  !canCompleteSelected ||
                  taskActionLoadingID > 0 ||
                  urgingTaskID > 0
                }
                onClick={() =>
                  isWorkflowProcessDecisionTask(selectedTask)
                    ? openTaskReasonModal('complete')
                    : completeWorkflowTask(selectedTask)
                }
              >
                {isWorkflowProcessDecisionTask(selectedTask)
                  ? '审批通过'
                  : '完成任务'}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdateWorkflowTasks && shouldShowWorkflowAction('block') ? (
            <BusinessActionTooltip
              disabled={
                !canBlockSelected || taskActionLoadingID > 0 || urgingTaskID > 0
              }
              disabledReason={workflowActionDisabledReason('block', '标记阻塞')}
            >
              <Button
                size="small"
                danger
                className="erp-business-module-status-action"
                icon={<ExclamationCircleOutlined />}
                disabled={
                  !canBlockSelected ||
                  taskActionLoadingID > 0 ||
                  urgingTaskID > 0
                }
                onClick={() => openTaskReasonModal('block')}
              >
                标记阻塞
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canRejectWorkflowTasks && shouldShowWorkflowAction('reject') ? (
            <BusinessActionTooltip
              disabled={
                !canRejectSelected ||
                taskActionLoadingID > 0 ||
                urgingTaskID > 0
              }
              disabledReason={workflowActionDisabledReason(
                'reject',
                '退回任务'
              )}
            >
              <Button
                size="small"
                danger
                className="erp-business-module-status-action"
                icon={<ExclamationCircleOutlined />}
                disabled={
                  !canRejectSelected ||
                  taskActionLoadingID > 0 ||
                  urgingTaskID > 0
                }
                onClick={() => openTaskReasonModal('reject')}
              >
                退回任务
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdateWorkflowTasks && shouldShowWorkflowAction('resume') ? (
            <BusinessActionTooltip
              disabled={
                !canResumeSelected ||
                taskActionLoadingID > 0 ||
                urgingTaskID > 0
              }
              disabledReason={workflowActionDisabledReason(
                'resume',
                '解除阻塞'
              )}
            >
              <Button
                size="small"
                type="primary"
                className="erp-business-module-status-action"
                icon={<RedoOutlined />}
                disabled={
                  !canResumeSelected ||
                  taskActionLoadingID > 0 ||
                  urgingTaskID > 0
                }
                onClick={() => openTaskReasonModal('resume')}
              >
                解除阻塞
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdateWorkflowTasks && shouldShowWorkflowAction('urge') ? (
            <BusinessActionTooltip
              disabled={
                !canUrgeSelected || taskActionLoadingID > 0 || urgingTaskID > 0
              }
              disabledReason={workflowActionDisabledReason('urge', '催办')}
            >
              <Button
                size="small"
                icon={<SendOutlined />}
                loading={urgingTaskID === selectedTask?.id}
                disabled={
                  !canUrgeSelected ||
                  taskActionLoadingID > 0 ||
                  urgingTaskID > 0
                }
                onClick={() => openTaskReasonModal('urge')}
              >
                催办
              </Button>
            </BusinessActionTooltip>
          ) : null}
          <BusinessAttachmentModalButton
            ownerType="workflow_task"
            ownerId={selectedTask?.id}
            ownerVersion={selectedTask?.version}
            modalTitle="任务附件"
            panelTitle="任务附件"
            description="上传现场照片、异常截图或任务处理证据；附件不代表任务已完成，也不会改变相关业务记录。"
            canUpload={canUpdateWorkflowTasks || canCompleteWorkflowTasks}
            canDelete={canUpdateWorkflowTasks}
            disabled={!selectedTask}
            disabledReason="请先选择一条任务"
          />
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        tableHeader={
          isProductionExceptionPage ? productionExceptionViewTabs : null
        }
        rowKey="id"
        loading={loading}
        columns={tableColumns}
        dataSource={tasks}
        scroll={{ x: 1000 }}
        emptyDescription={
          canReadWorkflowTasks ? config.emptyText : '当前账号不能查看此类任务。'
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
        onOpenRecord={(record) => {
          setSelectedTaskKeys([record.id])
          setDetailTask(record)
        }}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => {
            setSelectedTaskKeys([])
            setDetailTask(null)
            setPagination({ current, pageSize })
          },
        })}
      />
      {columnOrderModal}

      <BusinessRecordDetailsModal
        columns={visibleColumns}
        description="查看任务来源、责任、到期和当前原因；完成、阻塞、退回和催办仍从当前操作区办理。"
        open={Boolean(detailTask)}
        record={detailTask}
        title={`${moduleItem.title}任务详情`}
        onClose={() => setDetailTask(null)}
      />

      <Modal
        className="erp-business-action-modal"
        width={520}
        title={businessActionModalTitle(
          taskReasonModal?.mode === 'block'
            ? '标记阻塞'
            : taskReasonModal?.mode === 'complete'
              ? '审批通过'
              : taskReasonModal?.mode === 'reject'
                ? '退回任务'
                : taskReasonModal?.mode === 'resume'
                  ? '解除阻塞'
                  : '催办任务',
          selectedTaskLabel
        )}
        open={Boolean(taskReasonModal)}
        onCancel={closeTaskReasonModal}
        onOk={submitTaskReasonAction}
        okButtonProps={{
          disabled:
            !taskReasonProcessDecisionReady ||
            Boolean(taskReasonApprovedQuantityError),
        }}
        okText={
          taskReasonModal?.mode === 'block'
            ? '确认阻塞'
            : taskReasonModal?.mode === 'complete'
              ? '确认通过'
              : taskReasonModal?.mode === 'reject'
                ? '确认退回'
                : taskReasonModal?.mode === 'resume'
                  ? '确认恢复'
                  : '确认催办'
        }
        confirmLoading={taskActionLoadingID > 0 || urgingTaskID > 0}
        destroyOnHidden
      >
        {taskReasonProcessDecisionRequired &&
        taskReasonProcessContextState === 'loading' ? (
          <Alert
            type="info"
            showIcon
            message="正在核对当前流程的审批表单"
            description="核对完成前不会提交审批决策。"
            style={{ marginBottom: 16 }}
          />
        ) : taskReasonProcessDecisionRequired &&
          !taskReasonProcessApprovalForm ? (
            <Alert
              type="error"
              showIcon
              message="审批表单与当前流程节点不一致"
              description="请关闭后刷新任务再试；系统不会按任务名称或页面入口猜测审批字段。"
              style={{ marginBottom: 16 }}
            />
        ) : null}
        <Input.TextArea
          rows={4}
          maxLength={240}
          showCount
          autoFocus
          placeholder={
            taskReasonModal?.mode === 'block'
              ? '填写阻塞原因；提交后只更新当前任务状态。'
              : taskReasonModal?.mode === 'complete'
                ? '填写审批意见和判断依据；审批不会直接写入业务事实。'
                : taskReasonModal?.mode === 'reject'
                  ? '填写退回原因；提交后只更新当前任务状态。'
                  : taskReasonModal?.mode === 'resume'
                    ? '填写阻塞解除说明；任务将恢复为可执行。'
                    : '填写催办原因；只保存本次催办记录。'
          }
          value={taskReasonModal?.reason || ''}
          onChange={(event) =>
            setTaskReasonModal((current) =>
              current ? { ...current, reason: event.target.value } : current
            )
          }
        />
        {taskReasonApprovedQuantityAllowed ? (
          <>
            <Input
              style={{ marginTop: 16 }}
              inputMode="decimal"
              status={taskReasonApprovedQuantityError ? 'error' : undefined}
              placeholder="批准数量（可选；留空表示按申请数量批准）"
              value={taskReasonModal?.approvedQuantity || ''}
              onChange={(event) =>
                setTaskReasonModal((current) =>
                  current
                    ? { ...current, approvedQuantity: event.target.value }
                    : current
                )
              }
            />
            {taskReasonApprovedQuantityError ? (
              <Alert
                type="error"
                showIcon
                message={taskReasonApprovedQuantityError}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  )

  return (
    <BusinessPageLayout className="erp-workflow-business-page">
      <PageHeaderCard
        title={moduleItem.title}
        description={moduleItem.description}
        tags={
          <Space size={6} wrap>
            <Tag color="blue">
              {showingProductionExceptionDecisions ? '处置申请' : '待审批'}
            </Tag>
            <Tag color="gold">业务处理分开完成</Tag>
          </Space>
        }
        stats={headerStats}
        compact
      />

      {isProductionExceptionPage ? (
        productionExceptionTabItems.length > 0 ? (
          showingProductionExceptionDecisions ? (
            <ProductionExceptionDecisionPanel
              adminProfile={adminProfile}
              onRefreshReady={handleProductionExceptionRefreshReady}
              onSummaryChange={setProductionExceptionSummary}
              tableHeader={productionExceptionViewTabs}
            />
          ) : (
            <BusinessPageLayout className="erp-workflow-business-page__tab-workspace">
              {workflowTaskWorkspace}
            </BusinessPageLayout>
          )
        ) : (
          <Alert
            type="warning"
            showIcon
            message="当前账号不能查看生产异常处置申请或待审批任务。"
          />
        )
      ) : (
        workflowTaskWorkspace
      )}
    </BusinessPageLayout>
  )
}
