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
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
  getBusinessStatusTransitionOptions,
  requiresBusinessStatusReason,
} from '../config/workflowStatus.mjs'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import {
  BUSINESS_ROLE_OPTIONS,
  getBusinessRecordDefinition,
  roleLabelMap,
} from '../config/businessRecordDefinitions.mjs'
import {
  buildBusinessRecordParams,
  buildBusinessRecordStatusUpdateParams,
  createBlankItem,
  createBlankFieldValue,
  formatMetric,
  getBusinessRecordFieldValue,
  getBusinessRecordItemFieldValue,
  summarizeRecordItems,
} from '../utils/businessRecordForm.mjs'
import {
  resolveBusinessRecordItemDesktopSpan,
  resolveBusinessRecordItemRowMinWidth,
  resolveBusinessRecordItemUnitText,
} from '../utils/businessRecordItemLayout.mjs'
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
  buildBusinessRecordSourcePrefillValues,
  getBusinessRecordSourcePrefillModuleKeys,
  getDefaultBusinessRecordSourcePrefillModuleKey,
  resolveBusinessRecordSourceRecord,
  shouldClearBusinessRecordSourcePrefill,
} from '../utils/businessRecordSourcePrefill.mjs'
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
  isWarehouseInboundTask,
} from '../utils/purchaseInboundFlow.mjs'
import {
  PROCESSING_CONTRACTS_MODULE_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  buildOutsourceReturnQcTask,
  buildOutsourceReturnTrackingTask,
  hasActiveOutsourceReturnQcTaskForRecord,
  hasActiveOutsourceReturnTrackingTaskForRecord,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../utils/outsourceReturnFlow.mjs'
import {
  PRODUCTION_PROGRESS_MODULE_KEY,
  SHIPPING_RELEASE_MODULE_KEY,
  QC_PENDING_STATUS_KEY as FINISHED_GOODS_QC_PENDING_STATUS_KEY,
  buildFinishedGoodsQcTask,
  hasActiveFinishedGoodsQcTaskForRecord,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isShipmentReleaseTask,
} from '../utils/finishedGoodsFlow.mjs'
import {
  INVOICES_MODULE_KEY,
  OUTBOUND_MODULE_KEY,
  RECEIVABLES_MODULE_KEY,
  RECONCILING_STATUS_KEY as FINANCE_RECONCILING_STATUS_KEY,
  SHIPPED_STATUS_KEY as FINANCE_SHIPPED_STATUS_KEY,
  buildInvoiceRegistrationTask,
  buildReceivableRegistrationTask,
  hasActiveInvoiceRegistrationTaskForRecord,
  hasActiveReceivableRegistrationTaskForRecord,
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
} from '../utils/shipmentFinanceFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as PAYABLE_INBOUND_DONE_STATUS_KEY,
  PAYABLES_MODULE_KEY,
  RECONCILIATION_MODULE_KEY,
  RECONCILING_STATUS_KEY as PAYABLE_RECONCILING_STATUS_KEY,
  buildOutsourcePayableRegistrationTask,
  buildOutsourceReconciliationTask,
  buildPurchasePayableRegistrationTask,
  buildPurchaseReconciliationTask,
  hasActivePayableRegistrationTaskForRecord,
  hasActiveReconciliationTaskForRecord,
  isOutsourceInboundDoneRecord,
  isOutsourcePayableRegistrationTask,
  isOutsourceReconciliationTask,
  isPurchaseInboundDoneRecord,
  isPurchasePayableRegistrationTask,
  isPurchaseReconciliationTask,
} from '../utils/payableReconciliationFlow.mjs'
import {
  BusinessDataTable,
  BusinessFilterPanel,
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
const BUSINESS_MODULE_LABEL_BY_KEY = new Map(
  businessModuleDefinitions.map((moduleItem) => [
    moduleItem.key,
    moduleItem.title,
  ])
)
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
      ? record.items.map((item) => {
          const blankItem = createBlankItem(definition)
          const itemFields = definition.itemFields || []
          itemFields.forEach((field) => {
            const value = getBusinessRecordItemFieldValue(item, field.key)
            if (value !== undefined) {
              blankItem[field.key] = value
            }
          })
          return blankItem
        })
      : [createBlankItem(definition)]
  return values
}

function downloadCSV(filename, rows, columns) {
  const header = columns.map((column) => column.label)
  const body = rows.map((row) =>
    columns.map((column) => {
      const text = displayValue(getBusinessRecordFieldValue(row, column.key))
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
  if (field.type === 'textarea') {
    return (
      <Input.TextArea
        rows={3}
        showCount={Boolean(field.maxLength)}
        maxLength={field.maxLength}
        placeholder={field.placeholder || `请输入${field.label}`}
      />
    )
  }
  return <Input placeholder={field.placeholder || `请输入${field.label}`} />
}

function FieldWithUnitSuffix({ control, unitText, ...controlProps }) {
  const controlStyle = control?.props?.style || {}
  const mergedProps = {
    ...control?.props,
    ...controlProps,
    style: {
      ...controlStyle,
      width: '100%',
    },
  }

  if (
    controlProps.disabled === undefined &&
    control?.props?.disabled !== undefined
  ) {
    mergedProps.disabled = control.props.disabled
  }

  if (!unitText) {
    return React.cloneElement(control, mergedProps)
  }

  const unitSuffixWidth = Math.max(56, String(unitText).length * 14 + 18)

  return (
    <Space.Compact
      className="erp-item-field-with-unit"
      style={{ width: '100%' }}
    >
      {React.cloneElement(control, mergedProps)}
      <Input
        value={unitText}
        readOnly
        tabIndex={-1}
        aria-label={`单位 ${unitText}`}
        className="erp-item-field-unit-suffix"
        style={{
          width: `${unitSuffixWidth}px`,
          minWidth: `${unitSuffixWidth}px`,
          flex: '0 0 auto',
        }}
      />
    </Space.Compact>
  )
}

function renderItemField(field, rowValues = {}) {
  const unitText = resolveBusinessRecordItemUnitText(field, rowValues)
  if (field.type === 'number') {
    return (
      <FieldWithUnitSuffix
        control={
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            placeholder={field.placeholder}
          />
        }
        unitText={unitText}
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
        placeholder={field.placeholder || field.label}
      />
    )
  }
  if (field.type === 'textarea') {
    return (
      <Input.TextArea
        rows={1}
        autoSize={{ minRows: 1, maxRows: 3 }}
        placeholder={field.placeholder || field.label}
      />
    )
  }
  return <Input placeholder={field.placeholder || field.label} />
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
  const [urgeReasonForm] = Form.useForm()
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
  const [sourcePrefillState, setSourcePrefillState] = useState({
    moduleKey: '',
    keyword: '',
    loading: false,
    appliedModuleKey: '',
    appliedKeyword: '',
  })
  const [linkModalState, setLinkModalState] = useState({
    open: false,
    sourceCode: '',
    targets: [],
  })
  const [urgeTaskModalState, setUrgeTaskModalState] = useState({
    open: false,
    task: null,
  })
  const [statusReasonModalOpen, setStatusReasonModalOpen] = useState(false)
  const [pendingStatusKey, setPendingStatusKey] = useState('')
  const [orderApprovalSubmitting, setOrderApprovalSubmitting] = useState(false)
  const [iqcSubmitting, setIqcSubmitting] = useState(false)
  const [outsourceReturnSubmitting, setOutsourceReturnSubmitting] =
    useState(false)
  const [finishedGoodsSubmitting, setFinishedGoodsSubmitting] = useState(false)
  const [shipmentFinanceSubmitting, setShipmentFinanceSubmitting] =
    useState(false)
  const [payableReconciliationSubmitting, setPayableReconciliationSubmitting] =
    useState(false)
  const [urgingTaskID, setUrgingTaskID] = useState(null)
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
  const sourcePrefillModuleOptions = useMemo(
    () =>
      getBusinessRecordSourcePrefillModuleKeys(moduleItem.key).map((key) => ({
        value: key,
        label: BUSINESS_MODULE_LABEL_BY_KEY.get(key) || key,
      })),
    [moduleItem.key]
  )
  const sourcePrefillAllowedKeys = useMemo(
    () => new Set(sourcePrefillModuleOptions.map((option) => option.value)),
    [sourcePrefillModuleOptions]
  )
  const isSourcePrefillAvailable = sourcePrefillModuleOptions.length > 0

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
  const selectedPurchaseWarehouseInboundTasks = useMemo(
    () => selectedRecordTasks.filter(isWarehouseInboundTask),
    [selectedRecordTasks]
  )
  const latestSelectedPurchaseWarehouseInboundTask = useMemo(
    () =>
      [...selectedPurchaseWarehouseInboundTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedPurchaseWarehouseInboundTasks]
  )
  const isProcessingContractsModule =
    moduleItem.key === PROCESSING_CONTRACTS_MODULE_KEY
  const isInboundModule = moduleItem.key === INBOUND_MODULE_KEY
  const selectedOutsourceReturnTrackingTasks = useMemo(
    () => selectedRecordTasks.filter(isOutsourceReturnTrackingTask),
    [selectedRecordTasks]
  )
  const selectedActiveOutsourceReturnTrackingTask = useMemo(
    () =>
      selectedOutsourceReturnTrackingTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedOutsourceReturnTrackingTasks]
  )
  const latestSelectedOutsourceReturnTrackingTask = useMemo(
    () =>
      [...selectedOutsourceReturnTrackingTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedOutsourceReturnTrackingTasks]
  )
  const selectedOutsourceReturnQcTasks = useMemo(
    () => selectedRecordTasks.filter(isOutsourceReturnQcTask),
    [selectedRecordTasks]
  )
  const selectedActiveOutsourceReturnQcTask = useMemo(
    () =>
      selectedOutsourceReturnQcTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedOutsourceReturnQcTasks]
  )
  const latestSelectedOutsourceReturnQcTask = useMemo(
    () =>
      [...selectedOutsourceReturnQcTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedOutsourceReturnQcTasks]
  )
  const selectedOutsourceRiskTask = useMemo(
    () =>
      selectedRecordTasks.find(
        (task) =>
          isOutsourceReworkTask(task) ||
          task.business_status_key === 'qc_failed' ||
          task.task_status_key === 'blocked'
      ) || null,
    [selectedRecordTasks]
  )
  const selectedOutsourceWarehouseInboundTasks = useMemo(
    () => selectedRecordTasks.filter(isOutsourceWarehouseInboundTask),
    [selectedRecordTasks]
  )
  const latestSelectedOutsourceWarehouseInboundTask = useMemo(
    () =>
      [...selectedOutsourceWarehouseInboundTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedOutsourceWarehouseInboundTasks]
  )
  const isProductionProgressModule =
    moduleItem.key === PRODUCTION_PROGRESS_MODULE_KEY
  const isShippingFlowModule = [
    SHIPPING_RELEASE_MODULE_KEY,
    OUTBOUND_MODULE_KEY,
  ].includes(moduleItem.key)
  const selectedFinishedGoodsQcTasks = useMemo(
    () => selectedRecordTasks.filter(isFinishedGoodsQcTask),
    [selectedRecordTasks]
  )
  const selectedActiveFinishedGoodsQcTask = useMemo(
    () =>
      selectedFinishedGoodsQcTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedFinishedGoodsQcTasks]
  )
  const latestSelectedFinishedGoodsQcTask = useMemo(
    () =>
      [...selectedFinishedGoodsQcTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedFinishedGoodsQcTasks]
  )
  const selectedFinishedGoodsInboundTasks = useMemo(
    () => selectedRecordTasks.filter(isFinishedGoodsInboundTask),
    [selectedRecordTasks]
  )
  const latestSelectedFinishedGoodsInboundTask = useMemo(
    () =>
      [...selectedFinishedGoodsInboundTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedFinishedGoodsInboundTasks]
  )
  const selectedShipmentReleaseTasks = useMemo(
    () => selectedRecordTasks.filter(isShipmentReleaseTask),
    [selectedRecordTasks]
  )
  const latestSelectedShipmentReleaseTask = useMemo(
    () =>
      [...selectedShipmentReleaseTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedShipmentReleaseTasks]
  )
  const selectedFinishedGoodsRiskTask = useMemo(
    () =>
      selectedRecordTasks.find(
        (task) =>
          isFinishedGoodsReworkTask(task) ||
          task.business_status_key === 'qc_failed' ||
          task.task_status_key === 'blocked'
      ) || null,
    [selectedRecordTasks]
  )
  const isReceivablesModule = moduleItem.key === RECEIVABLES_MODULE_KEY
  const isInvoicesModule = moduleItem.key === INVOICES_MODULE_KEY
  const isShipmentFinanceActionModule =
    isShippingFlowModule || isProductionProgressModule
  const shouldShowShipmentFinanceAction =
    isShippingFlowModule ||
    (isProductionProgressModule &&
      (selectedRecord?.business_status_key === FINANCE_SHIPPED_STATUS_KEY ||
        latestSelectedShipmentReleaseTask))
  const selectedReceivableRegistrationTasks = useMemo(
    () => selectedRecordTasks.filter(isReceivableRegistrationTask),
    [selectedRecordTasks]
  )
  const selectedActiveReceivableRegistrationTask = useMemo(
    () =>
      selectedReceivableRegistrationTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedReceivableRegistrationTasks]
  )
  const latestSelectedReceivableRegistrationTask = useMemo(
    () =>
      [...selectedReceivableRegistrationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedReceivableRegistrationTasks]
  )
  const selectedInvoiceRegistrationTasks = useMemo(
    () => selectedRecordTasks.filter(isInvoiceRegistrationTask),
    [selectedRecordTasks]
  )
  const selectedActiveInvoiceRegistrationTask = useMemo(
    () =>
      selectedInvoiceRegistrationTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedInvoiceRegistrationTasks]
  )
  const latestSelectedInvoiceRegistrationTask = useMemo(
    () =>
      [...selectedInvoiceRegistrationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedInvoiceRegistrationTasks]
  )
  const selectedFinanceRiskTask = useMemo(
    () =>
      selectedRecordTasks.find((task) => {
        const alertType = String(task?.payload?.alert_type || '').trim()
        const dueAt = Number(task?.due_at || 0)
        const isOverdue =
          dueAt > 0 &&
          dueAt < Math.floor(Date.now() / 1000) &&
          !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
        return (
          task.task_status_key === 'blocked' ||
          task.task_status_key === 'rejected' ||
          alertType === 'finance_overdue' ||
          isOverdue
        )
      }) || null,
    [selectedRecordTasks]
  )
  const isPayablesModule = moduleItem.key === PAYABLES_MODULE_KEY
  const isReconciliationModule = moduleItem.key === RECONCILIATION_MODULE_KEY
  const isPurchasePayableActionModule = [
    ACCESSORIES_PURCHASE_MODULE_KEY,
    INBOUND_MODULE_KEY,
  ].includes(moduleItem.key)
  const isOutsourcePayableActionModule = [
    PROCESSING_CONTRACTS_MODULE_KEY,
    INBOUND_MODULE_KEY,
  ].includes(moduleItem.key)
  const selectedPurchasePayableRegistrationTasks = useMemo(
    () => selectedRecordTasks.filter(isPurchasePayableRegistrationTask),
    [selectedRecordTasks]
  )
  const selectedOutsourcePayableRegistrationTasks = useMemo(
    () => selectedRecordTasks.filter(isOutsourcePayableRegistrationTask),
    [selectedRecordTasks]
  )
  const selectedPayableRegistrationTasks = useMemo(
    () => [
      ...selectedPurchasePayableRegistrationTasks,
      ...selectedOutsourcePayableRegistrationTasks,
    ],
    [
      selectedOutsourcePayableRegistrationTasks,
      selectedPurchasePayableRegistrationTasks,
    ]
  )
  const selectedActivePayableRegistrationTask = useMemo(
    () =>
      selectedPayableRegistrationTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedPayableRegistrationTasks]
  )
  const latestSelectedPurchasePayableRegistrationTask = useMemo(
    () =>
      [...selectedPurchasePayableRegistrationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedPurchasePayableRegistrationTasks]
  )
  const latestSelectedOutsourcePayableRegistrationTask = useMemo(
    () =>
      [...selectedOutsourcePayableRegistrationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedOutsourcePayableRegistrationTasks]
  )
  const latestSelectedPayableRegistrationTask = useMemo(
    () =>
      [...selectedPayableRegistrationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedPayableRegistrationTasks]
  )
  const selectedPurchaseReconciliationTasks = useMemo(
    () => selectedRecordTasks.filter(isPurchaseReconciliationTask),
    [selectedRecordTasks]
  )
  const selectedOutsourceReconciliationTasks = useMemo(
    () => selectedRecordTasks.filter(isOutsourceReconciliationTask),
    [selectedRecordTasks]
  )
  const selectedReconciliationTasks = useMemo(
    () => [
      ...selectedPurchaseReconciliationTasks,
      ...selectedOutsourceReconciliationTasks,
    ],
    [selectedOutsourceReconciliationTasks, selectedPurchaseReconciliationTasks]
  )
  const selectedActiveReconciliationTask = useMemo(
    () =>
      selectedReconciliationTasks.find((task) =>
        ACTIVE_APPROVAL_TASK_STATUS_KEYS.has(
          String(task.task_status_key || '').trim()
        )
      ) || null,
    [selectedReconciliationTasks]
  )
  const latestSelectedReconciliationTask = useMemo(
    () =>
      [...selectedReconciliationTasks].sort(
        (left, right) =>
          Number(right.updated_at || right.created_at || 0) -
          Number(left.updated_at || left.created_at || 0)
      )[0] || null,
    [selectedReconciliationTasks]
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

  const openUrgeTaskModal = useCallback(
    (task) => {
      setUrgeTaskModalState({ open: true, task })
      urgeReasonForm.setFieldsValue({ urge_reason: '' })
    },
    [urgeReasonForm]
  )

  const closeUrgeTaskModal = useCallback(() => {
    setUrgeTaskModalState({ open: false, task: null })
    urgeReasonForm.resetFields()
  }, [urgeReasonForm])

  const submitUrgeTask = useCallback(async () => {
    const { task } = urgeTaskModalState
    if (!task) return
    const values = await urgeReasonForm.validateFields()
    const reason = String(values.urge_reason || '').trim()
    setUrgingTaskID(task.id)
    try {
      await urgeWorkflowTask({
        task_id: task.id,
        action: 'urge_task',
        reason,
        actor_role_key: 'admin',
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          module_key: moduleItem.key,
        },
      })
      message.success('催办已记录')
      closeUrgeTaskModal()
      await loadData()
    } catch (error) {
      message.error(getActionErrorMessage(error, '催办失败，请稍后重试'))
    } finally {
      setUrgingTaskID(null)
    }
  }, [
    closeUrgeTaskModal,
    loadData,
    moduleItem.key,
    urgeReasonForm,
    urgeTaskModalState.task,
  ])

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

  const loadLinkedSourceRecordForCreate = useCallback(async () => {
    const { sourceKey } = moduleTableNavigationQuery
    const sourceKeyword = moduleTableNavigationQuery.keyword
    if (
      !sourceKey ||
      !sourceKeyword ||
      !sourcePrefillAllowedKeys.has(sourceKey)
    ) {
      return null
    }
    const data = await listBusinessRecords({
      module_key: sourceKey,
      keyword: sourceKeyword,
      limit: 20,
    })
    return resolveBusinessRecordSourceRecord(data.records, sourceKeyword)
  }, [
    moduleTableNavigationQuery.keyword,
    moduleTableNavigationQuery.sourceKey,
    sourcePrefillAllowedKeys,
  ])

  const resetCreateFormToDefaults = useCallback(() => {
    form.setFieldsValue(createDefaultValues(moduleItem, definition))
  }, [definition, form, moduleItem])

  const openCreateModal = async () => {
    setEditingRecord(null)
    const initialSourceModuleKey = sourcePrefillAllowedKeys.has(
      moduleTableNavigationQuery.sourceKey
    )
      ? moduleTableNavigationQuery.sourceKey
      : getDefaultBusinessRecordSourcePrefillModuleKey(moduleItem.key)
    const initialSourceKeyword =
      initialSourceModuleKey === moduleTableNavigationQuery.sourceKey
        ? moduleTableNavigationQuery.keyword
        : ''
    const baseValues = createDefaultValues(moduleItem, definition)
    let values = baseValues
    let appliedModuleKey = ''
    let appliedKeyword = ''
    try {
      const sourceRecord = await loadLinkedSourceRecordForCreate()
      if (sourceRecord) {
        values = buildBusinessRecordSourcePrefillValues({
          baseValues,
          sourceRecord,
          targetModuleKey: moduleItem.key,
          targetDefinition: definition,
        })
        appliedModuleKey = initialSourceModuleKey
        appliedKeyword = initialSourceKeyword
      }
    } catch (error) {
      message.warning(
        getActionErrorMessage(error, '读取来源记录失败，已按空白记录新建')
      )
    }
    setSourcePrefillState({
      moduleKey: initialSourceModuleKey,
      keyword: initialSourceKeyword,
      loading: false,
      appliedModuleKey,
      appliedKeyword,
    })
    form.setFieldsValue(values)
    setModalOpen(true)
  }

  const openEditModal = () => {
    if (!selectedRecord) return
    setEditingRecord(selectedRecord)
    setSourcePrefillState({
      moduleKey: '',
      keyword: '',
      loading: false,
      appliedModuleKey: '',
      appliedKeyword: '',
    })
    form.setFieldsValue(
      formValuesFromRecord(selectedRecord, moduleItem, definition)
    )
    setModalOpen(true)
  }

  const handleSourcePrefillModuleChange = (moduleKey) => {
    const shouldReset = shouldClearBusinessRecordSourcePrefill({
      appliedModuleKey: sourcePrefillState.appliedModuleKey,
      appliedKeyword: sourcePrefillState.appliedKeyword,
      nextModuleKey: moduleKey,
    })
    if (shouldReset) {
      resetCreateFormToDefaults()
    }
    setSourcePrefillState({
      moduleKey,
      keyword: '',
      loading: false,
      appliedModuleKey: '',
      appliedKeyword: '',
    })
  }

  const handleSourcePrefillKeywordChange = (event) => {
    const nextKeyword = event.target.value
    const shouldReset = shouldClearBusinessRecordSourcePrefill({
      appliedModuleKey: sourcePrefillState.appliedModuleKey,
      appliedKeyword: sourcePrefillState.appliedKeyword,
      nextKeyword,
    })
    if (shouldReset) {
      resetCreateFormToDefaults()
    }
    setSourcePrefillState((current) => ({
      ...current,
      keyword: nextKeyword,
      loading: false,
      appliedModuleKey: shouldReset ? '' : current.appliedModuleKey,
      appliedKeyword: shouldReset ? '' : current.appliedKeyword,
    }))
  }

  const applySourcePrefill = async () => {
    const sourceModuleKey = sourcePrefillState.moduleKey
    const sourceKeyword = sourcePrefillState.keyword.trim()
    if (!sourceModuleKey || !sourceKeyword) {
      message.warning('请先选择来源模块并输入来源单号')
      return
    }
    setSourcePrefillState((current) => ({ ...current, loading: true }))
    try {
      const data = await listBusinessRecords({
        module_key: sourceModuleKey,
        keyword: sourceKeyword,
        limit: 20,
      })
      const sourceRecord = resolveBusinessRecordSourceRecord(
        data.records,
        sourceKeyword
      )
      if (!sourceRecord) {
        message.warning('未找到匹配的来源记录')
        return
      }
      const baseValues = createDefaultValues(moduleItem, definition)
      const values = buildBusinessRecordSourcePrefillValues({
        baseValues,
        sourceRecord,
        targetModuleKey: moduleItem.key,
        targetDefinition: definition,
      })
      form.setFieldsValue(values)
      setSourcePrefillState((current) => ({
        ...current,
        loading: false,
        appliedModuleKey: sourceModuleKey,
        appliedKeyword: sourceKeyword,
      }))
      message.success('已按来源记录带值')
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '读取来源记录失败，请稍后重试')
      )
    } finally {
      setSourcePrefillState((current) => ({ ...current, loading: false }))
    }
  }

  const clearSourcePrefill = () => {
    resetCreateFormToDefaults()
    setSourcePrefillState((current) => ({
      ...current,
      keyword: '',
      loading: false,
      appliedModuleKey: '',
      appliedKeyword: '',
    }))
    message.success('已清空来源带值')
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

  const submitSelectedProcessingContractForOutsourceTracking = async () => {
    if (!selectedRecord || !isProcessingContractsModule) return
    if (
      selectedActiveOutsourceReturnTrackingTask ||
      hasActiveOutsourceReturnTrackingTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有委外回货跟踪任务')
      return
    }

    setOutsourceReturnSubmitting(true)
    try {
      const statusParams = buildBusinessRecordStatusUpdateParams(
        selectedRecord,
        OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
        moduleItem,
        definition,
        { reason: '委外发料后进入加工中，开始跟踪回货' }
      )
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildOutsourceReturnTrackingTask({
        ...savedRecord,
        module_key: moduleItem.key,
      })
      if (!taskParams) {
        message.warning('当前记录无法生成委外回货跟踪任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: PROCESSING_CONTRACTS_MODULE_KEY,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
        owner_role_key: 'production',
        payload: {
          record_title: savedRecord.title,
          notification_type: 'task_created',
          alert_type: 'outsource_return_pending',
          critical_path: true,
          outsource_owner_role_key: 'outsource',
          outsource_processing: true,
        },
      })
      message.success(
        `委外回货跟踪已发起：${task?.task_name || '跟踪委外回货'}`
      )
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起委外回货跟踪失败，请稍后重试')
      )
    } finally {
      setOutsourceReturnSubmitting(false)
    }
  }

  const submitSelectedInboundForOutsourceReturnQc = async () => {
    if (!selectedRecord || !isInboundModule) return
    if (
      selectedActiveOutsourceReturnQcTask ||
      hasActiveOutsourceReturnQcTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有委外回货检验任务')
      return
    }

    setOutsourceReturnSubmitting(true)
    try {
      const statusParams = buildBusinessRecordStatusUpdateParams(
        selectedRecord,
        OUTSOURCE_QC_PENDING_STATUS_KEY,
        moduleItem,
        definition,
        { reason: '委外回货通知进入品质检验' }
      )
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildOutsourceReturnQcTask(
        {
          ...savedRecord,
          module_key: moduleItem.key,
        },
        null
      )
      if (!taskParams) {
        message.warning('当前记录无法生成委外回货检验任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: OUTSOURCE_QC_PENDING_STATUS_KEY,
        owner_role_key: 'quality',
        payload: {
          record_title: savedRecord.title,
          notification_type: 'task_created',
          alert_type: 'outsource_return_qc_pending',
          critical_path: true,
          outsource_processing: true,
        },
      })
      message.success(
        `委外回货检验已发起：${task?.task_name || '委外回货检验'}`
      )
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起委外回货检验失败，请稍后重试')
      )
    } finally {
      setOutsourceReturnSubmitting(false)
    }
  }

  const submitSelectedProductionForFinishedGoodsQc = async () => {
    if (!selectedRecord || !isProductionProgressModule) return
    if (
      selectedActiveFinishedGoodsQcTask ||
      hasActiveFinishedGoodsQcTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有成品抽检任务')
      return
    }

    setFinishedGoodsSubmitting(true)
    try {
      const statusParams = buildBusinessRecordStatusUpdateParams(
        selectedRecord,
        FINISHED_GOODS_QC_PENDING_STATUS_KEY,
        moduleItem,
        definition,
        { reason: '成品完工后发起品质抽检' }
      )
      if (statusParams) {
        statusParams.payload = {
          ...(statusParams.payload || {}),
          finished: true,
          finished_goods: true,
        }
      }
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildFinishedGoodsQcTask({
        ...savedRecord,
        module_key: moduleItem.key,
        payload: {
          ...(savedRecord.payload || {}),
          finished: true,
        },
      })
      if (!taskParams) {
        message.warning('当前记录无法生成成品抽检任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: PRODUCTION_PROGRESS_MODULE_KEY,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: FINISHED_GOODS_QC_PENDING_STATUS_KEY,
        owner_role_key: 'quality',
        payload: {
          record_title: savedRecord.title,
          notification_type: 'task_created',
          alert_type: 'finished_goods_qc_pending',
          critical_path: true,
          finished_goods: true,
        },
      })
      message.success(`成品抽检已发起：${task?.task_name || '成品抽检'}`)
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起成品抽检失败，请稍后重试')
      )
    } finally {
      setFinishedGoodsSubmitting(false)
    }
  }

  const submitSelectedShipmentForReceivableRegistration = async () => {
    if (!selectedRecord || !isShipmentFinanceActionModule) return
    if (
      selectedActiveReceivableRegistrationTask ||
      hasActiveReceivableRegistrationTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有应收登记任务')
      return
    }

    const shipmentTaskDone =
      latestSelectedShipmentReleaseTask?.task_status_key === 'done'
    const alreadyShipped =
      selectedRecord.business_status_key === FINANCE_SHIPPED_STATUS_KEY ||
      selectedRecord.payload?.shipment_result === FINANCE_SHIPPED_STATUS_KEY ||
      selectedRecord.payload?.shipped === true
    if (!alreadyShipped && !shipmentTaskDone) {
      message.warning('请先确认出货完成后再发起应收登记')
      return
    }

    setShipmentFinanceSubmitting(true)
    try {
      const statusParams = alreadyShipped
        ? null
        : buildBusinessRecordStatusUpdateParams(
            selectedRecord,
            FINANCE_SHIPPED_STATUS_KEY,
            moduleItem,
            definition,
            { reason: '出货完成后进入应收登记' }
          )
      if (statusParams) {
        statusParams.payload = {
          ...(statusParams.payload || {}),
          shipment_result: FINANCE_SHIPPED_STATUS_KEY,
          shipped: true,
        }
      }
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildReceivableRegistrationTask(
        {
          ...savedRecord,
          module_key: moduleItem.key,
          payload: {
            ...(savedRecord.payload || {}),
            shipment_result: FINANCE_SHIPPED_STATUS_KEY,
            shipped: true,
          },
        },
        latestSelectedShipmentReleaseTask
      )
      if (!taskParams) {
        message.warning('当前记录无法生成应收登记任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: FINANCE_SHIPPED_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          shipment_task_id: latestSelectedShipmentReleaseTask?.id,
          receivable_task_id: task?.id,
          shipment_result: FINANCE_SHIPPED_STATUS_KEY,
          notification_type: 'finance_pending',
          alert_type: 'finance_pending',
          critical_path: true,
          next_module_key: RECEIVABLES_MODULE_KEY,
        },
      })
      message.success(`应收登记已发起：${task?.task_name || '应收登记'}`)
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起应收登记失败，请稍后重试')
      )
    } finally {
      setShipmentFinanceSubmitting(false)
    }
  }

  const submitSelectedReceivableForInvoiceRegistration = async () => {
    if (!selectedRecord || !isReceivablesModule) return
    if (selectedActiveReceivableRegistrationTask) {
      message.warning('请先完成当前应收登记任务')
      return
    }
    if (
      selectedActiveInvoiceRegistrationTask ||
      hasActiveInvoiceRegistrationTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有开票登记任务')
      return
    }

    setShipmentFinanceSubmitting(true)
    try {
      const statusParams = buildBusinessRecordStatusUpdateParams(
        selectedRecord,
        FINANCE_RECONCILING_STATUS_KEY,
        moduleItem,
        definition,
        { reason: '应收登记完成后进入开票登记' }
      )
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const taskParams = buildInvoiceRegistrationTask(
        {
          ...savedRecord,
          module_key: moduleItem.key,
        },
        latestSelectedReceivableRegistrationTask
      )
      if (!taskParams) {
        message.warning('当前记录无法生成开票登记任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: FINANCE_RECONCILING_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          receivable_task_id: latestSelectedReceivableRegistrationTask?.id,
          invoice_task_id: task?.id,
          receivable_result: 'registered',
          notification_type: 'finance_pending',
          alert_type: 'invoice_pending',
          critical_path: false,
          next_module_key: INVOICES_MODULE_KEY,
        },
      })
      message.success(`开票登记已发起：${task?.task_name || '开票登记'}`)
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起开票登记失败，请稍后重试')
      )
    } finally {
      setShipmentFinanceSubmitting(false)
    }
  }

  const submitSelectedPurchaseForPayableRegistration = async () => {
    if (!selectedRecord || !isPurchasePayableActionModule) return
    const recordForCheck = {
      ...selectedRecord,
      module_key: moduleItem.key,
      payload: {
        ...(selectedRecord.payload || {}),
        inbound_result:
          selectedRecord.payload?.inbound_result ||
          (latestSelectedPurchaseWarehouseInboundTask?.task_status_key ===
          'done'
            ? 'done'
            : undefined),
      },
    }
    if (
      hasActivePayableRegistrationTaskForRecord(tasks, recordForCheck) ||
      selectedActivePayableRegistrationTask
    ) {
      message.warning('已有应付登记任务')
      return
    }
    if (!isPurchaseInboundDoneRecord(recordForCheck)) {
      message.warning('请先确认采购入库完成后再发起应付登记')
      return
    }

    setPayableReconciliationSubmitting(true)
    try {
      const statusParams =
        selectedRecord.business_status_key === PAYABLE_INBOUND_DONE_STATUS_KEY
          ? null
          : buildBusinessRecordStatusUpdateParams(
              selectedRecord,
              PAYABLE_INBOUND_DONE_STATUS_KEY,
              moduleItem,
              definition,
              { reason: '采购入库完成后进入应付登记' }
            )
      if (statusParams) {
        statusParams.payload = {
          ...(statusParams.payload || {}),
          inbound_result: 'done',
          payable_type: 'purchase',
        }
      }
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const payableRecord = {
        ...savedRecord,
        module_key: moduleItem.key,
        payload: {
          ...(savedRecord.payload || {}),
          inbound_result: 'done',
          payable_type: 'purchase',
        },
      }
      const taskParams = buildPurchasePayableRegistrationTask(
        payableRecord,
        latestSelectedPurchaseWarehouseInboundTask
      )
      if (!taskParams) {
        message.warning('当前记录无法生成采购应付登记任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: PAYABLE_INBOUND_DONE_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          warehouse_task_id: latestSelectedPurchaseWarehouseInboundTask?.id,
          payable_task_id: task?.id,
          inbound_result: 'done',
          notification_type: 'finance_pending',
          alert_type: 'payable_pending',
          critical_path: false,
          next_module_key: PAYABLES_MODULE_KEY,
          payable_type: 'purchase',
        },
      })
      message.success(
        `采购应付登记已发起：${task?.task_name || '采购应付登记'}`
      )
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起采购应付登记失败，请稍后重试')
      )
    } finally {
      setPayableReconciliationSubmitting(false)
    }
  }

  const submitSelectedOutsourceForPayableRegistration = async () => {
    if (!selectedRecord || !isOutsourcePayableActionModule) return
    const hasCompletedOutsourceInboundTask =
      latestSelectedOutsourceWarehouseInboundTask?.task_status_key === 'done'
    const recordForCheck = {
      ...selectedRecord,
      module_key: moduleItem.key,
      payload: {
        ...(selectedRecord.payload || {}),
        inbound_result:
          selectedRecord.payload?.inbound_result ||
          (hasCompletedOutsourceInboundTask ? 'done' : undefined),
        outsource_processing:
          selectedRecord.payload?.outsource_processing ||
          (hasCompletedOutsourceInboundTask ? true : undefined),
        payable_type: selectedRecord.payload?.payable_type,
      },
    }
    if (
      hasActivePayableRegistrationTaskForRecord(tasks, recordForCheck) ||
      selectedActivePayableRegistrationTask
    ) {
      message.warning('已有应付登记任务')
      return
    }
    if (!isOutsourceInboundDoneRecord(recordForCheck)) {
      message.warning('请先确认委外入库完成后再发起应付登记')
      return
    }

    setPayableReconciliationSubmitting(true)
    try {
      const statusParams =
        selectedRecord.business_status_key === PAYABLE_INBOUND_DONE_STATUS_KEY
          ? null
          : buildBusinessRecordStatusUpdateParams(
              selectedRecord,
              PAYABLE_INBOUND_DONE_STATUS_KEY,
              moduleItem,
              definition,
              { reason: '委外入库完成后进入应付登记' }
            )
      if (statusParams) {
        statusParams.payload = {
          ...(statusParams.payload || {}),
          inbound_result: 'done',
          outsource_processing: true,
          payable_type: 'outsource',
        }
      }
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const payableRecord = {
        ...savedRecord,
        module_key: moduleItem.key,
        payload: {
          ...(savedRecord.payload || {}),
          inbound_result: 'done',
          outsource_processing: true,
          payable_type: 'outsource',
        },
      }
      const taskParams = buildOutsourcePayableRegistrationTask(
        payableRecord,
        latestSelectedOutsourceWarehouseInboundTask
      )
      if (!taskParams) {
        message.warning('当前记录无法生成委外应付登记任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: PAYABLE_INBOUND_DONE_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          warehouse_task_id: latestSelectedOutsourceWarehouseInboundTask?.id,
          payable_task_id: task?.id,
          inbound_result: 'done',
          notification_type: 'finance_pending',
          alert_type: 'payable_pending',
          critical_path: false,
          next_module_key: PAYABLES_MODULE_KEY,
          outsource_processing: true,
          payable_type: 'outsource',
        },
      })
      message.success(
        `委外应付登记已发起：${task?.task_name || '委外应付登记'}`
      )
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起委外应付登记失败，请稍后重试')
      )
    } finally {
      setPayableReconciliationSubmitting(false)
    }
  }

  const submitSelectedPayableForReconciliation = async () => {
    if (!selectedRecord || !isPayablesModule) return
    if (selectedActivePayableRegistrationTask) {
      message.warning('请先完成当前应付登记任务')
      return
    }
    if (
      selectedActiveReconciliationTask ||
      hasActiveReconciliationTaskForRecord(tasks, {
        ...selectedRecord,
        module_key: moduleItem.key,
      })
    ) {
      message.warning('已有对账任务')
      return
    }

    const payableDone =
      latestSelectedPayableRegistrationTask?.task_status_key === 'done'
    const alreadyReconciling =
      selectedRecord.business_status_key === PAYABLE_RECONCILING_STATUS_KEY ||
      selectedRecord.payload?.payable_result === 'registered'
    if (!payableDone && !alreadyReconciling) {
      message.warning('请先完成应付登记后再发起对账')
      return
    }

    const payableType =
      latestSelectedPayableRegistrationTask?.payload?.payable_type ||
      selectedRecord.payload?.payable_type ||
      'purchase'
    const isOutsource = payableType === 'outsource'

    setPayableReconciliationSubmitting(true)
    try {
      const statusParams = alreadyReconciling
        ? null
        : buildBusinessRecordStatusUpdateParams(
            selectedRecord,
            PAYABLE_RECONCILING_STATUS_KEY,
            moduleItem,
            definition,
            { reason: '应付登记完成后进入对账' }
          )
      if (statusParams) {
        statusParams.payload = {
          ...(statusParams.payload || {}),
          payable_result: 'registered',
          payable_type: isOutsource ? 'outsource' : 'purchase',
        }
      }
      const savedRecord = statusParams
        ? await updateBusinessRecord(statusParams)
        : selectedRecord
      const reconciliationRecord = {
        ...savedRecord,
        module_key: moduleItem.key,
        payload: {
          ...(savedRecord.payload || {}),
          payable_result: 'registered',
          payable_type: isOutsource ? 'outsource' : 'purchase',
        },
      }
      const taskParams = isOutsource
        ? buildOutsourceReconciliationTask(
            reconciliationRecord,
            latestSelectedPayableRegistrationTask
          )
        : buildPurchaseReconciliationTask(
            reconciliationRecord,
            latestSelectedPayableRegistrationTask
          )
      if (!taskParams) {
        message.warning('当前记录无法生成对账任务')
        return
      }

      const task = await createWorkflowTask(taskParams)
      await upsertWorkflowBusinessState({
        source_type: moduleItem.key,
        source_id: savedRecord.id,
        source_no: taskParams.source_no,
        business_status_key: PAYABLE_RECONCILING_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          payable_task_id: latestSelectedPayableRegistrationTask?.id,
          reconciliation_task_id: task?.id,
          payable_result: 'registered',
          notification_type: 'finance_pending',
          alert_type: 'reconciliation_pending',
          critical_path: false,
          next_module_key: RECONCILIATION_MODULE_KEY,
          payable_type: isOutsource ? 'outsource' : 'purchase',
        },
      })
      message.success(`对账任务已发起：${task?.task_name || '对账'}`)
      await loadData()
      setSelectedRowKeys([savedRecord.id])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '发起对账任务失败，请稍后重试')
      )
    } finally {
      setPayableReconciliationSubmitting(false)
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
        compact
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
          compactSummaryGroups.length > 0 ? (
            <>
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
          ) : null
        }
      />

      <BusinessFilterPanel
        compact
        summary={
          <Tag className="erp-business-module-summary-chip">
            {metricKey === 'amount' ? '金额合计' : '数量合计'}{' '}
            {formatMetric(metricTotal)}
          </Tag>
        }
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
      >
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
            {isProcessingContractsModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={outsourceReturnSubmitting}
                  onClick={submitSelectedProcessingContractForOutsourceTracking}
                >
                  发起委外回货跟踪
                </Button>
                <Tag
                  color={
                    selectedActiveOutsourceReturnTrackingTask ? 'gold' : 'blue'
                  }
                >
                  委外回货：
                  {latestSelectedOutsourceReturnTrackingTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedOutsourceReturnTrackingTask.task_status_key
                      ) ||
                      latestSelectedOutsourceReturnTrackingTask.task_status_key
                    : '未发起'}
                </Tag>
                {selectedOutsourceRiskTask ? (
                  <Tag color="red">委外异常 / 检验不合格</Tag>
                ) : null}
                <Tag color="geekblue">
                  下一步：委外回货 -&gt; 品质检验 -&gt; 仓库入库
                </Tag>
              </>
            ) : null}
            {isProductionProgressModule ? (
              <>
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={finishedGoodsSubmitting}
                  onClick={submitSelectedProductionForFinishedGoodsQc}
                >
                  发起成品抽检
                </Button>
                <Tag
                  color={selectedActiveFinishedGoodsQcTask ? 'gold' : 'blue'}
                >
                  成品抽检：
                  {latestSelectedFinishedGoodsQcTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedFinishedGoodsQcTask.task_status_key
                      ) || latestSelectedFinishedGoodsQcTask.task_status_key
                    : '未发起'}
                </Tag>
                {latestSelectedFinishedGoodsInboundTask ? (
                  <Tag color="cyan">
                    成品入库：
                    {TASK_STATUS_LABELS.get(
                      latestSelectedFinishedGoodsInboundTask.task_status_key
                    ) || latestSelectedFinishedGoodsInboundTask.task_status_key}
                  </Tag>
                ) : null}
                {latestSelectedShipmentReleaseTask ? (
                  <Tag color="purple">
                    出货：
                    {TASK_STATUS_LABELS.get(
                      latestSelectedShipmentReleaseTask.task_status_key
                    ) || latestSelectedShipmentReleaseTask.task_status_key}
                  </Tag>
                ) : null}
                {selectedFinishedGoodsRiskTask ? (
                  <Tag color="red">成品抽检异常 / 返工</Tag>
                ) : null}
                <Tag color="geekblue">
                  下一步：成品抽检 -&gt; 成品入库 -&gt; 出货
                </Tag>
              </>
            ) : null}
            {isInboundModule ? (
              <>
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={outsourceReturnSubmitting}
                  onClick={submitSelectedInboundForOutsourceReturnQc}
                >
                  发起委外回货检验
                </Button>
                <Tag
                  color={selectedActiveOutsourceReturnQcTask ? 'gold' : 'blue'}
                >
                  委外检验：
                  {latestSelectedOutsourceReturnQcTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedOutsourceReturnQcTask.task_status_key
                      ) || latestSelectedOutsourceReturnQcTask.task_status_key
                    : '未发起'}
                </Tag>
              </>
            ) : null}
            {isPurchasePayableActionModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={payableReconciliationSubmitting}
                  onClick={submitSelectedPurchaseForPayableRegistration}
                >
                  发起采购应付登记
                </Button>
                <Tag color="cyan">
                  采购入库：
                  {latestSelectedPurchaseWarehouseInboundTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedPurchaseWarehouseInboundTask.task_status_key
                      ) ||
                      latestSelectedPurchaseWarehouseInboundTask.task_status_key
                    : selectedRecord.business_status_key ===
                        PAYABLE_INBOUND_DONE_STATUS_KEY
                      ? '已入库'
                      : '未确认'}
                </Tag>
                <Tag
                  color={
                    latestSelectedPurchasePayableRegistrationTask
                      ? 'gold'
                      : 'blue'
                  }
                >
                  采购应付：
                  {latestSelectedPurchasePayableRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedPurchasePayableRegistrationTask.task_status_key
                      ) ||
                      latestSelectedPurchasePayableRegistrationTask.task_status_key
                    : '未发起'}
                </Tag>
                <Tag color="geekblue">下一步：采购应付登记 -&gt; 采购对账</Tag>
              </>
            ) : null}
            {isOutsourcePayableActionModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={payableReconciliationSubmitting}
                  onClick={submitSelectedOutsourceForPayableRegistration}
                >
                  发起委外应付登记
                </Button>
                <Tag color="cyan">
                  委外入库：
                  {latestSelectedOutsourceWarehouseInboundTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedOutsourceWarehouseInboundTask.task_status_key
                      ) ||
                      latestSelectedOutsourceWarehouseInboundTask.task_status_key
                    : selectedRecord.business_status_key ===
                        PAYABLE_INBOUND_DONE_STATUS_KEY
                      ? '已入库'
                      : '未确认'}
                </Tag>
                <Tag
                  color={
                    latestSelectedOutsourcePayableRegistrationTask
                      ? 'gold'
                      : 'blue'
                  }
                >
                  委外应付：
                  {latestSelectedOutsourcePayableRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedOutsourcePayableRegistrationTask.task_status_key
                      ) ||
                      latestSelectedOutsourcePayableRegistrationTask.task_status_key
                    : '未发起'}
                </Tag>
                <Tag color="geekblue">下一步：委外应付登记 -&gt; 委外对账</Tag>
              </>
            ) : null}
            {shouldShowShipmentFinanceAction ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={shipmentFinanceSubmitting}
                  onClick={submitSelectedShipmentForReceivableRegistration}
                >
                  发起应收登记
                </Button>
                <Tag
                  color={latestSelectedShipmentReleaseTask ? 'purple' : 'blue'}
                >
                  出货任务：
                  {latestSelectedShipmentReleaseTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedShipmentReleaseTask.task_status_key
                      ) || latestSelectedShipmentReleaseTask.task_status_key
                    : '未关联'}
                </Tag>
                <Tag
                  color={
                    selectedActiveReceivableRegistrationTask ? 'gold' : 'blue'
                  }
                >
                  应收：
                  {latestSelectedReceivableRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedReceivableRegistrationTask.task_status_key
                      ) ||
                      latestSelectedReceivableRegistrationTask.task_status_key
                    : '未发起'}
                </Tag>
                {selectedFinanceRiskTask ? (
                  <Tag color="red">财务待处理 / 异常</Tag>
                ) : null}
                <Tag color="geekblue">下一步：应收登记 -&gt; 开票登记</Tag>
              </>
            ) : null}
            {isReceivablesModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={shipmentFinanceSubmitting}
                  onClick={submitSelectedReceivableForInvoiceRegistration}
                >
                  发起开票登记
                </Button>
                <Tag
                  color={
                    selectedActiveReceivableRegistrationTask ? 'gold' : 'blue'
                  }
                >
                  应收：
                  {latestSelectedReceivableRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedReceivableRegistrationTask.task_status_key
                      ) ||
                      latestSelectedReceivableRegistrationTask.task_status_key
                    : '未关联'}
                </Tag>
                <Tag
                  color={
                    selectedActiveInvoiceRegistrationTask ? 'gold' : 'blue'
                  }
                >
                  开票：
                  {latestSelectedInvoiceRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedInvoiceRegistrationTask.task_status_key
                      ) || latestSelectedInvoiceRegistrationTask.task_status_key
                    : '未发起'}
                </Tag>
                {selectedFinanceRiskTask ? (
                  <Tag color="red">财务待处理 / 异常</Tag>
                ) : null}
                <Tag color="geekblue">下一步：开票登记 -&gt; 对账中</Tag>
              </>
            ) : null}
            {isInvoicesModule ? (
              <>
                <Tag
                  color={
                    selectedActiveInvoiceRegistrationTask ? 'gold' : 'blue'
                  }
                >
                  开票：
                  {latestSelectedInvoiceRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedInvoiceRegistrationTask.task_status_key
                      ) || latestSelectedInvoiceRegistrationTask.task_status_key
                    : '未关联'}
                </Tag>
                {selectedFinanceRiskTask ? (
                  <Tag color="red">财务待处理 / 异常</Tag>
                ) : null}
                <Tag color="geekblue">
                  开票登记完成后进入对账中；当前不生成真实发票文件
                </Tag>
              </>
            ) : null}
            {isPayablesModule ? (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={payableReconciliationSubmitting}
                  onClick={submitSelectedPayableForReconciliation}
                >
                  发起对账
                </Button>
                <Tag
                  color={
                    selectedActivePayableRegistrationTask ? 'gold' : 'blue'
                  }
                >
                  应付：
                  {latestSelectedPayableRegistrationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedPayableRegistrationTask.task_status_key
                      ) || latestSelectedPayableRegistrationTask.task_status_key
                    : '未关联'}
                </Tag>
                <Tag color={selectedActiveReconciliationTask ? 'gold' : 'blue'}>
                  对账：
                  {latestSelectedReconciliationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedReconciliationTask.task_status_key
                      ) || latestSelectedReconciliationTask.task_status_key
                    : '未发起'}
                </Tag>
                {selectedFinanceRiskTask ? (
                  <Tag color="red">财务待处理 / 异常</Tag>
                ) : null}
                <Tag color="geekblue">下一步：对账完成 -&gt; 已结算</Tag>
              </>
            ) : null}
            {isReconciliationModule ? (
              <>
                <Tag color={selectedActiveReconciliationTask ? 'gold' : 'blue'}>
                  对账：
                  {latestSelectedReconciliationTask
                    ? TASK_STATUS_LABELS.get(
                        latestSelectedReconciliationTask.task_status_key
                      ) || latestSelectedReconciliationTask.task_status_key
                    : '未关联'}
                </Tag>
                {selectedFinanceRiskTask ? (
                  <Tag color="red">财务待处理 / 异常</Tag>
                ) : null}
                <Tag color="geekblue">
                  对账完成后进入已结算；当前不生成凭证和付款流水
                </Tag>
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
        onUrgeTask={openUrgeTaskModal}
        urgingTaskID={urgingTaskID}
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
        title="催办协同任务"
        open={urgeTaskModalState.open}
        onCancel={closeUrgeTaskModal}
        onOk={submitUrgeTask}
        okText="记录催办"
        cancelText="取消"
        confirmLoading={Boolean(urgingTaskID)}
        centered
        forceRender
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            当前任务：
            {urgeTaskModalState.task?.task_name || '-'}
            。催办会写入任务事件，不改变任务状态。
          </Text>
          <Form form={urgeReasonForm} layout="vertical">
            <Form.Item
              name="urge_reason"
              label="催办原因"
              rules={[
                { required: true, message: '请填写催办原因' },
                { max: 300, message: '催办原因不能超过 300 字' },
              ]}
            >
              <Input.TextArea
                rows={4}
                showCount
                maxLength={300}
                placeholder="说明交期、资料、异常或当前需要对方处理的事项"
              />
            </Form.Item>
          </Form>
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
        styles={{
          body: {
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
          },
        }}
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
            {!editingRecord && isSourcePrefillAvailable ? (
              <Col xs={24}>
                <Card size="small" title="来源带值">
                  <Row gutter={[12, 12]} align="bottom">
                    <Col xs={24} md={8}>
                      <Form.Item label="来源模块" style={{ marginBottom: 0 }}>
                        <Select
                          options={sourcePrefillModuleOptions}
                          value={sourcePrefillState.moduleKey}
                          onChange={handleSourcePrefillModuleChange}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={10}>
                      <Form.Item label="来源单号" style={{ marginBottom: 0 }}>
                        <Input
                          value={sourcePrefillState.keyword}
                          placeholder="输入来源单号"
                          onChange={handleSourcePrefillKeywordChange}
                          onPressEnter={applySourcePrefill}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item label="操作" style={{ marginBottom: 0 }}>
                        <Space wrap>
                          <Button
                            type="primary"
                            icon={<LinkOutlined />}
                            loading={sourcePrefillState.loading}
                            onClick={applySourcePrefill}
                          >
                            带值
                          </Button>
                          <Button
                            icon={<RollbackOutlined />}
                            disabled={sourcePrefillState.loading}
                            onClick={clearSourcePrefill}
                          >
                            清空
                          </Button>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>
            ) : null}
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
                              {definition.itemFields.map((field) => {
                                const rowValues = watchedItems?.[name] || {}
                                return (
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
                                        {renderItemField(field, rowValues)}
                                      </Form.Item>
                                    </Space>
                                  </Col>
                                )
                              })}
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
