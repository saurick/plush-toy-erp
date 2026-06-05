import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BellOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  InboxOutlined,
  LeftOutlined,
  LinkOutlined,
  LogoutOutlined,
  MoreOutlined,
  PauseOutlined,
  CaretRightOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  upsertWorkflowBusinessState,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import {
  listBusinessRecords,
  updateBusinessRecord,
} from '../../api/businessRecordApi.mjs'
import { getBusinessModule } from '../../config/businessModules.mjs'
import { getBusinessRecordDefinition } from '../../config/businessRecordDefinitions.mjs'
import { buildBusinessRecordStatusUpdateParams } from '../../utils/businessRecordForm.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
  formatMobileTaskTime,
} from '../../utils/mobileTaskView.mjs'
import {
  buildMobileWorkflowTaskQueryPlan,
  mergeWorkflowTaskResults,
} from '../../utils/mobileTaskQueries.mjs'
import { isRoleKeyMatch, normalizeRoleKey } from '../../utils/roleKeys.mjs'
import {
  ORDER_APPROVAL_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  isOrderApprovalTask,
} from '../../utils/orderApprovalFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY,
  IQC_PENDING_STATUS_KEY,
  QC_FAILED_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  isPurchaseIqcTask,
  isWarehouseInboundTask,
} from '../../utils/purchaseInboundFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as OUTSOURCE_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as OUTSOURCE_QC_FAILED_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY as OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  OUTSOURCE_RETURN_QC_TASK_GROUP,
  buildOutsourceReturnQcTask,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../../utils/outsourceReturnFlow.mjs'
import {
  PRODUCTION_PROCESSING_STATUS_KEY as FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as FINISHED_GOODS_QC_FAILED_STATUS_KEY,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from '../../utils/finishedGoodsFlow.mjs'
import {
  INVOICE_REGISTRATION_TASK_GROUP,
  RECONCILING_STATUS_KEY as FINANCE_RECONCILING_STATUS_KEY,
  buildFinanceBlockedState,
  buildInvoiceRegistrationTask,
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
  resolveShipmentFinanceTaskBusinessStatus,
} from '../../utils/shipmentFinanceFlow.mjs'
import {
  OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP,
  OUTSOURCE_RECONCILIATION_TASK_GROUP,
  PURCHASE_RECONCILIATION_TASK_GROUP,
  RECONCILING_STATUS_KEY as PAYABLE_RECONCILING_STATUS_KEY,
  SETTLED_STATUS_KEY as PAYABLE_SETTLED_STATUS_KEY,
  buildOutsourcePayableRegistrationTask,
  buildOutsourceReconciliationTask,
  buildPayableBlockedState,
  buildPurchaseReconciliationTask,
  isOutsourcePayableRegistrationTask,
  isPayableRegistrationTask,
  isPayableReconciliationTask,
  resolvePayableReconciliationTaskBusinessStatus,
} from '../../utils/payableReconciliationFlow.mjs'
import { mobileTheme } from '../theme'

const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])

const MOBILE_ROLE_LABELS = {
  boss: '老板',
  business: '业务',
  sales: '业务',
  purchase: '采购',
  production: '生产',
  warehouse: '仓库组',
  finance: '财务',
  pmc: 'PMC',
  quality: '质检',
}

const QUICK_REASONS = ['材料不足', '产能不足', '工艺/模具问题', '信息不清']

const MOBILE_MAIN_TAB_KEYS = Object.freeze({
  TODO: 'todo',
  DONE: 'done',
  MESSAGES: 'messages',
  MINE: 'mine',
})

const MOBILE_MAIN_TAB_ITEMS = Object.freeze([
  { key: MOBILE_MAIN_TAB_KEYS.TODO, label: '待办', Icon: InboxOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.DONE, label: '已办', Icon: CheckSquareOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MESSAGES, label: '消息', Icon: BellOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MINE, label: '我的', Icon: UserOutlined },
])

function getMobileRoleLabel(roleKey) {
  return MOBILE_ROLE_LABELS[normalizeRoleKey(roleKey)] || '岗位'
}

function resolveLatestTaskTime(tasks) {
  const latest = tasks
    .map((task) => task.updated_at || task.created_at)
    .filter(Boolean)
    .sort()
  const latestValue = latest[latest.length - 1]
  return latestValue ? formatMobileTaskTime(latestValue) : '-'
}

function getTaskSeverityView(task) {
  if (isTaskOverdue(task)) {
    return {
      label: '超时',
      badgeClass: 'border-red-300 bg-red-50 text-red-600',
      rowClass: 'bg-red-50/35',
      timeClass: 'text-red-500',
    }
  }
  if (task.alert_level === 'critical') {
    return {
      label: '严重',
      badgeClass: 'border-red-300 bg-red-50 text-red-600',
      rowClass: 'bg-red-50/35',
      timeClass: 'text-red-500',
    }
  }
  if (isTaskAlerted(task)) {
    return {
      label: '预警',
      badgeClass: 'border-amber-300 bg-amber-50 text-amber-600',
      rowClass: 'bg-emerald-50/25',
      timeClass: 'text-orange-500',
    }
  }
  return {
    label: '普通',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-500',
    rowClass: 'bg-white',
    timeClass: 'text-slate-500',
  }
}

function resolveTaskListMeta(task) {
  const payload = task.payload || {}
  if (payload.customer_name || payload.style_no || payload.quantity) {
    return `客户：${payload.customer_name || '-'} ｜ 款式：${
      payload.style_no || payload.product_name || '-'
    } ｜ 数量：${payload.quantity || '-'}${payload.unit || ''}`
  }
  if (payload.material_name || payload.spec || payload.quantity) {
    return `物料：${payload.material_name || '-'} ｜ 规格：${
      payload.spec || '-'
    } ｜ 数量：${payload.quantity || '-'}${payload.unit || ''}`
  }
  if (payload.supplier_name || payload.payable_type) {
    return `供应商：${payload.supplier_name || '-'} ｜ 类型：${
      payload.payable_type || '-'
    }`
  }
  return `分组：${task.task_group || '-'} ｜ 优先级：${task.priority || '-'}`
}

function resolveTaskBusinessChip(task) {
  return task.business_status_label || task.task_status_label || '待处理'
}

function resolveDetailActionLabel(action) {
  if (action === 'blocked') return '阻塞原因（必填）'
  if (action === 'rejected') return '退回原因（必填）'
  if (action === 'urge') return '催办原因（必填）'
  return '处理原因'
}

function resolveOrderApprovalBusinessStatus(task, taskStatusKey) {
  if (!isOrderApprovalTask(task)) {
    return task.business_status_key || undefined
  }
  if (taskStatusKey === 'done') return ORDER_APPROVED_STATUS_KEY
  if (taskStatusKey === 'blocked') return 'blocked'
  if (taskStatusKey === 'rejected') return ORDER_APPROVAL_STATUS_KEY
  return task.business_status_key || ORDER_APPROVAL_STATUS_KEY
}

function resolvePurchaseInboundBusinessStatus(task, taskStatusKey) {
  if (isPurchaseIqcTask(task)) {
    if (taskStatusKey === 'done') return WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || IQC_PENDING_STATUS_KEY
  }
  if (isWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return INBOUND_DONE_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return task.business_status_key || WAREHOUSE_INBOUND_PENDING_STATUS_KEY
  }
  return null
}

function resolveOutsourceReturnBusinessStatus(task, taskStatusKey) {
  if (isOutsourceReturnTrackingTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_QC_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return (
      task.business_status_key || OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    )
  }
  if (isOutsourceReturnQcTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_PENDING_STATUS_KEY
  }
  if (isOutsourceWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_INBOUND_DONE_STATUS_KEY
    return (
      task.business_status_key || OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    )
  }
  if (isOutsourceReworkTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_FAILED_STATUS_KEY
  }
  return null
}

function resolveMobileTaskBusinessStatus(task, taskStatusKey) {
  return (
    resolvePurchaseInboundBusinessStatus(task, taskStatusKey) ||
    resolveOutsourceReturnBusinessStatus(task, taskStatusKey) ||
    resolveFinishedGoodsTaskBusinessStatus(task, taskStatusKey) ||
    resolveShipmentFinanceTaskBusinessStatus(task, taskStatusKey) ||
    resolvePayableReconciliationTaskBusinessStatus(task, taskStatusKey) ||
    resolveOrderApprovalBusinessStatus(task, taskStatusKey)
  )
}

function supportsRejectedAction(roleKey, task) {
  return (
    (roleKey === 'boss' && isOrderApprovalTask(task)) ||
    (roleKey === 'quality' &&
      (isPurchaseIqcTask(task) ||
        isOutsourceReturnQcTask(task) ||
        isFinishedGoodsQcTask(task))) ||
    (roleKey === 'warehouse' &&
      (isWarehouseInboundTask(task) ||
        isFinishedGoodsInboundTask(task) ||
        isShipmentReleaseTask(task))) ||
    (roleKey === 'finance' &&
      (isReceivableRegistrationTask(task) ||
        isInvoiceRegistrationTask(task) ||
        isPayableRegistrationTask(task) ||
        isPayableReconciliationTask(task)))
  )
}

function canOperateTask(roleKey, task) {
  return isRoleKeyMatch(task.owner_role_key, roleKey)
}

function isRiskTaskForUrge(task = {}) {
  return (
    ['blocked', 'rejected'].includes(
      String(task.task_status_key || '').trim()
    ) ||
    task.due_status === 'overdue' ||
    task.alert_level === 'critical' ||
    task.priority >= 3 ||
    task.payload?.critical_path === true ||
    task.is_escalated === true
  )
}

function resolveMobileUrgeAction(roleKey, task = {}) {
  if (roleKey === 'boss') return 'escalate_to_boss'
  if (
    roleKey !== 'pmc' &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  ) {
    return 'escalate_to_pmc'
  }
  return 'urge_task'
}

function canUrgeTask(roleKey, task = {}) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const taskOwnerRoleKey = normalizeRoleKey(task.owner_role_key)
  const confirmRoleKey = normalizeRoleKey(task.payload?.confirm_role_key)
  if (
    TERMINAL_TASK_STATUS_KEYS.has(String(task.task_status_key || '').trim())
  ) {
    return false
  }
  if (normalizedRoleKey === 'pmc') return isRiskTaskForUrge(task)
  if (normalizedRoleKey === 'boss') {
    return (
      task.priority >= 3 ||
      task.due_status === 'overdue' ||
      task.alert_level === 'critical' ||
      taskOwnerRoleKey === 'finance' ||
      task.is_escalated === true
    )
  }
  if (normalizedRoleKey === 'business') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      confirmRoleKey === normalizedRoleKey ||
      ['project-orders', 'shipping-release', 'outbound'].includes(
        task.source_type
      )
    )
  }
  if (normalizedRoleKey === 'production') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['processing-contracts', 'production-progress'].includes(
        task.source_type
      ) ||
      String(task.task_group || '').includes('rework') ||
      String(task.task_group || '').includes('outsource')
    )
  }
  if (normalizedRoleKey === 'finance') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['receivables', 'invoices', 'payables', 'reconciliation'].includes(
        task.source_type
      )
    )
  }
  return (
    taskOwnerRoleKey === normalizedRoleKey &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  )
}

function hasFinanceAmountPayload(task) {
  const payload = task?.payload || {}
  return [
    'amount',
    'tax_rate',
    'tax_amount',
    'amount_with_tax',
    'amount_without_tax',
  ].some((key) => payload[key] !== undefined && payload[key] !== '')
}

function resolveTaskSourceLabel(task) {
  return task.source_no || `${task.source_type} #${task.source_id}`
}

function isTaskOverdue(task) {
  return task.due_status === 'overdue'
}

function isTaskAlerted(task) {
  return task.alert_level !== 'info'
}

function getTaskQueueTone(task) {
  if (
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  ) {
    return '卡住'
  }
  if (task.alert_level === 'critical' || isTaskOverdue(task)) {
    return '高风险'
  }
  if (isTaskAlerted(task)) {
    return task.alert_label || task.due_status_label || '预警'
  }
  return task.task_status_label || '待处理'
}

function buildTaskFactRows(task) {
  const payload = task.payload || {}
  const rows = [
    [
      '状态',
      `${task.task_status_label} / ${formatMobileTaskTime(task.updated_at)}`,
    ],
    ['业务', task.business_status_label],
    ['分组', `${task.task_group || '-'} / 优先级 ${task.priority}`],
    ['截止', task.due_at_label || '-'],
  ]

  if (payload.customer_name || payload.style_no || payload.due_date) {
    rows.push([
      '客户/款式/交期',
      `${payload.customer_name || '-'} / ${
        payload.style_no || payload.product_name || '-'
      } / ${payload.due_date || '-'}`,
    ])
  }

  if (payload.supplier_name || payload.material_name || payload.quantity) {
    rows.push([
      '供应/物料/数量',
      `${payload.supplier_name || '-'} / ${
        payload.material_name || payload.product_name || '-'
      } / ${payload.quantity || '-'}${payload.unit || ''}`,
    ])
  }

  if (payload.qc_result) {
    rows.push(['IQC 结果', payload.qc_result])
  }

  if (hasFinanceAmountPayload(task)) {
    rows.push([
      '金额/税率',
      `${payload.amount || '-'} / ${payload.tax_rate || '-'} / 税额 ${
        payload.tax_amount || '-'
      } / 含税 ${payload.amount_with_tax || '-'} / 不含税 ${
        payload.amount_without_tax || '-'
      }`,
    ])
  }

  if (payload.payable_type) {
    rows.push(['应付类型', payload.payable_type])
  }

  return rows
}

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const { adminProfile, handleLogout, loggingOut } = useOutletContext() || {}
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingID, setUpdatingID] = useState(null)
  const [urgingID, setUrgingID] = useState(null)
  const [activeMainTabKey, setActiveMainTabKey] = useState(
    MOBILE_MAIN_TAB_KEYS.TODO
  )
  const [activeFilterKey, setActiveFilterKey] = useState('all')
  const [selectedTaskID, setSelectedTaskID] = useState(null)
  const [detailAction, setDetailAction] = useState(null)
  const [blockedReasonByTaskID, setBlockedReasonByTaskID] = useState({})
  const [urgeReasonByTaskID, setUrgeReasonByTaskID] = useState({})

  const taskViews = useMemo(
    () => buildMobileTaskListForRole(tasks, activeRoleKey),
    [activeRoleKey, tasks]
  )
  const activeTasks = useMemo(
    () =>
      taskViews.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [taskViews]
  )
  const doneTasks = useMemo(
    () =>
      taskViews.filter((task) =>
        TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [taskViews]
  )
  const warningTasks = useMemo(
    () => activeTasks.filter((task) => isTaskAlerted(task)),
    [activeTasks]
  )
  const noticeTasks = useMemo(() => activeTasks.slice(0, 8), [activeTasks])
  const taskSummary = useMemo(
    () => buildMobileTaskSummary(taskViews),
    [taskViews]
  )
  const progressTotal =
    taskSummary.pending +
    taskSummary.processing +
    taskSummary.blockedProgress +
    taskSummary.done
  const progressPercent =
    progressTotal === 0
      ? 0
      : Math.round((taskSummary.done / progressTotal) * 100)
  const filteredTasks = useMemo(() => {
    if (activeFilterKey === 'alert') {
      return activeTasks.filter((task) => isTaskAlerted(task))
    }
    if (activeFilterKey === 'overdue') {
      return activeTasks.filter((task) => isTaskOverdue(task))
    }
    if (activeFilterKey === 'mine') {
      return activeTasks.filter((task) => canOperateTask(activeRoleKey, task))
    }
    return activeTasks
  }, [activeFilterKey, activeRoleKey, activeTasks])
  const filterItems = useMemo(
    () => [
      { key: 'all', label: '全部', count: activeTasks.length },
      { key: 'alert', label: '预警', count: warningTasks.length },
      {
        key: 'overdue',
        label: '超时',
        count: activeTasks.filter((task) => isTaskOverdue(task)).length,
      },
      {
        key: 'mine',
        label: '我负责',
        count: activeTasks.filter((task) => canOperateTask(activeRoleKey, task))
          .length,
      },
    ],
    [activeRoleKey, activeTasks, warningTasks.length]
  )
  const selectedTask = useMemo(
    () =>
      activeTasks.find((task) => String(task.id) === String(selectedTaskID)) ||
      null,
    [activeTasks, selectedTaskID]
  )
  useEffect(() => {
    if (selectedTaskID === null) {
      return
    }
    const selectedVisible = filteredTasks.some(
      (task) => String(task.id) === String(selectedTaskID)
    )
    if (!selectedVisible) {
      setSelectedTaskID(null)
    }
  }, [filteredTasks, selectedTaskID])

  useEffect(() => {
    setDetailAction(null)
  }, [selectedTaskID])

  useEffect(() => {
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.TODO) {
      return
    }
    setActiveFilterKey('all')
    setSelectedTaskID(null)
    setDetailAction(null)
  }, [activeMainTabKey])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const queryResults = await Promise.all(
        buildMobileWorkflowTaskQueryPlan(activeRoleKey).map((query) =>
          listWorkflowTasks(query)
        )
      )
      setTasks(mergeWorkflowTaskResults(queryResults))
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '加载移动端任务失败，请稍后重试')
      )
    } finally {
      setLoading(false)
    }
  }, [activeRoleKey])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const loadBusinessRecordForTask = async (task) => {
    const sourceType = String(task.source_type || '').trim()
    if (!sourceType) return null
    const data = await listBusinessRecords({
      module_key: sourceType,
      limit: 200,
    })
    return (
      (data.records || []).find(
        (record) => String(record.id) === String(task.source_id)
      ) || null
    )
  }

  const updateBusinessRecordStatusForTask = async (
    task,
    record,
    nextStatusKey,
    reason
  ) => {
    const sourceType = String(task.source_type || '').trim()
    const moduleItem = getBusinessModule(sourceType) || {
      key: sourceType,
      title: sourceType,
      sectionKey: '',
    }
    const definition = getBusinessRecordDefinition(sourceType) || {}
    const params = buildBusinessRecordStatusUpdateParams(
      record,
      nextStatusKey,
      moduleItem,
      definition,
      { reason }
    )
    if (!params) return null
    return updateBusinessRecord(params)
  }

  const hasActiveTaskForSource = async (task, taskGroup) => {
    const data = await listWorkflowTasks({
      source_type: task.source_type,
      source_id: task.source_id,
      limit: 200,
    })
    return (data.tasks || []).some(
      (item) =>
        item.task_group === taskGroup &&
        !TERMINAL_TASK_STATUS_KEYS.has(item.task_status_key)
    )
  }

  const completeOutsourceReturnTrackingTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_QC_PENDING_STATUS_KEY,
        reason || '委外已回货，转品质检验'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_QC_PENDING_STATUS_KEY,
      owner_role_key: 'quality',
      payload: {
        record_title: savedRecord.title,
        return_task_id: task.id,
        notification_type: 'task_created',
        alert_type: 'outsource_return_qc_pending',
        critical_path: true,
        outsource_processing: true,
      },
    })
    const hasQcTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_RETURN_QC_TASK_GROUP
    )
    const qcTask = buildOutsourceReturnQcTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task
    )
    if (qcTask && !hasQcTask) {
      await createWorkflowTask(qcTask)
    }
  }

  const completeOutsourceWarehouseInboundTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_INBOUND_DONE_STATUS_KEY,
        reason || '仓库已确认委外回货入库'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_INBOUND_DONE_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        warehouse_task_id: task.id,
        inbound_result: 'done',
        inventory_balance_deferred: true,
        critical_path: true,
        outsource_processing: true,
      },
    })
    const payableRecord = {
      ...savedRecord,
      module_key: task.source_type,
      payload: {
        ...(savedRecord.payload || {}),
        inbound_result: 'done',
        payable_type: 'outsource',
        outsource_processing: true,
      },
    }
    const hasPayableTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP
    )
    const payableTask = buildOutsourcePayableRegistrationTask(
      payableRecord,
      task
    )
    let createdPayableTask = null
    if (payableTask && !hasPayableTask) {
      createdPayableTask = await createWorkflowTask(payableTask)
    }
    if (payableTask) {
      await upsertWorkflowBusinessState({
        source_type: task.source_type,
        source_id: savedRecord.id,
        source_no: savedRecord.document_no || task.source_no,
        business_status_key: OUTSOURCE_INBOUND_DONE_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          warehouse_task_id: task.id,
          payable_task_id: createdPayableTask?.id,
          inbound_result: 'done',
          notification_type: 'finance_pending',
          alert_type: 'payable_pending',
          next_module_key: 'payables',
          payable_type: 'outsource',
          outsource_processing: true,
        },
      })
    }
  }

  const completeOutsourceReworkTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
        reason || '委外返工 / 补做安排已确认'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
      owner_role_key: 'production',
      payload: {
        record_title: savedRecord.title,
        rework_task_id: task.id,
        rework_result: 'arranged',
        critical_path: true,
        outsource_processing: true,
      },
    })
  }

  const completeFinishedGoodsReworkTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
        reason || '成品返工安排已确认'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
      owner_role_key: 'production',
      payload: {
        record_title: savedRecord.title,
        rework_task_id: task.id,
        rework_result: 'arranged',
        critical_path: true,
        finished_goods: true,
      },
    })
  }

  const completeReceivableRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应出货或应收登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINANCE_RECONCILING_STATUS_KEY,
        reason || '应收登记已完成'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINANCE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        receivable_task_id: task.id,
        receivable_result: 'registered',
        notification_type: 'finance_pending',
        alert_type: 'invoice_pending',
        critical_path: false,
        next_module_key: 'invoices',
      },
    })
    const hasInvoiceTask = await hasActiveTaskForSource(
      task,
      INVOICE_REGISTRATION_TASK_GROUP
    )
    const invoiceTask = buildInvoiceRegistrationTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task
    )
    if (invoiceTask && !hasInvoiceTask) {
      await createWorkflowTask(invoiceTask)
    }
  }

  const completeInvoiceRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应应收或开票登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINANCE_RECONCILING_STATUS_KEY,
        reason || '开票登记已完成，进入对账中'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINANCE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        invoice_task_id: task.id,
        invoice_result: 'registered',
        critical_path: false,
        next_module_key: 'reconciliation',
      },
    })
  }

  const completePayableRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或应付登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        PAYABLE_RECONCILING_STATUS_KEY,
        reason || '应付登记已完成，进入对账'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: PAYABLE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        payable_task_id: task.id,
        payable_result: 'registered',
        notification_type: 'finance_pending',
        alert_type: 'reconciliation_pending',
        critical_path: false,
        next_module_key: 'reconciliation',
        payable_type: task.payload?.payable_type,
      },
    })

    const isOutsource = isOutsourcePayableRegistrationTask(task)
    const taskGroup = isOutsource
      ? OUTSOURCE_RECONCILIATION_TASK_GROUP
      : PURCHASE_RECONCILIATION_TASK_GROUP
    const hasReconciliationTask = await hasActiveTaskForSource(task, taskGroup)
    const reconciliationRecord = {
      ...savedRecord,
      module_key: task.source_type,
      payload: {
        ...(savedRecord.payload || {}),
        payable_type: isOutsource ? 'outsource' : 'purchase',
      },
    }
    const reconciliationTask = isOutsource
      ? buildOutsourceReconciliationTask(reconciliationRecord, task)
      : buildPurchaseReconciliationTask(reconciliationRecord, task)
    if (reconciliationTask && !hasReconciliationTask) {
      await createWorkflowTask(reconciliationTask)
    }
  }

  const completePayableReconciliationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或对账记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        PAYABLE_SETTLED_STATUS_KEY,
        reason || '财务对账已完成'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: PAYABLE_SETTLED_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        reconciliation_task_id: task.id,
        reconciliation_result: 'settled',
        payable_type: task.payload?.payable_type,
      },
    })
  }

  const blockFinanceTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应财务登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        'blocked',
        reason
      )) || record
    const state = buildFinanceBlockedState(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (state) {
      await upsertWorkflowBusinessState(state)
    }
  }

  const blockPayableFinanceTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应应付或对账记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        'blocked',
        reason
      )) || record
    const state = buildPayableBlockedState(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (state) {
      await upsertWorkflowBusinessState(state)
    }
  }

  const runOutsourceReturnFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey === 'production' &&
      isOutsourceReturnTrackingTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceReturnTrackingTask(task, reason)
      return
    }

    if (
      activeRoleKey === 'warehouse' &&
      isOutsourceWarehouseInboundTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceWarehouseInboundTask(task, reason)
      return
    }

    if (
      activeRoleKey === 'production' &&
      isOutsourceReworkTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceReworkTask(task, reason)
    }
  }

  const runFinishedGoodsFollowUp = async (task, taskStatusKey, reason = '') => {
    if (activeRoleKey === 'quality' && isFinishedGoodsQcTask(task)) {
      return
    }

    if (activeRoleKey === 'warehouse' && isFinishedGoodsInboundTask(task)) {
      return
    }

    if (activeRoleKey === 'warehouse' && isShipmentReleaseTask(task)) {
      return
    }

    if (
      activeRoleKey === 'production' &&
      isFinishedGoodsReworkTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeFinishedGoodsReworkTask(task, reason)
    }
  }

  const runShipmentFinanceFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey !== 'finance' ||
      (!isReceivableRegistrationTask(task) && !isInvoiceRegistrationTask(task))
    ) {
      return
    }

    if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
      await blockFinanceTask(task, reason)
      return
    }

    if (isReceivableRegistrationTask(task) && taskStatusKey === 'done') {
      await completeReceivableRegistrationTask(task, reason)
      return
    }

    if (isInvoiceRegistrationTask(task) && taskStatusKey === 'done') {
      await completeInvoiceRegistrationTask(task, reason)
    }
  }

  const runPayableReconciliationFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey !== 'finance' ||
      (!isPayableRegistrationTask(task) && !isPayableReconciliationTask(task))
    ) {
      return
    }

    if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
      await blockPayableFinanceTask(task, reason)
      return
    }

    if (isPayableRegistrationTask(task) && taskStatusKey === 'done') {
      await completePayableRegistrationTask(task, reason)
      return
    }

    if (isPayableReconciliationTask(task) && taskStatusKey === 'done') {
      await completePayableReconciliationTask(task, reason)
    }
  }

  const runTaskFollowUp = async (task, taskStatusKey, reason = '') => {
    await runOutsourceReturnFollowUp(task, taskStatusKey, reason)
    await runFinishedGoodsFollowUp(task, taskStatusKey, reason)
    await runShipmentFinanceFollowUp(task, taskStatusKey, reason)
    await runPayableReconciliationFollowUp(task, taskStatusKey, reason)
  }

  const moveTask = async (task, taskStatusKey) => {
    if (!canOperateTask(activeRoleKey, task)) {
      message.warning('当前角色只能查看该任务，不能代办完成')
      return false
    }
    const blockedReason = String(
      blockedReasonByTaskID[task.id] ?? task.blocked_reason ?? ''
    ).trim()
    const reasonRequired = ['blocked', 'rejected'].includes(taskStatusKey)
    if (reasonRequired && !blockedReason) {
      message.warning('请先填写阻塞或退回原因')
      return false
    }
    const nextBusinessStatusKey = resolveMobileTaskBusinessStatus(
      task,
      taskStatusKey
    )

    setUpdatingID(task.id)
    try {
      const updatedTask = await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: taskStatusKey,
        business_status_key: nextBusinessStatusKey,
        actor_role_key: activeRoleKey,
        reason: reasonRequired ? blockedReason : '',
        payload: {
          ...(task.payload || {}),
          mobile_role_key: activeRoleKey,
          approval_result:
            isOrderApprovalTask(task) && taskStatusKey === 'done'
              ? 'approved'
              : undefined,
          qc_result:
            (isPurchaseIqcTask(task) ||
              isOutsourceReturnQcTask(task) ||
              isFinishedGoodsQcTask(task)) &&
            taskStatusKey === 'done'
              ? 'pass'
              : undefined,
          shipment_release_result:
            isShipmentReleaseTask(task) && taskStatusKey === 'done'
              ? 'done'
              : undefined,
          receivable_result:
            isReceivableRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          invoice_result:
            isInvoiceRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          payable_result:
            isPayableRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          reconciliation_result:
            isPayableReconciliationTask(task) && taskStatusKey === 'done'
              ? 'settled'
              : undefined,
          rejected_reason:
            (isOrderApprovalTask(task) ||
              isPurchaseIqcTask(task) ||
              isOutsourceReturnQcTask(task) ||
              isFinishedGoodsQcTask(task) ||
              isShipmentReleaseTask(task) ||
              isReceivableRegistrationTask(task) ||
              isInvoiceRegistrationTask(task) ||
              isPayableRegistrationTask(task) ||
              isPayableReconciliationTask(task)) &&
            reasonRequired
              ? blockedReason
              : undefined,
        },
      })
      await runTaskFollowUp(
        updatedTask || {
          ...task,
          task_status_key: taskStatusKey,
          business_status_key: nextBusinessStatusKey,
        },
        taskStatusKey,
        reasonRequired ? blockedReason : ''
      )
      setBlockedReasonByTaskID((current) => {
        const next = { ...current }
        if (reasonRequired) {
          next[task.id] = blockedReason
        } else {
          delete next[task.id]
        }
        return next
      })
      message.success('任务状态已更新')
      await loadTasks()
      return true
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '更新任务状态失败，请稍后重试')
      )
      return false
    } finally {
      setUpdatingID(null)
    }
  }

  const urgeTask = async (task) => {
    if (!canUrgeTask(activeRoleKey, task)) {
      message.warning('当前角色没有催办该任务的权限')
      return false
    }
    const reason = String(urgeReasonByTaskID[task.id] || '').trim()
    if (!reason) {
      message.warning('请先填写催办原因')
      return false
    }

    setUrgingID(task.id)
    try {
      await urgeWorkflowTask({
        task_id: task.id,
        action: resolveMobileUrgeAction(activeRoleKey, task),
        reason,
        actor_role_key: activeRoleKey,
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          mobile_role_key: activeRoleKey,
        },
      })
      setUrgeReasonByTaskID((current) => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      message.success('催办已记录')
      await loadTasks()
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '催办失败，请稍后重试'))
      return false
    } finally {
      setUrgingID(null)
    }
  }

  const handleTaskAction = async (task, action) => {
    setSelectedTaskID(task.id)
    if (['blocked', 'rejected', 'urge'].includes(action)) {
      setDetailAction(action)
      return
    }
    setDetailAction(null)
    await moveTask(task, action)
  }

  const submitDetailAction = async () => {
    if (!selectedTask || !detailAction) return
    const actionCompleted =
      detailAction === 'urge'
        ? await urgeTask(selectedTask)
        : await moveTask(selectedTask, detailAction)
    if (actionCompleted) {
      setDetailAction(null)
    }
  }

  const roleLabel = getMobileRoleLabel(activeRoleKey)
  const latestSync = resolveLatestTaskTime(activeTasks)
  const selectedSeverity = selectedTask
    ? getTaskSeverityView(selectedTask)
    : null
  const selectedCanOperate = selectedTask
    ? canOperateTask(activeRoleKey, selectedTask)
    : false
  const selectedCanUrge = selectedTask
    ? canUrgeTask(activeRoleKey, selectedTask)
    : false
  const detailReasonValue = selectedTask
    ? detailAction === 'urge'
      ? urgeReasonByTaskID[selectedTask.id] || ''
      : blockedReasonByTaskID[selectedTask.id] || ''
    : ''

  const updateDetailReason = (value) => {
    if (!selectedTask) return
    if (detailAction === 'urge') {
      setUrgeReasonByTaskID((current) => ({
        ...current,
        [selectedTask.id]: value,
      }))
      return
    }
    setBlockedReasonByTaskID((current) => ({
      ...current,
      [selectedTask.id]: value,
    }))
  }

  const appendQuickReason = (value) => {
    const nextValue = detailReasonValue
      ? `${detailReasonValue}；${value}`
      : value
    updateDetailReason(nextValue)
  }

  const renderProgressPanel = () => (
    <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">进度</h2>
        <span className="text-sm text-slate-500">{progressPercent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-4 divide-x divide-slate-200 rounded-xl border border-slate-100 bg-slate-50 py-3 text-center">
        {[
          ['待处理', taskSummary.pending, FileTextOutlined],
          ['处理中', taskSummary.processing, ClockCircleOutlined],
          ['卡住', taskSummary.blockedProgress, PauseOutlined],
          ['完成', taskSummary.done, CheckSquareOutlined],
        ].map(([label, value, Icon]) => (
          <div key={label} className="space-y-1 px-2">
            <div className="text-xl font-semibold text-slate-950">{value}</div>
            <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
              <Icon />
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const renderTaskRow = (task) => {
    const severity = getTaskSeverityView(task)
    const isSelected = String(selectedTask?.id) === String(task.id)
    return (
      <button
        key={task.id}
        type="button"
        className={`erp-mobile-list-item grid w-full grid-cols-[64px_minmax(0,1fr)_94px] gap-3 px-5 py-4 text-left transition hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${severity.rowClass} ${
          isSelected ? 'ring-2 ring-emerald-500/40' : ''
        }`}
        onClick={() => {
          setSelectedTaskID(task.id)
          setDetailAction(null)
        }}
      >
        <div className="pt-1">
          <span
            className={`inline-flex min-w-[52px] items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold ${severity.badgeClass}`}
          >
            {severity.label}
          </span>
        </div>
        <div className="min-w-0">
          <div className="break-words text-base font-semibold leading-snug text-slate-950">
            {task.task_name}
          </div>
          <div className="mt-1 break-all text-sm leading-5 text-slate-500">
            {resolveTaskSourceLabel(task)}
          </div>
          <div className="mt-2 flex min-w-0 items-start gap-1 text-sm leading-5 text-slate-600">
            <UserOutlined className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words">
              {resolveTaskListMeta(task)}
            </span>
          </div>
          {task.blocked_reason ? (
            <div className="mt-1 text-sm leading-5 text-red-500">
              阻塞：{task.blocked_reason}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 text-right">
          <span className="inline-flex max-w-full items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-semibold leading-5 text-blue-600">
            <span className="truncate">{resolveTaskBusinessChip(task)}</span>
          </span>
          <div
            className={`mt-2 break-words text-sm leading-5 ${severity.timeClass}`}
          >
            {task.due_at_label || task.due_status_label || '-'}
          </div>
        </div>
      </button>
    )
  }

  const renderTabSummary = () => {
    const summaryByTab = {
      [MOBILE_MAIN_TAB_KEYS.TODO]: `共 ${activeTasks.length} 条待处理`,
      [MOBILE_MAIN_TAB_KEYS.DONE]: `共 ${doneTasks.length} 条已办`,
      [MOBILE_MAIN_TAB_KEYS.MESSAGES]: `共 ${
        warningTasks.length + noticeTasks.length
      } 条消息`,
      [MOBILE_MAIN_TAB_KEYS.MINE]: `${roleLabel}任务端`,
    }
    return summaryByTab[activeMainTabKey] || summaryByTab.todo
  }

  const renderTaskMetricCards = () => (
    <section className="mx-5 mt-5 grid grid-cols-4 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-5 text-center shadow-sm">
      {[
        ['我的预警', taskSummary.alerts, 'text-orange-500'],
        ['已超时', taskSummary.overdue, 'text-red-500'],
        ['即将超时', taskSummary.dueSoon, 'text-slate-600'],
        [
          '阻塞/高优先',
          `${taskSummary.blocked}/${taskSummary.highPriority}`,
          'text-red-500',
        ],
      ].map(([label, value, colorClass]) => (
        <div key={label} className="min-w-0 px-2">
          <div className={`text-4xl font-semibold leading-tight ${colorClass}`}>
            {value}
          </div>
          <div className="mt-1 text-base text-slate-600">{label}</div>
        </div>
      ))}
    </section>
  )

  const renderTaskFilters = () => (
    <div className="mx-5 mt-4 grid grid-cols-4 rounded-2xl bg-slate-100 p-1 shadow-inner">
      {filterItems.map((item) => {
        const active = item.key === activeFilterKey
        return (
          <button
            key={item.key}
            type="button"
            className={`min-w-0 rounded-xl px-2 py-3 text-base font-semibold transition ${
              active
                ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500'
            }`}
            onClick={() => {
              setActiveFilterKey(item.key)
              setSelectedTaskID(null)
              setDetailAction(null)
            }}
          >
            <span className="truncate">
              {item.label}({item.count})
            </span>
          </button>
        )
      })}
    </div>
  )

  const renderTodoPanel = () => (
    <>
      {renderTaskMetricCards()}
      {renderTaskFilters()}
      <section className="mx-5 mt-5 pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_112px] pb-2 text-base text-slate-500">
          <span>任务信息</span>
          <span className="text-right">业务状态 / 截止时间</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filteredTasks.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              当前筛选下暂无任务
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredTasks.map(renderTaskRow)}
            </div>
          )}
        </div>
      </section>
    </>
  )

  const renderDoneTaskItem = (task) => (
    <div
      key={task.id}
      className="erp-mobile-list-item rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-base font-semibold text-slate-950">
            {task.task_name}
          </div>
          <div className="mt-1 break-all text-sm text-slate-500">
            {resolveTaskSourceLabel(task)}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">
          {task.task_status_label}
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-500">
        更新时间：{formatMobileTaskTime(task.updated_at)}
      </div>
    </div>
  )

  const renderDonePanel = () => (
    <section className="mx-5 mt-5 space-y-4 pb-5">
      {renderProgressPanel()}
      <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">已办任务</h2>
        <div className="mt-3 space-y-3">
          {doneTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500">
              暂无已办任务
            </div>
          ) : (
            doneTasks.slice(0, 20).map(renderDoneTaskItem)
          )}
        </div>
      </section>
    </section>
  )

  const renderMessagesPanel = () => (
    <section className="mx-5 mt-5 space-y-4 pb-5">
      <section className="erp-mobile-card rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
        <h2 className="text-lg font-semibold text-slate-950">预警</h2>
        <div className="mt-3 space-y-2">
          {warningTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-sm text-slate-500">
              暂无预警任务
            </div>
          ) : (
            warningTasks.slice(0, 8).map((task) => (
              <button
                key={task.id}
                type="button"
                className="w-full rounded-xl border border-amber-200 bg-white/80 px-3 py-3 text-left"
                onClick={() => setSelectedTaskID(task.id)}
              >
                <div className="font-semibold text-amber-800">
                  {getTaskQueueTone(task)}
                </div>
                <div className="mt-1 text-sm text-slate-900">
                  {task.task_name}
                </div>
                <div className="mt-1 break-all text-xs text-amber-700">
                  {resolveTaskSourceLabel(task)}
                </div>
                {task.blocked_reason ? (
                  <div className="mt-1 text-sm text-red-600">
                    {task.blocked_reason}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">通知</h2>
        <div className="mt-3 space-y-2">
          {noticeTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
              暂无通知
            </div>
          ) : (
            noticeTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-left"
                onClick={() => setSelectedTaskID(task.id)}
              >
                <span className="min-w-0 text-sm font-medium text-slate-700">
                  {task.task_name}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatMobileTaskTime(task.updated_at)}
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  )

  const renderMinePanel = () => {
    const roleNames = (adminProfile?.roles || [])
      .map((role) => role?.name || role?.role_key)
      .filter(Boolean)
      .join(' / ')
    return (
      <section className="mx-5 mt-5 space-y-4 pb-5">
        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700">
              <UserOutlined />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold text-slate-950">
                {adminProfile?.username || '当前账号'}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {roleLabel}任务端
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="text-slate-500">账号角色</div>
              <div className="mt-1 min-w-0 break-words font-semibold text-slate-950">
                {roleNames || '-'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="text-slate-500">权限模式</div>
              <div className="mt-1 font-semibold text-slate-950">
                {adminProfile?.is_super_admin ? '超级管理员' : '角色授权'}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3">
          {[
            ['待办', activeTasks.length],
            ['已办', doneTasks.length],
            ['预警', taskSummary.alerts],
            ['高优先', taskSummary.highPriority],
          ].map(([label, value]) => (
            <div key={label} className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>{value}</div>
              <div className={mobileTheme.metricLabel}>{label}</div>
            </div>
          ))}
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">登录与安全</h2>
          <button
            type="button"
            data-testid="mobile-role-logout-button"
            className={`${mobileTheme.logoutButton} mt-4 w-full`}
            onClick={handleLogout}
            disabled={loggingOut || typeof handleLogout !== 'function'}
          >
            <LogoutOutlined aria-hidden="true" />
            <span>{loggingOut ? '退出中' : '退出登录'}</span>
          </button>
        </section>
      </section>
    )
  }

  const renderActiveTabPanel = () => {
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.DONE) {
      return renderDonePanel()
    }
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MESSAGES) {
      return renderMessagesPanel()
    }
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MINE) {
      return renderMinePanel()
    }
    return renderTodoPanel()
  }

  const renderBottomNavigation = () => (
    <nav
      className="mobile-role-bottom-nav"
      aria-label="移动端主导航"
      data-testid="mobile-role-bottom-nav"
    >
      {MOBILE_MAIN_TAB_ITEMS.map(({ key, label, Icon }) => {
        const active = key === activeMainTabKey
        return (
          <button
            key={key}
            type="button"
            data-testid={`mobile-role-nav-${key}`}
            aria-current={active ? 'page' : undefined}
            className={`mobile-role-bottom-nav__item ${
              active ? 'mobile-role-bottom-nav__item--active' : ''
            }`}
            onClick={() => setActiveMainTabKey(key)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )

  const renderListScreen = () => {
    const activeTabLabel =
      MOBILE_MAIN_TAB_ITEMS.find((item) => item.key === activeMainTabKey)
        ?.label || '待办'

    return (
      <div className="mobile-role-tasks-page mobile-role-tasks-page--tabs surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
        <div
          className="mobile-role-tasks-page__scroll"
          data-testid="mobile-role-scroll"
        >
          <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-8">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="shrink-0 text-4xl font-semibold tracking-normal text-slate-950">
                {activeTabLabel}
              </h1>
              <span className="inline-flex shrink-0 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-base font-semibold text-emerald-700">
                {roleLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ERPThemeToggle size="small" variant="menu" />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-base font-semibold text-emerald-700"
                onClick={loadTasks}
                disabled={loading}
              >
                <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                <span>{loading ? '刷新中' : '刷新'}</span>
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3 px-5 text-sm text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span>最后同步：{latestSync}</span>
            <span className="text-slate-300">|</span>
            <span>{renderTabSummary()}</span>
          </div>

          {renderActiveTabPanel()}
        </div>

        {renderBottomNavigation()}
      </div>
    )
  }

  const renderDetailScreen = () => {
    if (!selectedTask || !selectedSeverity) return null
    const factRows = buildTaskFactRows(selectedTask)
    const relatedSource = resolveTaskSourceLabel(selectedTask)
    const showRejected = supportsRejectedAction(activeRoleKey, selectedTask)
    const isUpdating = updatingID === selectedTask.id
    const isUrging = urgingID === selectedTask.id

    return (
      <div className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
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
            <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200">
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
            <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-lg font-semibold text-red-700">
              <ExclamationCircleFilled className="mr-2" />
              {selectedTask.business_status_label || '任务需要处理'}
              {selectedTask.blocked_reason
                ? ` · ${selectedTask.blocked_reason}`
                : ' · 需要确认后继续流转'}
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
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-600">
              <span className="min-w-0 break-all">订单：{relatedSource}</span>
              <span className="shrink-0 text-slate-400">&gt;</span>
            </div>
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
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4">
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
                    任务已流转至 {roleLabel} /{' '}
                    {selectedTask.owner_role_key || '-'}
                  </div>
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
            className="rounded-xl bg-blue-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'processing')}
          >
            <CaretRightOutlined className="mr-2" />
            处理
          </button>
          <button
            type="button"
            className="rounded-xl bg-orange-500 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'blocked')}
          >
            <PauseOutlined className="mr-2" />
            阻塞
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'done')}
          >
            <CheckOutlined className="mr-2" />
            完成
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-lg font-semibold text-slate-700 disabled:opacity-50"
            disabled={!selectedCanUrge || isUrging}
            onClick={() => handleTaskAction(selectedTask, 'urge')}
          >
            <BellOutlined className="mr-2" />
            催办
          </button>
          {showRejected ? (
            <button
              type="button"
              className="col-span-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-base font-semibold text-red-600 disabled:opacity-50"
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

  return selectedTask ? renderDetailScreen() : renderListScreen()
}
