import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  DownOutlined,
  EditOutlined,
  ExperimentOutlined,
  ExportOutlined,
  InboxOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SendOutlined,
  SettingOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { message } from '@/common/utils/antdApp'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  createBusinessRecord,
  deleteBusinessRecords,
  listBusinessRecords,
  restoreBusinessRecord,
  updateBusinessRecord,
} from '../api/businessRecordApi.mjs'
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  upsertWorkflowBusinessState,
} from '../api/workflowApi.mjs'
import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
  getBusinessStatusTransitionOptions,
  requiresBusinessStatusReason,
} from '../config/workflowStatus.mjs'
import {
  BUSINESS_ROLE_OPTIONS,
  getBusinessRecordDefinition,
  roleLabelMap,
} from '../config/businessRecordDefinitions.mjs'
import {
  ITEM_FIELD_KEYS,
  buildBusinessRecordParams,
  buildBusinessRecordStatusUpdateParams,
  createBlankItem,
  createBlankFieldValue,
  formatMetric,
  getBusinessRecordFieldValue,
  summarizeRecordItems,
} from '../utils/businessRecordForm.mjs'
import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  getModuleColumnKey,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { sortModuleRecords } from '../utils/moduleRecordSort.mjs'
import {
  buildLinkedNavigationQuery,
  getLinkedTargets,
  matchesLinkedRecord,
  parseModuleTableQuery,
} from '../utils/linkedNavigation.mjs'
import {
  normalizeBusinessStatusKeys,
  parseBusinessModuleQuery,
} from '../utils/businessModuleNavigation.mjs'
import {
  buildBusinessRecordPrintDraft,
  getBusinessRecordPrintTemplate,
} from '../utils/businessRecordPrintDraft.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'
import { buildWorkflowTaskAlert } from '../utils/workflowDashboardStats.mjs'
import {
  ORDER_APPROVAL_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  PROJECT_ORDER_MODULE_KEY,
  buildBossApprovalTaskFromProjectOrder,
  isOrderApprovalTask,
} from '../utils/orderApprovalFlow.mjs'
import {
  ACCESSORIES_PURCHASE_MODULE_KEY,
  INBOUND_MODULE_KEY,
  IQC_PENDING_STATUS_KEY,
  buildIqcTaskFromArrivalRecord,
  isPurchaseIqcTask,
} from '../utils/purchaseInboundFlow.mjs'
import {
  BusinessDataTable,
  BusinessFilterPanel,
  BusinessListToolbar,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'

const { Text } = Typography
const DEFAULT_PAGE_SIZE = 8
const SORT_ORDER_OPTIONS = [
  { label: '最新优先', value: 'desc' },
  { label: '最早优先', value: 'asc' },
]
const MODULE_TABLE_COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const MODULE_TABLE_HEADER_ACTION_WIDTH = 24
const MODULE_TABLE_HEADER_GAP = 6
const MODULE_TABLE_HEADER_SAFE_PADDING = 32
const EMPTY_COLUMN_ORDER = []
const STATUS_OPTIONS = BUSINESS_WORKFLOW_STATES.map((state) => ({
  label: state.label,
  value: state.key,
}))
const TASK_STATUS_LABELS = new Map(
  TASK_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const BUSINESS_STATUS_LABELS = new Map(
  BUSINESS_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const ROLE_OPTIONS = BUSINESS_ROLE_OPTIONS.map((role) => ({
  label: role.label,
  value: role.key,
}))
const ITEM_CARD_STYLES = {
  marginBottom: 4,
  borderRadius: 12,
  borderColor: '#e5e7eb',
  background: '#fafafa',
}
const ITEM_CARD_HEADER_STYLES = {
  minHeight: 44,
  padding: '0 16px',
  borderBottom: '1px solid #f0f0f0',
}
const ITEM_CARD_BODY_STYLES = {
  padding: 16,
}
const ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH = 64
const CALCULATION_GUIDE_PATH = '/erp/docs/calculation-guide'
const COMPACT_SUMMARY_GROUPS = Object.freeze([
  { key: 'customer_name', label: '客户' },
  { key: 'supplier_name', label: '供应商 / 加工厂' },
  {
    key: 'owner_role_key',
    label: '主责角色',
    resolveLabel: (value) => roleLabelMap.get(value) || value,
  },
])
const NUMBER_FIELDS = new Set(['quantity', 'amount'])
const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
const ACTIVE_APPROVAL_TASK_STATUS_KEYS = new Set([
  'pending',
  'ready',
  'processing',
])
const TASK_STATUS_BY_BUSINESS_STATUS = Object.freeze({
  blocked: 'blocked',
  cancelled: 'cancelled',
  closed: 'closed',
})

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function estimateModuleHeaderTextWidth(text = '') {
  return [...String(text)].reduce((sum, char) => {
    if (/[\u4e00-\u9fff]/u.test(char)) return sum + 16
    if (/[A-Z0-9]/u.test(char)) return sum + 9
    if (/[a-z]/u.test(char)) return sum + 8
    return sum + 10
  }, 0)
}

function resolveModuleHeaderMinWidth(titleText = '') {
  return Math.max(
    108,
    Math.ceil(
      estimateModuleHeaderTextWidth(titleText) +
        MODULE_TABLE_HEADER_ACTION_WIDTH +
        MODULE_TABLE_HEADER_GAP +
        MODULE_TABLE_HEADER_SAFE_PADDING
    )
  )
}

function buildColumnOrderStorageKey(moduleKey) {
  return `${MODULE_TABLE_COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
}

function isDefaultColumnOrder(columns = [], order = []) {
  const fallbackOrder = buildModuleColumnOrder(columns)
  const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
  const normalizedOrder =
    sanitizedOrder.length > 0 ? sanitizedOrder : fallbackOrder
  return (
    normalizedOrder.length === fallbackOrder.length &&
    normalizedOrder.every((key, index) => key === fallbackOrder[index])
  )
}

function readAccountColumnOrder(adminProfile, moduleKey, columns = []) {
  const rawOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedOrder = sanitizeModuleColumnOrder(rawOrder, columns)
  return sanitizedOrder.length > 0 ? sanitizedOrder : EMPTY_COLUMN_ORDER
}

function readStoredColumnOrder(moduleKey, columns = []) {
  const fallbackOrder = buildModuleColumnOrder(columns)
  if (!moduleKey || typeof window === 'undefined' || !window.localStorage) {
    return fallbackOrder
  }
  try {
    const raw = window.localStorage.getItem(
      buildColumnOrderStorageKey(moduleKey)
    )
    if (!raw) {
      return fallbackOrder
    }
    const parsed = JSON.parse(raw)
    const sanitizedOrder = sanitizeModuleColumnOrder(parsed, columns)
    return sanitizedOrder.length > 0 ? sanitizedOrder : fallbackOrder
  } catch {
    return fallbackOrder
  }
}

function persistColumnOrder(moduleKey, columns = [], nextOrder = []) {
  if (!moduleKey || typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const fallbackOrder = buildModuleColumnOrder(columns)
  const sanitizedOrder = sanitizeModuleColumnOrder(nextOrder, columns)
  const normalizedOrder =
    sanitizedOrder.length > 0 ? sanitizedOrder : fallbackOrder
  try {
    const storageKey = buildColumnOrderStorageKey(moduleKey)
    if (isDefaultColumnOrder(columns, normalizedOrder)) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(normalizedOrder))
  } catch {
    // 本地缓存只作为账号同步失败时的体验兜底，写入失败时保留当前页内状态即可。
  }
}

function openNativeDatePicker(event) {
  event.currentTarget?.showPicker?.()
}

function sumRecords(records, key) {
  return records.reduce((sum, record) => {
    const value = Number(record?.[key])
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
}

function summarizeCompactGroup(records, group) {
  const counts = new Map()
  records.forEach((record) => {
    const rawValue = record?.[group.key]
    if (rawValue === null || rawValue === undefined || rawValue === '') return
    const resolvedValue = group.resolveLabel
      ? group.resolveLabel(rawValue)
      : String(rawValue)
    const value = String(resolvedValue || '').trim()
    if (!value) return
    counts.set(value, (counts.get(value) || 0) + 1)
  })
  const allItems = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label)
    )
  return {
    ...group,
    items: allItems.slice(0, 4),
    hiddenCount: Math.max(0, allItems.length - 4),
  }
}

function createDefaultValues(moduleItem, definition) {
  const values = {
    document_no: '',
    title: '',
    source_no: '',
    customer_name: '',
    supplier_name: '',
    style_no: '',
    product_no: '',
    product_name: '',
    material_name: '',
    warehouse_location: '',
    quantity: null,
    unit: '',
    amount: null,
    document_date: '',
    due_date: '',
    business_status_key: definition.defaultBusinessStatus,
    owner_role_key: definition.defaultOwnerRole,
    note: '',
    module_key: moduleItem.key,
    items: [createBlankItem(definition)],
  }
  ;(definition.formFields || []).forEach((field) => {
    if (!field.key || field.key in values) return
    values[field.key] = createBlankFieldValue(field)
  })
  return values
}

function formValuesFromRecord(record, moduleItem, definition) {
  const values = createDefaultValues(moduleItem, definition)
  Object.keys(values).forEach((key) => {
    if (key in record) {
      values[key] = record[key]
      return
    }
    const fieldValue = getBusinessRecordFieldValue(record, key)
    if (fieldValue !== undefined) {
      values[key] = fieldValue
    }
  })
  values.note = record?.payload?.note || ''
  values.items =
    Array.isArray(record?.items) && record.items.length > 0
      ? record.items.map((item) => ({
          ...createBlankItem(definition),
          ...Object.fromEntries(
            ITEM_FIELD_KEYS.map((key) => [key, item?.[key] ?? ''])
          ),
        }))
      : [createBlankItem(definition)]
  return values
}

function downloadCSV(filename, rows, columns) {
  const header = columns.map((column) => column.label)
  const body = rows.map((row) =>
    columns.map((column) => {
      const text = displayValue(row[column.key])
      return `"${text.replaceAll('"', '""')}"`
    })
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function renderFormField(field) {
  if (field.type === 'number') {
    return (
      <InputNumber
        min={0}
        style={{ width: '100%' }}
        placeholder={field.placeholder}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <Input
        type="date"
        onClick={openNativeDatePicker}
        style={{ cursor: 'pointer' }}
      />
    )
  }
  if (Array.isArray(field.options) && field.options.length > 0) {
    return (
      <Select
        allowClear
        options={field.options}
        placeholder={field.placeholder || `请选择${field.label}`}
      />
    )
  }
  return <Input placeholder={field.placeholder || `请输入${field.label}`} />
}

function renderItemField(field) {
  if (field.type === 'number') {
    return (
      <InputNumber
        min={0}
        style={{ width: '100%' }}
        placeholder={field.placeholder}
      />
    )
  }
  return <Input placeholder={field.placeholder || field.label} />
}

function resolveBusinessRecordItemDesktopSpan() {
  return 6
}

function resolveBusinessRecordItemRowMinWidth(fields = []) {
  const spanBudget = fields.reduce(
    (sum, field) => sum + resolveBusinessRecordItemDesktopSpan(field),
    0
  )
  return Math.max(0, spanBudget * ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH)
}

function resolveBusinessRecordFieldColProps(field) {
  if (field.type === 'number') {
    return { xs: 24, md: 12, xl: 6 }
  }
  return { xs: 24, md: 12, xl: 8 }
}

export default function BusinessModulePage({ moduleItem }) {
  const location = useLocation()
  const navigate = useNavigate()
  const outletContext = useOutletContext()
  const { adminProfile, updateAdminERPPreferences } = outletContext || {}
  const moduleTableNavigationQuery = useMemo(
    () => parseModuleTableQuery(location.search),
    [location.search]
  )
  const businessModuleNavigationQuery = useMemo(
    () => parseBusinessModuleQuery(location.search),
    [location.search]
  )
  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'admin',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )
  const [form] = Form.useForm()
  const [statusReasonForm] = Form.useForm()
  const definition = useMemo(
    () => getBusinessRecordDefinition(moduleItem),
    [moduleItem]
  )
  const availableDateFilters = useMemo(
    () =>
      Array.isArray(definition.dateFilterOptions)
        ? definition.dateFilterOptions
        : [],
    [definition.dateFilterOptions]
  )
  const defaultDateFilterKey = availableDateFilters[0]?.key || ''
  const watchedItems = Form.useWatch('items', form)
  const [records, setRecords] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [businessStatusSaving, setBusinessStatusSaving] = useState(false)
  const [keyword, setKeyword] = useState(
    () => moduleTableNavigationQuery.keyword
  )
  const [statusFilterKeys, setStatusFilterKeys] = useState(
    () => businessModuleNavigationQuery.businessStatusKeys
  )
  const [dateFilterKey, setDateFilterKey] = useState(defaultDateFilterKey)
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [recycleModalOpen, setRecycleModalOpen] = useState(false)
  const [recycleLoading, setRecycleLoading] = useState(false)
  const [recycleRecords, setRecycleRecords] = useState([])
  const [recycleSelectedRowKeys, setRecycleSelectedRowKeys] = useState([])
  const [recycleRestoring, setRecycleRestoring] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false)
  const [batchDeleteReason, setBatchDeleteReason] = useState('')
  const [batchDeleteSubmitting, setBatchDeleteSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [linkModalState, setLinkModalState] = useState({
    open: false,
    sourceCode: '',
    targets: [],
  })
  const [statusReasonModalOpen, setStatusReasonModalOpen] = useState(false)
  const [pendingStatusKey, setPendingStatusKey] = useState('')
  const [orderApprovalSubmitting, setOrderApprovalSubmitting] = useState(false)
  const [iqcSubmitting, setIqcSubmitting] = useState(false)
  const [columnOrderModalOpen, setColumnOrderModalOpen] = useState(false)
  const [columnOrderKeys, setColumnOrderKeys] = useState(() =>
    readStoredColumnOrder(moduleItem.key, definition.tableColumns)
  )
  const columnOrderBootstrapKeyRef = useRef('')
  const columnOrderSyncInFlightRef = useRef(false)
  const pendingColumnOrderSyncRef = useRef(null)
  const scopedLinkMatchFields = useMemo(() => {
    const trimmedKeyword = keyword.trim()
    if (
      !trimmedKeyword ||
      trimmedKeyword !== moduleTableNavigationQuery.keyword
    ) {
      return []
    }
    return moduleTableNavigationQuery.matchFields
  }, [keyword, moduleTableNavigationQuery])
  const filteredRecords = useMemo(() => {
    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword || scopedLinkMatchFields.length === 0) {
      return records
    }
    return records.filter((record) =>
      matchesLinkedRecord(record, trimmedKeyword, scopedLinkMatchFields)
    )
  }, [keyword, records, scopedLinkMatchFields])
  const sortedRecords = useMemo(
    () => sortModuleRecords(filteredRecords, sortOrder),
    [filteredRecords, sortOrder]
  )

  const selectedRecord = useMemo(() => {
    if (selectedRowKeys.length !== 1) {
      return null
    }
    return (
      sortedRecords.find(
        (record) => String(record.id) === String(selectedRowKeys[0])
      ) || null
    )
  }, [selectedRowKeys, sortedRecords])
  const selectedRecordDisplayText = useMemo(() => {
    if (selectedRecord) {
      const recordNo = selectedRecord.document_no || selectedRecord.id
      const recordTitle = selectedRecord.title || '未命名记录'
      return `${recordNo} / ${recordTitle}`
    }
    if (selectedRowKeys.length > 1) {
      return `已选择 ${selectedRowKeys.length} 条记录，请保留 1 条后再做单条操作`
    }
    return '请先单击或勾选一条记录'
  }, [selectedRecord, selectedRowKeys.length])
  const selectedRecordLinkedTargets = useMemo(
    () => getLinkedTargets(moduleItem.key, selectedRecord),
    [moduleItem.key, selectedRecord]
  )
  const isProjectOrderModule = moduleItem.key === PROJECT_ORDER_MODULE_KEY
  const selectedRecordTasks = useMemo(() => {
    if (!selectedRecord) return []
    return tasks.filter(
      (task) =>
        String(task.source_type || '') === moduleItem.key &&
        String(task.source_id) === String(selectedRecord.id)
    )
  }, [moduleItem.key, selectedRecord, tasks])
  const selectedOrderApprovalTasks = useMemo(
    () => selectedRecordTasks.filter(isOrderApprovalTask),
    [selectedRecordTasks]
  )
  const selectedActiveOrderApprovalTask = useMemo(
    () =>
      selectedOrderApprovalTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedOrderApprovalTasks]
  )
  const latestSelectedOrderApprovalTask = useMemo(
    () =>
      [...selectedOrderApprovalTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedOrderApprovalTasks]
  )
  const isPurchaseInboundFlowModule = [
    ACCESSORIES_PURCHASE_MODULE_KEY,
    INBOUND_MODULE_KEY,
  ].includes(moduleItem.key)
  const selectedIqcTasks = useMemo(
    () => selectedRecordTasks.filter(isPurchaseIqcTask),
    [selectedRecordTasks]
  )
  const selectedActiveIqcTask = useMemo(
    () =>
      selectedIqcTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedIqcTasks]
  )
  const latestSelectedIqcTask = useMemo(
    () =>
      [...selectedIqcTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedIqcTasks]
  )
  const printTemplate = useMemo(
    () => getBusinessRecordPrintTemplate(moduleItem.key),
    [moduleItem.key]
  )
  const activeRecords = useMemo(
    () => filteredRecords.filter((record) => !record.deleted_at),
    [filteredRecords]
  )
  const metricKey = definition.summaryMetric
  const metricTotal = useMemo(
    () => sumRecords(activeRecords, metricKey),
    [activeRecords, metricKey]
  )
  const compactSummaryGroups = useMemo(
    () =>
      COMPACT_SUMMARY_GROUPS.map((group) =>
        summarizeCompactGroup(activeRecords, group)
      ).filter((group) => group.items.length > 0),
    [activeRecords]
  )
  const itemSummary = useMemo(
    () => summarizeRecordItems(watchedItems, definition.itemFields),
    [definition.itemFields, watchedItems]
  )
  const moduleTaskAlerts = useMemo(
    () =>
      tasks
        .map((task) => buildWorkflowTaskAlert(task))
        .filter(Boolean)
        .slice(0, 5),
    [tasks]
  )
  const businessStatusTransitionMenuItems = useMemo(
    () =>
      getBusinessStatusTransitionOptions(
        selectedRecord?.business_status_key
      ).map((option) => ({
        key: option.value,
        label: (
          <div className="erp-business-status-transition-option">
            <strong>{option.label}</strong>
            <span>{option.summary}</span>
          </div>
        ),
      })),
    [selectedRecord?.business_status_key]
  )
  const isBusinessStatusTransitionDisabled =
    !selectedRecord ||
    businessStatusSaving ||
    businessStatusTransitionMenuItems.length === 0
  const activeDateFilterKey = useMemo(
    () =>
      availableDateFilters.some((item) => item.key === dateFilterKey)
        ? dateFilterKey
        : defaultDateFilterKey,
    [availableDateFilters, dateFilterKey, defaultDateFilterKey]
  )

  useEffect(() => {
    setDateFilterKey((current) =>
      availableDateFilters.some((item) => item.key === current)
        ? current
        : defaultDateFilterKey
    )
  }, [availableDateFilters, defaultDateFilterKey])

  const syncWorkflowStateForRecord = useCallback(
    async (record, options = {}) => {
      if (!record?.id) return
      const reason = String(options.reason || '').trim()
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: record.id,
        source_no: record.document_no,
        business_status_key: record.business_status_key,
        owner_role_key: record.owner_role_key,
        blocked_reason:
          requiresBusinessStatusReason(record.business_status_key) && reason
            ? reason
            : undefined,
        payload: {
          record_title: record.title,
          module_title: moduleItem.title,
          status_reason: reason || undefined,
        },
      })
    },
    [moduleItem.key, moduleItem.title]
  )

  const syncWorkflowTasksForBusinessStatus = useCallback(
    async (record, nextStatusKey, reason = '') => {
      const nextTaskStatusKey = TASK_STATUS_BY_BUSINESS_STATUS[nextStatusKey]
      if (!record?.id || !nextTaskStatusKey) return

      const taskData = await listWorkflowTasks({
        source_type: moduleItem.key,
        source_id: record.id,
        limit: 200,
      })
      const relatedTasks = (taskData.tasks || []).filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      )
      await Promise.all(
        relatedTasks.map((task) =>
          updateWorkflowTaskStatus({
            id: task.id,
            task_status_key: nextTaskStatusKey,
            business_status_key: nextStatusKey,
            reason,
            payload: {
              ...(task.payload || {}),
              business_status_key: nextStatusKey,
              business_status_reason: reason || '',
            },
          })
        )
      )
    },
    [moduleItem.key]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [recordData, taskData] = await Promise.all([
        listBusinessRecords({
          module_key: moduleItem.key,
          keyword,
          business_status_keys: statusFilterKeys,
          date_filter_key: activeDateFilterKey,
          date_range_start: dateRangeStart,
          date_range_end: dateRangeEnd,
          sort_order: sortOrder,
          limit: 200,
        }),
        listWorkflowTasks({
          source_type: moduleItem.key,
          limit: 200,
        }),
      ])
      setRecords(recordData.records || [])
      setTasks(taskData.tasks || [])
      setSelectedRowKeys((current) =>
        current.filter((key) =>
          (recordData.records || []).some((record) => record.id === key)
        )
      )
      return true
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '加载业务记录失败，请稍后重试')
      )
      return false
    } finally {
      setLoading(false)
    }
  }, [
    activeDateFilterKey,
    dateRangeEnd,
    dateRangeStart,
    keyword,
    moduleItem.key,
    sortOrder,
    statusFilterKeys,
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setKeyword(moduleTableNavigationQuery.keyword)
  }, [moduleTableNavigationQuery.keyword])

  useEffect(() => {
    setStatusFilterKeys(businessModuleNavigationQuery.businessStatusKeys)
    setSelectedRowKeys([])
  }, [businessModuleNavigationQuery.businessStatusKeys, moduleItem.key])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadData)
  }, [loadData, outletContext])

  const orderedTableColumnDefinitions = useMemo(
    () => applyModuleColumnOrder(definition.tableColumns, columnOrderKeys),
    [columnOrderKeys, definition.tableColumns]
  )
  const syncColumnOrderToAccount = useCallback(
    (nextOrder) => {
      if (!adminProfile?.id) {
        return
      }
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        definition.tableColumns
      )
      pendingColumnOrderSyncRef.current = isDefaultColumnOrder(
        definition.tableColumns,
        sanitizedOrder
      )
        ? []
        : sanitizedOrder
      if (columnOrderSyncInFlightRef.current) {
        return
      }
      columnOrderSyncInFlightRef.current = true
      const flushSyncQueue = async () => {
        while (pendingColumnOrderSyncRef.current) {
          const orderToPersist = pendingColumnOrderSyncRef.current
          pendingColumnOrderSyncRef.current = null
          try {
            const result = await adminRpc.call('set_erp_column_order', {
              module_key: moduleItem.key,
              order: orderToPersist,
            })
            const nextERPPreferences = result?.data?.erp_preferences
            if (!pendingColumnOrderSyncRef.current && nextERPPreferences) {
              updateAdminERPPreferences?.(nextERPPreferences)
            }
          } catch (error) {
            message.error(getActionErrorMessage(error, '同步列顺序'))
            break
          }
        }
        columnOrderSyncInFlightRef.current = false
        if (pendingColumnOrderSyncRef.current) {
          syncColumnOrderToAccount(pendingColumnOrderSyncRef.current)
        }
      }
      flushSyncQueue().catch(() => {
        columnOrderSyncInFlightRef.current = false
      })
    },
    [
      adminProfile?.id,
      adminRpc,
      definition.tableColumns,
      moduleItem.key,
      updateAdminERPPreferences,
    ]
  )
  const updateColumnOrder = useCallback(
    (updater) => {
      setColumnOrderKeys((prev) => {
        const nextOrder = updater(prev)
        persistColumnOrder(moduleItem.key, definition.tableColumns, nextOrder)
        syncColumnOrderToAccount(nextOrder)
        return nextOrder
      })
    },
    [definition.tableColumns, moduleItem.key, syncColumnOrderToAccount]
  )
  const resolveModuleColumnKey = useCallback(
    (column) => {
      const originalIndex = definition.tableColumns.indexOf(column)
      return getModuleColumnKey(column, originalIndex >= 0 ? originalIndex : 0)
    },
    [definition.tableColumns]
  )
  const handleMoveColumnOrder = useCallback(
    (columnKey, direction) => {
      updateColumnOrder((prev) =>
        moveModuleColumnOrder(
          prev,
          definition.tableColumns,
          columnKey,
          direction
        )
      )
    },
    [definition.tableColumns, updateColumnOrder]
  )
  const handleRepositionColumnOrder = useCallback(
    (columnKey, targetIndex) => {
      updateColumnOrder((prev) =>
        repositionModuleColumnOrder(
          prev,
          definition.tableColumns,
          columnKey,
          targetIndex
        )
      )
    },
    [definition.tableColumns, updateColumnOrder]
  )
  const handleResetColumnOrder = useCallback(() => {
    const nextOrder = buildModuleColumnOrder(definition.tableColumns)
    setColumnOrderKeys(nextOrder)
    persistColumnOrder(moduleItem.key, definition.tableColumns, nextOrder)
    syncColumnOrderToAccount(nextOrder)
  }, [definition.tableColumns, moduleItem.key, syncColumnOrderToAccount])

  useEffect(() => {
    const accountOrder = readAccountColumnOrder(
      adminProfile,
      moduleItem.key,
      definition.tableColumns
    )
    const bootstrapKey = [
      adminProfile?.id || 'anonymous',
      moduleItem.key,
      JSON.stringify(accountOrder),
    ].join(':')
    if (columnOrderBootstrapKeyRef.current === bootstrapKey) {
      return
    }
    columnOrderBootstrapKeyRef.current = bootstrapKey
    const localOrder = readStoredColumnOrder(
      moduleItem.key,
      definition.tableColumns
    )
    const nextOrder = accountOrder.length > 0 ? accountOrder : localOrder
    setColumnOrderKeys(nextOrder)
    persistColumnOrder(moduleItem.key, definition.tableColumns, nextOrder)
    if (
      adminProfile?.id &&
      accountOrder.length === 0 &&
      !isDefaultColumnOrder(definition.tableColumns, localOrder)
    ) {
      syncColumnOrderToAccount(localOrder)
    }
  }, [
    adminProfile,
    definition.tableColumns,
    moduleItem.key,
    syncColumnOrderToAccount,
  ])

  const tableColumns = useMemo(() => {
    const mainColumns = orderedTableColumnDefinitions.map((column, index) => {
      const columnKey = resolveModuleColumnKey(column)
      const titleText = String(column.label || column.key || '当前列')
      const isFirstColumn = index === 0
      const isLastColumn = index === orderedTableColumnDefinitions.length - 1
      return {
        dataIndex: column.key,
        key: column.key,
        width: Math.max(
          column.width || 120,
          resolveModuleHeaderMinWidth(titleText)
        ),
        ellipsis: true,
        title: (
          <div className="erp-module-column-header">
            <span className="erp-module-column-header-text" title={titleText}>
              {column.label}
            </span>
            <Dropdown
              trigger={['click']}
              destroyOnHidden
              menu={{
                items: [
                  {
                    key: 'move-left',
                    icon: <ArrowLeftOutlined />,
                    label: '左移一列',
                    disabled: isFirstColumn,
                  },
                  {
                    key: 'move-right',
                    icon: <ArrowRightOutlined />,
                    label: '右移一列',
                    disabled: isLastColumn,
                  },
                  { type: 'divider' },
                  {
                    key: 'move-first',
                    icon: <DoubleLeftOutlined />,
                    label: '移到最前',
                    disabled: isFirstColumn,
                  },
                  {
                    key: 'move-last',
                    icon: <DoubleRightOutlined />,
                    label: '移到最后',
                    disabled: isLastColumn,
                  },
                  { type: 'divider' },
                  {
                    key: 'open-panel',
                    icon: <SettingOutlined />,
                    label: '打开列顺序面板',
                  },
                ],
                onClick: ({ key, domEvent }) => {
                  domEvent?.stopPropagation?.()
                  if (key === 'move-left') {
                    handleMoveColumnOrder(columnKey, -1)
                    return
                  }
                  if (key === 'move-right') {
                    handleMoveColumnOrder(columnKey, 1)
                    return
                  }
                  if (key === 'move-first') {
                    handleRepositionColumnOrder(columnKey, 0)
                    return
                  }
                  if (key === 'move-last') {
                    handleRepositionColumnOrder(
                      columnKey,
                      orderedTableColumnDefinitions.length - 1
                    )
                    return
                  }
                  setColumnOrderModalOpen(true)
                },
              }}
            >
              <Button
                type="text"
                size="small"
                className="erp-module-column-header-trigger"
                icon={<MoreOutlined />}
                aria-label={`调整${titleText}列顺序`}
                title="调整列顺序"
                onClick={(event) => event.stopPropagation()}
              />
            </Dropdown>
          </div>
        ),
        render: (value, record) => {
          const fieldValue =
            value !== undefined
              ? value
              : getBusinessRecordFieldValue(record, column.key)
          if (column.type === 'number' || NUMBER_FIELDS.has(column.key)) {
            return formatMetric(fieldValue)
          }
          return displayValue(fieldValue)
        },
      }
    })
    return [
      ...mainColumns,
      {
        title: '明细',
        dataIndex: 'items',
        key: 'items',
        width: 90,
        render: (items) => `${Array.isArray(items) ? items.length : 0} 行`,
      },
      {
        title: '业务状态',
        dataIndex: 'business_status_key',
        key: 'business_status_key',
        width: 130,
        fixed: 'right',
        render: (value) => (
          <Tag color={value === 'blocked' ? 'red' : 'green'}>
            {BUSINESS_STATUS_LABELS.get(value) || value}
          </Tag>
        ),
      },
      {
        title: '主责角色',
        dataIndex: 'owner_role_key',
        key: 'owner_role_key',
        width: 120,
        fixed: 'right',
        render: (value) => roleLabelMap.get(value) || value || '-',
      },
    ]
  }, [
    handleMoveColumnOrder,
    handleRepositionColumnOrder,
    orderedTableColumnDefinitions,
    resolveModuleColumnKey,
  ])
  const tableScrollX = useMemo(
    () =>
      Math.max(
        1120,
        tableColumns.reduce(
          (sum, column) => sum + Number(column.width || 120),
          0
        )
      ),
    [tableColumns]
  )

  const openCreateModal = () => {
    setEditingRecord(null)
    form.setFieldsValue(createDefaultValues(moduleItem, definition))
    setModalOpen(true)
  }

  const openEditModal = () => {
    if (!selectedRecord) return
    setEditingRecord(selectedRecord)
    form.setFieldsValue(
      formValuesFromRecord(selectedRecord, moduleItem, definition)
    )
    setModalOpen(true)
  }

  const saveRecord = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const params = buildBusinessRecordParams(
        values,
        moduleItem,
        definition,
        editingRecord
      )
      const savedRecord = editingRecord
        ? await updateBusinessRecord(params)
        : await createBusinessRecord(params)
      await syncWorkflowStateForRecord(savedRecord)
      message.success(editingRecord ? '业务记录已更新' : '业务记录已创建')
      setModalOpen(false)
      await loadData()
      if (savedRecord?.id) {
        setSelectedRowKeys([savedRecord.id])
      }
    } catch (error) {
      if (error?.errorFields) return
      message.error(
        getActionErrorMessage(error, '保存业务记录失败，请稍后重试')
      )
    } finally {
      setSaving(false)
    }
  }

  const updateSelectedBusinessStatus = async (nextStatusKey, options = {}) => {
    if (!selectedRecord || !nextStatusKey) return false
    const reason = String(options.reason || '').trim()
    const params = buildBusinessRecordStatusUpdateParams(
      selectedRecord,
      nextStatusKey,
      moduleItem,
      definition,
      { reason }
    )
    if (!params) return false
    setBusinessStatusSaving(true)
    try {
      const savedRecord = await updateBusinessRecord(params)
      await syncWorkflowStateForRecord(savedRecord, { reason })
      await syncWorkflowTasksForBusinessStatus(
        savedRecord,
        nextStatusKey,
        reason
      )
      message.success(
        `业务状态已更新为：${
          BUSINESS_STATUS_LABELS.get(nextStatusKey) || nextStatusKey
        }`
      )
      await loadData()
      if (savedRecord?.id) {
        setSelectedRowKeys([savedRecord.id])
      }
      return true
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '流转业务状态失败，请稍后重试')
      )
      return false
    } finally {
      setBusinessStatusSaving(false)
    }
  }

  const handleBusinessStatusSelect = (nextStatusKey) => {
    if (!nextStatusKey) return
    if (requiresBusinessStatusReason(nextStatusKey)) {
      setPendingStatusKey(nextStatusKey)
      statusReasonForm.setFieldsValue({ reason: '' })
      setStatusReasonModalOpen(true)
      return
    }
    updateSelectedBusinessStatus(nextStatusKey)
  }

  const submitBusinessStatusReason = async () => {
    const values = await statusReasonForm.validateFields()
    const updated = await updateSelectedBusinessStatus(pendingStatusKey, {
      reason: values.reason,
    })
    if (updated) {
      setStatusReasonModalOpen(false)
      setPendingStatusKey('')
    }
  }

  const loadRecycleRecords = useCallback(async () => {
    setRecycleLoading(true)
    try {
      const data = await listBusinessRecords({
        module_key: moduleItem.key,
        deleted_only: true,
        limit: 200,
      })
      setRecycleRecords(data.records || [])
      setRecycleSelectedRowKeys((current) =>
        current.filter((key) =>
          (data.records || []).some((record) => record.id === key)
        )
      )
      return data.records || []
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载回收站失败，请稍后重试'))
      return []
    } finally {
      setRecycleLoading(false)
    }
  }, [moduleItem.key])

  const openRecycleModal = useCallback(async () => {
    setRecycleModalOpen(true)
    await loadRecycleRecords()
  }, [loadRecycleRecords])

  const closeRecycleModal = useCallback(() => {
    setRecycleModalOpen(false)
    setRecycleSelectedRowKeys([])
  }, [])

  const openBatchDeleteModal = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要删除的业务记录')
      return
    }
    setBatchDeleteReason('')
    setBatchDeleteModalOpen(true)
  }, [selectedRowKeys.length])

  const closeBatchDeleteModal = useCallback(() => {
    if (batchDeleteSubmitting) return
    setBatchDeleteModalOpen(false)
  }, [batchDeleteSubmitting])

  const deleteSelectedRecord = async () => {
    if (!selectedRecord) return
    try {
      await deleteBusinessRecords({
        ids: [selectedRecord.id],
        delete_reason: '业务页删除',
      })
      message.success('业务记录已移入回收站')
      setSelectedRowKeys([])
      await loadData()
      if (recycleModalOpen) {
        await loadRecycleRecords()
      }
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '删除业务记录失败，请稍后重试')
      )
    }
  }

  const confirmBatchDeleteRecords = useCallback(async () => {
    const deleteIDs = selectedRowKeys.filter(Boolean)
    if (deleteIDs.length === 0) {
      setBatchDeleteModalOpen(false)
      return
    }
    setBatchDeleteSubmitting(true)
    try {
      const result = await deleteBusinessRecords({
        ids: deleteIDs,
        delete_reason: batchDeleteReason.trim() || '业务页批量删除',
      })
      const affected = Number(result?.affected || 0)
      setSelectedRowKeys([])
      setBatchDeleteReason('')
      setBatchDeleteModalOpen(false)
      await loadData()
      if (recycleModalOpen) {
        await loadRecycleRecords()
      }
      const skippedCount = Math.max(deleteIDs.length - affected, 0)
      if (skippedCount > 0) {
        message.warning(
          `已移入回收站 ${affected} 条，${skippedCount} 条可能已被删除或不存在`
        )
      } else {
        message.success(`已批量移入回收站 ${affected} 条`)
      }
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '批量删除业务记录失败，请稍后重试')
      )
    } finally {
      setBatchDeleteSubmitting(false)
    }
  }, [
    batchDeleteReason,
    loadData,
    loadRecycleRecords,
    recycleModalOpen,
    selectedRowKeys,
  ])

  const restoreRecycleRecords = useCallback(
    async (ids) => {
      const restoreIDs = ids.filter(Boolean)
      if (restoreIDs.length === 0) return
      setRecycleRestoring(true)
      try {
        const results = await Promise.allSettled(
          restoreIDs.map((id) => restoreBusinessRecord({ id }))
        )
        const restoredRecords = results
          .filter((result) => result.status === 'fulfilled' && result.value?.id)
          .map((result) => result.value)
        const failedCount = results.length - restoredRecords.length
        setRecycleSelectedRowKeys([])
        await Promise.all([loadData(), loadRecycleRecords()])
        if (restoredRecords[0]?.id) {
          setSelectedRowKeys([restoredRecords[0].id])
        }
        if (failedCount > 0) {
          message.warning(
            `业务记录恢复成功 ${restoredRecords.length} 条，失败 ${failedCount} 条`
          )
        } else {
          message.success(
            restoreIDs.length === 1
              ? '业务记录已恢复'
              : `业务记录已恢复 ${restoredRecords.length} 条`
          )
        }
      } catch (error) {
        message.error(
          getActionErrorMessage(error, '恢复业务记录失败，请稍后重试')
        )
      } finally {
        setRecycleRestoring(false)
      }
    },
    [loadData, loadRecycleRecords]
  )

  const recycleColumns = useMemo(
    () => [
      {
        title: '单据编号',
        dataIndex: 'document_no',
        key: 'document_no',
        width: 160,
        ellipsis: true,
        render: (value, record) => displayValue(value || record.id),
      },
      {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        width: 220,
        ellipsis: true,
        render: displayValue,
      },
      {
        title: '业务状态',
        dataIndex: 'business_status_key',
        key: 'business_status_key',
        width: 130,
        render: (value) => (
          <Tag color={value === 'blocked' ? 'red' : 'green'}>
            {BUSINESS_STATUS_LABELS.get(value) || value}
          </Tag>
        ),
      },
      {
        title: '删除时间',
        dataIndex: 'deleted_at',
        key: 'deleted_at',
        width: 180,
        render: formatDateTime,
      },
      {
        title: '删除原因',
        dataIndex: 'delete_reason',
        key: 'delete_reason',
        width: 220,
        ellipsis: true,
        render: displayValue,
      },
      {
        title: '操作',
        key: 'operation',
        width: 120,
        fixed: 'right',
        render: (_, record) => (
          <Button
            size="small"
            icon={<RollbackOutlined />}
            onClick={() => restoreRecycleRecords([record.id])}
          >
            恢复
          </Button>
        ),
      },
    ],
    [restoreRecycleRecords]
  )

  const createTaskForSelectedRecord = async () => {
    if (!selectedRecord) return
    try {
      const task = await createWorkflowTask({
        task_code: `${moduleItem.key}-${selectedRecord.id}-${Date.now()}`,
        task_group: moduleItem.sectionKey,
        task_name: `${moduleItem.title}：${selectedRecord.title}`,
        source_type: moduleItem.key,
        source_id: selectedRecord.id,
        source_no: selectedRecord.document_no,
        business_status_key: selectedRecord.business_status_key,
        task_status_key: 'ready',
        owner_role_key: selectedRecord.owner_role_key,
        priority: 0,
        payload: {
          record_title: selectedRecord.title,
          module_title: moduleItem.title,
        },
      })
      message.success(
        `协同任务已创建：${task?.task_name || selectedRecord.title}`
      )
      await loadData()
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '创建协同任务失败，请稍后重试')
      )
    }
  }

  const submitSelectedOrderForApproval = async () => {
    if (!selectedRecord || !isProjectOrderModule) return
    if (selectedRecord.business_status_key === ORDER_APPROVED_STATUS_KEY) {
      message.info('当前订单已放行，无需重复提交审批')
      return
    }
    if (selectedActiveOrderApprovalTask) {
      message.warning('已有审批任务')
      return
    }

    const taskParams = buildBossApprovalTaskFromProjectOrder({
      ...selectedRecord,
      module_key: moduleItem.key,
    })
    if (!taskParams) {
      message.warning('当前记录无法生成审批任务')
      return
    }

    setOrderApprovalSubmitting(true)
    try {
      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: PROJECT_ORDER_MODULE_KEY,
        source_id: selectedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: ORDER_APPROVAL_STATUS_KEY,
        owner_role_key: 'boss',
        payload: {
          record_title: selectedRecord.title,
          approval_required: true,
          notification_type: 'approval_required',
          alert_type: 'approval_pending',
          critical_path: true,
        },
      })
      message.success(`审批任务已提交：${task?.task_name || '老板审批订单'}`)
      await loadData()
      setSelectedRowKeys([selectedRecord.id])
    } catch (error) {
      message.error(getActionErrorMessage(error, '提交审批失败，请稍后重试'))
    } finally {
      setOrderApprovalSubmitting(false)
    }
  }

  const submitSelectedArrivalForIqc = async () => {
    if (!selectedRecord || !isPurchaseInboundFlowModule) return
    if (selectedActiveIqcTask) {
      message.warning('已有 IQC 任务')
      return
    }

    setIqcSubmitting(true)
    try {
      const statusParams = buildBusinessRecordStatusUpdateParams(
        selectedRecord,
        IQC_PENDING_STATUS_KEY,
        moduleItem,
        definition
      )
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildIqcTaskFromArrivalRecord({
        ...savedRecord,
        module_key: moduleItem.key,
      })
      if (!taskParams) {
        message.warning('当前记录无法生成 IQC 任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: IQC_PENDING_STATUS_KEY,
        owner_role_key: 'quality',
        payload: {
          record_title: savedRecord.title,
          notification_type: 'task_created',
          alert_type: 'qc_pending',
          critical_path: true,
        },
      })
      message.success(`IQC 任务已发起：${task?.task_name || 'IQC 来料检验'}`)
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(getActionErrorMessage(error, '发起 IQC 失败，请稍后重试'))
    } finally {
      setIqcSubmitting(false)
    }
  }

  const openPrintWindowForSelectedRecord = () => {
    if (!selectedRecord || !printTemplate) return
    const initialDraft = buildBusinessRecordPrintDraft(
      moduleItem.key,
      selectedRecord
    )
    if (!initialDraft) {
      message.warning('当前业务页未配置可用打印模板')
      return
    }
    try {
      openPrintWorkspaceWindow(printTemplate.key, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
      })
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '打开打印模板失败，请稍后重试')
      )
    }
  }

  const closeLinkModal = useCallback(() => {
    setLinkModalState({ open: false, sourceCode: '', targets: [] })
  }, [])

  const navigateToLinkedTarget = useCallback(
    (target) => {
      const query = buildLinkedNavigationQuery(target)
      if (!target?.targetPath || !query) return
      navigate(`${target.targetPath}?${query}`)
      closeLinkModal()
    },
    [closeLinkModal, navigate]
  )

  const openLinkedTargetsForRecord = useCallback(
    (record) => {
      const targets = getLinkedTargets(moduleItem.key, record)
      if (targets.length === 0) {
        message.warning('当前记录缺少可跳转的关联单号')
        return
      }
      if (targets.length === 1) {
        navigateToLinkedTarget(targets[0])
        return
      }
      setLinkModalState({
        open: true,
        sourceCode: record?.document_no || record?.source_no || '',
        targets,
      })
    },
    [moduleItem.key, navigateToLinkedTarget]
  )

  const exportCurrentRecords = () => {
    const columns = [
      ...orderedTableColumnDefinitions,
      { key: 'business_status_key', label: '业务状态' },
      { key: 'owner_role_key', label: '主责角色' },
    ]
    downloadCSV(`${moduleItem.title}-业务记录.csv`, sortedRecords, columns)
  }

  return (
    <BusinessPageLayout className="erp-business-module-page">
      <PageHeaderCard
        sectionTitle={moduleItem.sectionTitle}
        title={moduleItem.title}
        description={moduleItem.description}
        tags={
          <div className="erp-business-module-chip-row">
            <Tag color="green">
              状态流程：单据保存 → 协同任务 → 业务状态回写
            </Tag>
            {moduleTaskAlerts.length > 0 ? (
              <Tag
                color={
                  moduleTaskAlerts.some(
                    (alert) => alert.alert_level === 'critical'
                  )
                    ? 'red'
                    : 'gold'
                }
              >
                当前预警 {moduleTaskAlerts.length}：
                {moduleTaskAlerts[0].alert_label}
              </Tag>
            ) : null}
          </div>
        }
        stats={[
          { key: 'total', label: '总记录', value: activeRecords.length },
          { key: 'current', label: '当前结果', value: sortedRecords.length },
          { key: 'selected', label: '已选记录', value: selectedRowKeys.length },
        ]}
        summary={
          <>
            <div className="erp-business-module-chip-row">
              <Tag className="erp-business-module-summary-chip">
                {metricKey === 'amount' ? '金额合计' : '数量合计'}{' '}
                {formatMetric(metricTotal)}
              </Tag>
            </div>
            {compactSummaryGroups.map((group) => (
              <div key={group.key} className="erp-business-module-chip-row">
                <Text type="secondary">{group.label}：</Text>
                {group.items.map((item) => (
                  <Tag key={`${group.key}-${item.label}`}>
                    {item.label} {item.count}
                  </Tag>
                ))}
                {group.hiddenCount > 0 ? (
                  <Tag className="erp-business-module-summary-chip">
                    +{group.hiddenCount}
                  </Tag>
                ) : null}
              </div>
            ))}
          </>
        }
      />

      <BusinessFilterPanel>
        <SearchInput
          placeholder="搜编号/名称/客户/合同"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={loadData}
        />
        <DateRangeFilter
          options={availableDateFilters.map((item) => ({
            label: item.label,
            value: item.key,
          }))}
          value={activeDateFilterKey}
          onTypeChange={setDateFilterKey}
          startValue={dateRangeStart}
          endValue={dateRangeEnd}
          onStartChange={setDateRangeStart}
          onEndChange={setDateRangeEnd}
          onOpenNativeDatePicker={openNativeDatePicker}
        />
        <SelectFilter
          allowClear
          mode="multiple"
          maxTagCount="responsive"
          listHeight={224}
          placement="bottomLeft"
          className="erp-business-filter-control--status"
          classNames={{
            popup: { root: 'erp-business-module-select-popup' },
          }}
          placeholder="按业务状态筛选"
          options={STATUS_OPTIONS}
          value={statusFilterKeys}
          onChange={(nextValue) =>
            setStatusFilterKeys(normalizeBusinessStatusKeys(nextValue))
          }
        />
        <SelectFilter
          className="erp-business-filter-control--sort"
          options={SORT_ORDER_OPTIONS}
          value={sortOrder}
          onChange={setSortOrder}
        />
      </BusinessFilterPanel>

      <BusinessListToolbar
        stats={[
          { key: 'total', label: '总记录', value: activeRecords.length },
          { key: 'current', label: '当前结果', value: sortedRecords.length },
          { key: 'selected', label: '已选', value: selectedRowKeys.length },
          {
            key: 'metric',
            label: metricKey === 'amount' ? '金额合计' : '数量合计',
            value: formatMetric(metricTotal),
          },
        ]}
        actions={
          <>
            <ToolbarButton
              icon={<ExportOutlined />}
              onClick={exportCurrentRecords}
            >
              导出当前结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              aria-label="列顺序"
              title="列顺序"
              onClick={() => setColumnOrderModalOpen(true)}
            >
              列顺序
            </ToolbarButton>
            <ToolbarButton icon={<InboxOutlined />} onClick={openRecycleModal}>
              回收站
            </ToolbarButton>
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              新建记录
            </ToolbarButton>
          </>
        }
      />

      <SelectionActionBar
        selectedCount={selectedRowKeys.length}
        selectedLabel={selectedRecordDisplayText}
      >
        <Button type="link" size="small" onClick={() => setSelectedRowKeys([])}>
          清空已选
        </Button>
        {selectedRecord ? (
          <>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={openEditModal}
            >
              编辑
            </Button>
            {printTemplate ? (
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={openPrintWindowForSelectedRecord}
              >
                {printTemplate.actionLabel}
              </Button>
            ) : null}
            {selectedRecordLinkedTargets.length <= 1 ? (
              <Button
                size="small"
                icon={<LinkOutlined />}
                onClick={() => openLinkedTargetsForRecord(selectedRecord)}
              >
                关联表格
              </Button>
            ) : (
              <Dropdown
                menu={{
                  items: selectedRecordLinkedTargets.map((target) => ({
                    key: target.targetKey,
                    label: target.targetTitle,
                  })),
                  onClick: ({ key }) => {
                    const matchedTarget = selectedRecordLinkedTargets.find(
                      (target) => target.targetKey === key
                    )
                    if (matchedTarget) {
                      navigateToLinkedTarget(matchedTarget)
                    }
                  },
                }}
                trigger={['click']}
              >
                <Button size="small" icon={<LinkOutlined />}>
                  <span>关联表格</span>
                  <DownOutlined />
                </Button>
              </Dropdown>
            )}
            <Button size="small" onClick={createTaskForSelectedRecord}>
              创建协同任务
            </Button>
            {isProjectOrderModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={orderApprovalSubmitting}
                  onClick={submitSelectedOrderForApproval}
                >
                  提交审批
                </Button>
                <Tag color={selectedActiveOrderApprovalTask ? 'gold' : 'blue'}>
                  审批：
                  {latestSelectedOrderApprovalTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedOrderApprovalTask.task_status_key
                      ) || latestSelectedOrderApprovalTask.task_status_key
                    : '未提交'}
                </Tag>
                <Tag color="geekblue">下一步：老板审批 -&gt; 工程资料</Tag>
              </>
            ) : null}
            {isPurchaseInboundFlowModule ? (
              <>
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={iqcSubmitting}
                  onClick={submitSelectedArrivalForIqc}
                >
                  发起 IQC
                </Button>
                <Tag color={selectedActiveIqcTask ? 'gold' : 'blue'}>
                  IQC：
                  {latestSelectedIqcTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedIqcTask.task_status_key
                      ) || latestSelectedIqcTask.task_status_key
                    : '未发起'}
                </Tag>
                {latestSelectedIqcTask?.business_status_key === 'qc_failed' ||
                latestSelectedIqcTask?.payload?.alert_type === 'qc_failed' ? (
                  <Tag color="red">来料不良</Tag>
                ) : null}
                <Tag color="geekblue">下一步：品质 IQC -&gt; 仓库入库</Tag>
              </>
            ) : null}
            <Dropdown
              menu={{
                items: businessStatusTransitionMenuItems,
                onClick: ({ key }) => handleBusinessStatusSelect(key),
              }}
              disabled={isBusinessStatusTransitionDisabled}
              placement="topRight"
              trigger={['click']}
            >
              <Button
                aria-label="流转业务状态"
                className="erp-business-module-status-action"
                size="small"
                loading={businessStatusSaving}
                disabled={isBusinessStatusTransitionDisabled}
              >
                <span>流转</span>
                <DownOutlined />
              </Button>
            </Dropdown>
            <Popconfirm
              title="确认删除当前业务记录？"
              description="记录会进入回收站，后续仍可恢复。"
              okText="删除"
              cancelText="取消"
              onConfirm={deleteSelectedRecord}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={openBatchDeleteModal}
            >
              批量删除
            </Button>
          </>
        ) : (
          <>
            <Text
              type="secondary"
              className="erp-business-selection-action-bar__hint"
            >
              多选记录可批量删除；保留 1 条后可编辑、流转和创建协同任务。
            </Text>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={openBatchDeleteModal}
            >
              批量删除
            </Button>
          </>
        )}
      </SelectionActionBar>

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={tableColumns}
        dataSource={sortedRecords}
        scroll={{ x: tableScrollX }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        onRow={(record) => ({
          onClick: () => setSelectedRowKeys([record.id]),
          onDoubleClick: () => {
            setSelectedRowKeys([record.id])
            setEditingRecord(record)
            form.setFieldsValue(
              formValuesFromRecord(record, moduleItem, definition)
            )
            setModalOpen(true)
          },
        })}
        pagination={{
          pageSize: DEFAULT_PAGE_SIZE,
          showSizeChanger: true,
          pageSizeOptions: ['8', '20', '50'],
          showTotal: (total) => `共 ${total} 条`,
        }}
      />

      <CollaborationTaskPanel
        tasks={tasks}
        taskStatusLabels={TASK_STATUS_LABELS}
        roleLabelMap={roleLabelMap}
      />

      <Modal
        className="erp-business-batch-delete-modal"
        title="批量删除记录"
        open={batchDeleteModalOpen}
        onCancel={closeBatchDeleteModal}
        onOk={confirmBatchDeleteRecords}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{
          danger: true,
          loading: batchDeleteSubmitting,
          disabled: selectedRowKeys.length === 0,
        }}
        destroyOnHidden
      >
        <Space
          className="erp-business-batch-delete-modal__content"
          direction="vertical"
          size={12}
        >
          <Text>
            已选择 <Text strong>{selectedRowKeys.length}</Text>{' '}
            条记录，将移入回收站。
          </Text>
          <Input.TextArea
            className="erp-business-batch-delete-modal__reason"
            value={batchDeleteReason}
            onChange={(event) => setBatchDeleteReason(event.target.value)}
            rows={3}
            maxLength={255}
            showCount
            placeholder="请输入删除原因（可选）"
          />
        </Space>
      </Modal>

      <Modal
        title="回收站"
        open={recycleModalOpen}
        onCancel={closeRecycleModal}
        footer={null}
        width={980}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Button
              icon={<RollbackOutlined />}
              disabled={recycleSelectedRowKeys.length === 0}
              loading={recycleRestoring}
              onClick={() => restoreRecycleRecords(recycleSelectedRowKeys)}
            >
              批量恢复
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={recycleLoading}
              onClick={loadRecycleRecords}
            >
              刷新
            </Button>
            <Text type="secondary">
              已选择 {recycleSelectedRowKeys.length} 条回收站记录
            </Text>
            {recycleSelectedRowKeys.length > 0 ? (
              <Button
                type="link"
                size="small"
                onClick={() => setRecycleSelectedRowKeys([])}
              >
                清空已选
              </Button>
            ) : null}
          </Space>

          <Table
            rowKey="id"
            size="small"
            loading={recycleLoading}
            rowSelection={{
              selectedRowKeys: recycleSelectedRowKeys,
              onChange: setRecycleSelectedRowKeys,
            }}
            columns={recycleColumns}
            dataSource={recycleRecords}
            pagination={{
              pageSize: DEFAULT_PAGE_SIZE,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条`,
            }}
            locale={{
              emptyText: <Empty description="回收站暂无记录" />,
            }}
            scroll={{ x: 900 }}
          />
        </Space>
      </Modal>

      <Modal
        title="跳转关联模块"
        open={linkModalState.open}
        onCancel={closeLinkModal}
        footer={null}
        centered
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            当前记录：{linkModalState.sourceCode || '-'}，请选择目标模块。
          </Text>
          {linkModalState.targets.map((target) => (
            <Button
              key={target.targetKey}
              block
              onClick={() => navigateToLinkedTarget(target)}
            >
              {target.targetTitle}
            </Button>
          ))}
        </Space>
      </Modal>

      <Modal
        title="调整列表列顺序"
        open={columnOrderModalOpen}
        onCancel={() => setColumnOrderModalOpen(false)}
        footer={[
          <Button key="reset" onClick={handleResetColumnOrder}>
            恢复默认
          </Button>,
          <Button
            key="close"
            type="primary"
            onClick={() => setColumnOrderModalOpen(false)}
          >
            完成
          </Button>,
        ]}
        width={720}
        centered
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            当前模块列顺序会跟随当前管理员账号保存；浏览器本地仅保留缓存兜底，表头菜单也可直接快捷调整。
          </Text>
          {orderedTableColumnDefinitions.map((column, index) => {
            const columnKey = resolveModuleColumnKey(column)
            const titleText = String(column.label || column.key || '当前列')
            const isFirstColumn = index === 0
            const isLastColumn =
              index === orderedTableColumnDefinitions.length - 1
            return (
              <div
                key={columnKey}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                }}
              >
                <Space>
                  <Tag>{index + 1}</Tag>
                  <Text>{column.label}</Text>
                </Space>
                <Space wrap size={[8, 8]}>
                  <Button
                    size="small"
                    icon={<VerticalAlignTopOutlined />}
                    disabled={isFirstColumn}
                    aria-label={`${titleText}移到最前`}
                    onClick={() => handleRepositionColumnOrder(columnKey, 0)}
                  >
                    移到最前
                  </Button>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={isFirstColumn}
                    aria-label={`${titleText}上移`}
                    onClick={() => handleMoveColumnOrder(columnKey, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={isLastColumn}
                    aria-label={`${titleText}下移`}
                    onClick={() => handleMoveColumnOrder(columnKey, 1)}
                  >
                    下移
                  </Button>
                  <Button
                    size="small"
                    icon={<VerticalAlignBottomOutlined />}
                    disabled={isLastColumn}
                    aria-label={`${titleText}移到最后`}
                    onClick={() =>
                      handleRepositionColumnOrder(
                        columnKey,
                        orderedTableColumnDefinitions.length - 1
                      )
                    }
                  >
                    移到最后
                  </Button>
                </Space>
              </div>
            )
          })}
        </Space>
      </Modal>

      <Modal
        title={`${editingRecord ? '编辑' : '新建'}：${moduleItem.title}`}
        open={modalOpen}
        width="92vw"
        centered
        forceRender
        className="erp-business-record-modal"
        confirmLoading={saving}
        onOk={saveRecord}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          className="erp-business-record-form"
        >
          <Row gutter={12}>
            {definition.formFields.map((field) => (
              <Col
                {...resolveBusinessRecordFieldColProps(field)}
                key={field.key}
              >
                <Form.Item
                  name={field.key}
                  label={field.label}
                  rules={
                    field.required
                      ? [{ required: true, message: `请输入${field.label}` }]
                      : undefined
                  }
                >
                  {renderFormField(field)}
                </Form.Item>
              </Col>
            ))}
            <Col xs={24} md={12} xl={6}>
              <Form.Item
                name="business_status_key"
                label="业务状态"
                rules={[{ required: true, message: '请选择业务状态' }]}
              >
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Form.Item
                name="owner_role_key"
                label="主责角色"
                rules={[{ required: true, message: '请选择主责角色' }]}
              >
                <Select options={ROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="note" label="备注 / 异常说明">
                <Input.TextArea
                  rows={3}
                  showCount
                  maxLength={300}
                  placeholder="记录缺料、缺资料、延期、返工、结算差异等当前说明"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                label={definition.itemTitle}
                required
                className="erp-business-record-form__items-field"
              >
                <Form.List name="items">
                  {(fields, { add, remove }) => (
                    <Space
                      direction="vertical"
                      size={16}
                      className="erp-business-record-form__items"
                    >
                      <div className="erp-business-record-form__items-help">
                        <Text type="secondary">
                          金额会自动按 数量 × 单价
                          计算，金额合计按全部条目汇总。
                        </Text>
                        <Button
                          type="link"
                          size="small"
                          className="erp-business-record-form__items-help-link"
                          onClick={() => navigate(CALCULATION_GUIDE_PATH)}
                        >
                          查看计算口径
                        </Button>
                      </div>
                      <div className="erp-business-record-form__item-card-stack">
                        {fields.map(({ key, name, ...restField }, index) => (
                          <Card
                            key={key}
                            className="erp-item-card erp-item-card-horizontal-scroll"
                            size="small"
                            title={`条目 ${index + 1}`}
                            style={ITEM_CARD_STYLES}
                            styles={{
                              header: ITEM_CARD_HEADER_STYLES,
                              body: ITEM_CARD_BODY_STYLES,
                            }}
                            extra={
                              <Space size={4}>
                                <Button
                                  aria-label={`复制条目 ${index + 1}`}
                                  type="text"
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    const currentItems =
                                      form.getFieldValue('items') || []
                                    add(
                                      {
                                        ...createBlankItem(definition),
                                        ...(currentItems[name] || {}),
                                      },
                                      name + 1
                                    )
                                  }}
                                />
                                <Button
                                  aria-label={`删除条目 ${index + 1}`}
                                  danger
                                  type="text"
                                  icon={<DeleteOutlined />}
                                  onClick={() => remove(name)}
                                />
                              </Space>
                            }
                          >
                            <Row
                              gutter={[12, 12]}
                              align="top"
                              wrap={false}
                              className="erp-item-card-row erp-item-card-row-nowrap erp-business-record-item-grid"
                              style={{
                                minWidth: `${resolveBusinessRecordItemRowMinWidth(
                                  definition.itemFields
                                )}px`,
                              }}
                            >
                              {definition.itemFields.map((field) => (
                                <Col
                                  span={resolveBusinessRecordItemDesktopSpan(
                                    field
                                  )}
                                  key={field.key}
                                >
                                  <Space
                                    direction="vertical"
                                    size={4}
                                    className="erp-item-field-stack"
                                  >
                                    <Text
                                      type="secondary"
                                      className="erp-item-field-label"
                                    >
                                      {field.label}
                                    </Text>
                                    <Form.Item
                                      {...restField}
                                      className="erp-item-field-form-item"
                                      name={[name, field.key]}
                                    >
                                      {renderItemField(field)}
                                    </Form.Item>
                                  </Space>
                                </Col>
                              ))}
                            </Row>
                          </Card>
                        ))}
                      </div>
                      <Button
                        className="erp-business-record-form__add-item-button"
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add(createBlankItem(definition))}
                      >
                        添加条目
                      </Button>
                      <div className="erp-business-record-form__item-summary">
                        <span className="erp-item-summary-metric">
                          <Text type="secondary">已录入 </Text>
                          <span className="erp-item-summary-value">
                            {fields.length}
                          </span>
                          <Text type="secondary"> 条</Text>
                        </span>
                        <span className="erp-item-summary-metric">
                          <Text type="secondary">数量合计 </Text>
                          <span className="erp-item-summary-value">
                            {formatMetric(itemSummary.quantity)}
                          </span>
                        </span>
                        <span className="erp-item-summary-metric">
                          <Text type="secondary">金额合计 </Text>
                          <span className="erp-item-summary-value">
                            {Number(itemSummary.amount || 0).toFixed(2)}
                          </span>
                        </span>
                      </div>
                    </Space>
                  )}
                </Form.List>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`流转业务状态：${
          BUSINESS_STATUS_LABELS.get(pendingStatusKey) || pendingStatusKey
        }`}
        open={statusReasonModalOpen}
        centered
        forceRender
        className="erp-business-record-modal erp-business-status-reason-modal"
        confirmLoading={businessStatusSaving}
        onOk={submitBusinessStatusReason}
        onCancel={() => {
          setStatusReasonModalOpen(false)
          setPendingStatusKey('')
        }}
        okText="确认流转"
        cancelText="取消"
      >
        <Form form={statusReasonForm} layout="vertical">
          <Form.Item
            name="reason"
            label="原因说明"
            rules={[
              { required: true, message: '请填写原因说明' },
              { max: 300, message: '原因说明不能超过 300 字' },
            ]}
          >
            <Input.TextArea
              rows={4}
              showCount
              maxLength={300}
              placeholder="说明缺料、缺资料、未放行、取消或其他卡点原因"
            />
          </Form.Item>
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
