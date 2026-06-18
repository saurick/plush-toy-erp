import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  LinkOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
} from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateInput,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
import {
  cancelOutsourcingOrder,
  closeOutsourcingOrder,
  confirmOutsourcingOrder,
  listOutsourcingOrderItems,
  listOutsourcingOrders,
  listProcesses,
  listProducts,
  listSuppliers,
  listUnits,
  saveOutsourcingOrderWithItems,
  submitOutsourcingOrder,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  OUTSOURCING_ORDER_STATUS_COLORS,
  OUTSOURCING_ORDER_STATUS_LABELS,
  V1_ROUTE_PATHS,
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderParams,
  buildSupplierSnapshot,
  canRunOutsourcingOrderLifecycleAction,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import { filterBusinessCollaborationTasksBySource } from '../utils/businessCollaborationTasks.mjs'
import {
  applyBusinessColumnSorters,
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { ROLE_DISPLAY_NAMES } from '../utils/roleKeys.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../data/processingContractTemplate.mjs'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已确认', value: 'confirmed' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

const SORT_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '下单日期新到旧', value: 'order_date:desc' },
  { label: '下单日期旧到新', value: 'order_date:asc' },
  { label: '预计回货新到旧', value: 'expected_return_date:desc' },
  { label: '预计回货旧到新', value: 'expected_return_date:asc' },
]

const DATE_FILTER_OPTIONS = [
  { label: '下单日期', value: 'order_date' },
  { label: '预计回货', value: 'expected_return_date' },
]

const LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'outsourcing.order.update',
    nextStatus: 'submitted',
    run: submitOutsourcingOrder,
  },
  {
    key: 'confirm',
    label: '确认下单',
    permission: 'outsourcing.order.confirm',
    nextStatus: 'confirmed',
    run: confirmOutsourcingOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'outsourcing.order.update',
    nextStatus: 'closed',
    confirmTitle: '确认关闭加工合同',
    confirmContent: '关闭后该加工合同不再继续推进，是否继续？',
    okText: '确认关闭',
    run: closeOutsourcingOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'outsourcing.order.update',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消加工合同',
    confirmContent:
      '取消只终止合同源单，不会自动冲正已经登记的发料、回货或财务事实。',
    okText: '确认取消',
    run: cancelOutsourcingOrder,
  },
]

const DEFAULT_PAGINATION = { current: 1, pageSize: 20 }
const BUSINESS_FORM_MODAL_WIDTH = 'min(1080px, calc(100vw - 96px))'
const OUTSOURCING_ORDERS_MODULE_KEY = 'processing-contracts'
const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const WORKFLOW_ROLE_LABELS = new Map(Object.entries(ROLE_DISPLAY_NAMES))

function parseSortValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') return
  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }
  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) return sanitizedAccountOrder
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, columns, rows }) {
  const header = columns.map((column) => csvEscape(getColumnLabel(column)))
  const body = rows.map((row) =>
    columns.map((column) => {
      const rawValue =
        typeof column.exportValue === 'function'
          ? column.exportValue(row)
          : row?.[column.dataIndex]
      return csvEscape(rawValue)
    })
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

function formatSummaryNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value) || value === 0) {
    return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0'
  }
  return fractionDigits > 0
    ? value.toFixed(fractionDigits)
    : String(Number(value.toFixed(4)))
}

function lineAmount(line = {}) {
  const explicitAmount = decimalNumber(line.amount)
  if (explicitAmount > 0) return explicitAmount
  return (
    decimalNumber(line.outsourcing_quantity) * decimalNumber(line.unit_price)
  )
}

function summarizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.outsourcing_quantity),
      amount: summary.amount + lineAmount(line),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function getNextLineNo(lines = []) {
  return (
    lines.reduce((maxValue, line) => {
      const lineNo = Number(line?.line_no || 0)
      return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
    }, 0) + 1
  )
}

function createBlankLine(lineNo = 1) {
  return {
    line_no: lineNo,
    product_id: undefined,
    process_id: undefined,
    unit_id: undefined,
    product_no_snapshot: '',
    product_name_snapshot: '',
    process_name_snapshot: '',
    process_category_snapshot: '',
    unit_name_snapshot: '',
    outsourcing_quantity: '',
    unit_price: '',
    amount: '',
    expected_return_date: '',
    note: '',
  }
}

function normalizeLine(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    product_id: item.product_id,
    process_id: item.process_id,
    unit_id: item.unit_id,
    product_no_snapshot: item.product_no_snapshot || '',
    product_name_snapshot: item.product_name_snapshot || '',
    process_name_snapshot: item.process_name_snapshot || '',
    process_category_snapshot: item.process_category_snapshot || '',
    unit_name_snapshot: item.unit_name_snapshot || '',
    outsourcing_quantity: item.outsourcing_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    expected_return_date: unixToDateInputValue(item.expected_return_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

function supplierLabel(supplier = {}) {
  return [supplier.code, supplier.short_name || supplier.name]
    .filter(Boolean)
    .join(' / ')
}

function productLabel(product = {}) {
  return [product.code, product.name].filter(Boolean).join(' / ')
}

function processLabel(process = {}) {
  return [process.code, process.name, process.category]
    .filter(Boolean)
    .join(' / ')
}

function unitLabel(unit = {}) {
  return [unit.code, unit.name].filter(Boolean).join(' / ')
}

function workflowPayloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={OUTSOURCING_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, OUTSOURCING_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function canEditOrder(record) {
  return Boolean(
    record && !['closed', 'canceled'].includes(record.lifecycle_status)
  )
}

export default function V1OutsourcingOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [form] = Form.useForm()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateField, setDateField] = useState('order_date')
  const [dateRange, setDateRange] = useState([null, null])
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION)
  const [selectedRow, setSelectedRow] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [processes, setProcesses] = useState([])
  const [units, setUnits] = useState([])

  const watchedItems = Form.useWatch('items', form) || []
  const lineSummary = summarizeLines(watchedItems)

  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )

  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: productLabel(item),
        item,
      })),
    [products]
  )

  const processOptions = useMemo(
    () =>
      processes
        .filter((item) => item.outsourcing_enabled === true)
        .map((item) => ({
          value: item.id,
          label: processLabel(item),
          item,
        })),
    [processes]
  )

  const unitOptions = useMemo(
    () =>
      units.map((item) => ({
        value: item.id,
        label: unitLabel(item),
        item,
      })),
    [units]
  )

  const unitByID = useMemo(
    () => new Map(units.map((item) => [item.id, item])),
    [units]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, productData, processData, unitData] =
        await Promise.all([
          listSuppliers({ active_only: true, limit: 200 }),
          listProducts({ active_only: true, limit: 200 }),
          listProcesses({ active_only: true, limit: 200 }),
          listUnits({ limit: 200 }),
        ])
      setSuppliers(supplierData?.suppliers || [])
      setProducts(productData?.products || [])
      setProcesses(processData?.processes || [])
      setUnits(unitData?.units || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载委外基础资料失败'))
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { sortBy, sortDirection } = parseSortValue(sortValue)
      const data = await listOutsourcingOrders({
        keyword,
        lifecycle_status: statusFilter,
        date_field: dateField,
        date_from: dateRange?.[0] || undefined,
        date_to: dateRange?.[1] || undefined,
        sort_by: sortBy,
        sort_direction: sortDirection,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      })
      const nextRows = data?.outsourcing_orders || []
      setRows(nextRows)
      setTotal(Number(data?.total || 0))
      setSelectedRow((prev) =>
        prev ? nextRows.find((item) => item.id === prev.id) || null : null
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载委外订单失败'))
    } finally {
      setLoading(false)
    }
  }, [dateField, dateRange, keyword, pagination, sortValue, statusFilter])

  const loadOrderItems = useCallback(async (order) => {
    if (!order?.id) return []
    const data = await listOutsourcingOrderItems({
      outsourcing_order_id: order.id,
      limit: 200,
    })
    return data?.outsourcing_order_items || []
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const canCreate = hasActionPermission(
    adminProfile,
    'outsourcing.order.create'
  )
  const canUpdate = hasActionPermission(
    adminProfile,
    'outsourcing.order.update'
  )
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

  const openCreate = () => {
    setEditingRow(null)
    form.setFieldsValue({
      outsourcing_order_no: '',
      supplier_id: undefined,
      source_order_no: '',
      order_date: todayInputValue(),
      expected_return_date: '',
      note: '',
      items: [createBlankLine(1)],
    })
    setModalOpen(true)
  }

  const openEdit = async (record) => {
    if (!record) return
    setSaving(true)
    try {
      const items = await loadOrderItems(record)
      setEditingRow(record)
      form.setFieldsValue({
        ...record,
        order_date: unixToDateInputValue(record.order_date),
        expected_return_date: unixToDateInputValue(record.expected_return_date),
        items:
          items.length > 0
            ? items.map((item) => normalizeLine(item))
            : [createBlankLine(1)],
      })
      setModalOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载加工合同明细失败'))
    } finally {
      setSaving(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRow(null)
    form.resetFields()
  }

  const loadWorkflowTasks = useCallback(async () => {
    if (!canReadWorkflowTasks) {
      setWorkflowTasks([])
      return
    }
    try {
      const data = await listWorkflowTasks({
        source_type: OUTSOURCING_ORDERS_MODULE_KEY,
        limit: 200,
      })
      setWorkflowTasks(data?.tasks || [])
    } catch (error) {
      setWorkflowTasks([])
      message.error(getActionErrorMessage(error, '加载委外协同任务失败'))
    }
  }, [canReadWorkflowTasks])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  const refreshPageData = useCallback(async () => {
    await Promise.all([loadOrders(), loadWorkflowTasks()])
  }, [loadOrders, loadWorkflowTasks])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const handleProductChange = (fieldName, productID) => {
    const product = products.find((item) => item.id === productID)
    if (!product) return
    const unit = unitByID.get(product.default_unit_id)
    form.setFieldValue(
      ['items', fieldName, 'product_no_snapshot'],
      product.code
    )
    form.setFieldValue(
      ['items', fieldName, 'product_name_snapshot'],
      product.name
    )
    form.setFieldValue(['items', fieldName, 'unit_id'], product.default_unit_id)
    form.setFieldValue(
      ['items', fieldName, 'unit_name_snapshot'],
      unit?.name || ''
    )
  }

  const handleProcessChange = (fieldName, processID) => {
    const process = processes.find((item) => item.id === processID)
    if (!process) return
    form.setFieldValue(
      ['items', fieldName, 'process_name_snapshot'],
      process.name
    )
    form.setFieldValue(
      ['items', fieldName, 'process_category_snapshot'],
      process.category || ''
    )
  }

  const handleUnitChange = (fieldName, unitID) => {
    const unit = unitByID.get(unitID)
    form.setFieldValue(
      ['items', fieldName, 'unit_name_snapshot'],
      unit?.name || ''
    )
  }

  const submitForm = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const supplier = suppliers.find((item) => item.id === values.supplier_id)
      const payload = buildOutsourcingOrderParams(
        {
          ...values,
          supplier_snapshot: buildSupplierSnapshot(supplier),
        },
        {
          id: editingRow?.id || undefined,
          items: (values.items || []).map((item) =>
            buildOutsourcingOrderItemParams(item)
          ),
        }
      )
      const saved = await saveOutsourcingOrderWithItems(payload)
      const savedOrder = saved?.outsourcing_order || null
      setSelectedRow(savedOrder)
      message.success(editingRow ? '加工合同已更新' : '加工合同已创建')
      closeModal()
      await Promise.all([loadOrders(), loadWorkflowTasks()])
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '保存加工合同失败'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action) => {
    if (!selectedRow) return
    const execute = async () => {
      setSaving(true)
      try {
        const updated = await action.run({ id: selectedRow.id })
        setSelectedRow(updated)
        message.success(`${action.label}成功`)
        await Promise.all([loadOrders(), loadWorkflowTasks()])
      } catch (error) {
        message.error(getActionErrorMessage(error, `${action.label}失败`))
      } finally {
        setSaving(false)
      }
    }

    if (action.confirmTitle) {
      modal.confirm({
        title: action.confirmTitle,
        content: action.confirmContent,
        okText: action.okText || '确认',
        cancelText: '取消',
        okButtonProps: { danger: action.danger },
        onOk: execute,
      })
      return
    }
    await execute()
  }

  const openPrint = async () => {
    if (!selectedRow) return
    setPrinting(true)
    try {
      const items = await loadOrderItems(selectedRow)
      const initialDraft = buildProcessingContractDraftFromOutsourcingOrder(
        selectedRow,
        items
      )
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
      })
      message.success('已打开加工合同打印模板')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印失败'))
    } finally {
      setPrinting(false)
    }
  }

  const completeWorkflowTask = useCallback(
    async (task) => {
      await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: 'done',
        business_status_key: task.business_status_key || undefined,
        reason: '',
        payload: {
          ...workflowPayloadOf(task),
          outsourcing_order_page_action: 'complete',
        },
      })
      message.success('任务已处理完成')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: 'blocked',
        business_status_key: 'blocked',
        reason,
        payload: {
          ...workflowPayloadOf(task),
          outsourcing_order_page_action: 'block',
          blocked_reason: reason,
        },
      })
      message.success('阻塞原因已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const urgeOutsourcingWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await urgeWorkflowTask({
        task_id: task.id,
        action: 'urge_task',
        reason,
        actor_role_key: 'admin',
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          entry: 'outsourcing_order_page',
        },
      })
      message.success('催办已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const selectedLabel = selectedRow
    ? `${selectedRow.outsourcing_order_no} / ${
        selectedRow.supplier_snapshot?.short_name ||
        selectedRow.supplier_snapshot?.name ||
        '未指定加工厂'
      }`
    : '请先选择一份加工合同'

  const activeRows = rows.length
  const draftCount = rows.filter(
    (item) => item.lifecycle_status === 'draft'
  ).length
  const confirmedCount = rows.filter(
    (item) => item.lifecycle_status === 'confirmed'
  ).length
  const closedCount = rows.filter((item) =>
    ['closed', 'canceled'].includes(item.lifecycle_status)
  ).length

  const resolveSupplierName = useCallback(
    (record = {}) =>
      record?.supplier_snapshot?.short_name ||
      record?.supplier_snapshot?.name ||
      suppliers.find((item) => item.id === record.supplier_id)?.short_name ||
      suppliers.find((item) => item.id === record.supplier_id)?.name ||
      '未指定加工厂',
    [suppliers]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(OUTSOURCING_ORDERS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: OUTSOURCING_ORDERS_MODULE_KEY,
          order: sanitizedOrder,
        })
        outletContext?.updateAdminERPPreferences?.(erpPreferences)
        message.success(
          sanitizedOrder.length > 0 ? '列顺序已保存' : '列顺序已恢复默认'
        )
      } catch (error) {
        message.warning(
          `${getActionErrorMessage(error, '保存列顺序')}，已保留本地设置`
        )
      } finally {
        setColumnOrderSaving(false)
      }
    },
    [outletContext]
  )

  const dataColumns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '加工合同号',
          exportTitle: '加工合同号',
          dataIndex: 'outsourcing_order_no',
          width: 180,
          fixed: 'left',
          sortType: 'text',
        },
        {
          title: '加工厂',
          exportTitle: '加工厂',
          dataIndex: 'supplier_id',
          width: 180,
          sortValue: resolveSupplierName,
          render: (_, record) => resolveSupplierName(record),
          exportValue: resolveSupplierName,
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'lifecycle_status',
          width: 110,
          sortValue: (record) =>
            statusText(
              record?.lifecycle_status,
              OUTSOURCING_ORDER_STATUS_LABELS
            ),
          render: statusTag,
          exportValue: (record) =>
            statusText(
              record?.lifecycle_status,
              OUTSOURCING_ORDER_STATUS_LABELS
            ),
        },
        {
          title: '来源订单',
          exportTitle: '来源订单',
          dataIndex: 'source_order_no',
          width: 160,
          sortType: 'text',
          render: (value) => value || '-',
          exportValue: (record) => record?.source_order_no || '',
        },
        {
          title: '下单日期',
          exportTitle: '下单日期',
          dataIndex: 'order_date',
          width: 140,
          render: formatUnixDate,
          sortType: 'number',
          exportValue: (record) => formatUnixDate(record?.order_date),
        },
        {
          title: '预计回货',
          exportTitle: '预计回货',
          dataIndex: 'expected_return_date',
          width: 140,
          render: formatUnixDate,
          sortType: 'number',
          exportValue: (record) => formatUnixDate(record?.expected_return_date),
        },
        {
          title: '备注',
          exportTitle: '备注',
          dataIndex: 'note',
          width: 220,
          render: (value) => value || '-',
          exportValue: (record) => record?.note || '',
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 170,
          render: formatUnixDateTime,
          sortType: 'number',
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ]),
    [resolveSupplierName]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: OUTSOURCING_ORDERS_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const visibleDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
  )

  const columns = useMemo(
    () =>
      visibleDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={dataColumns}
            order={preferredColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
            onOpenPanel={() => setColumnOrderOpen(true)}
          />
        ),
      })),
    [
      columnOrderSaving,
      dataColumns,
      persistColumnOrder,
      preferredColumnOrder,
      visibleDataColumns,
    ]
  )

  const exportOrders = useCallback(() => {
    if (rows.length === 0) return
    downloadCSV({
      filename: `outsourcing-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleDataColumns,
      rows,
    })
  }, [rows, visibleDataColumns])

  const selectedWorkflowTasks = useMemo(
    () =>
      selectedRow?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
            sourceIDs: [selectedRow.id],
          })
        : [],
    [selectedRow, workflowTasks]
  )

  const relatedMenuItems = [
    { key: 'details', label: '加工明细' },
    { key: 'quality-inspections', label: '质检记录' },
    { key: 'inventory', label: '库存台账' },
    { key: 'payables', label: '应付管理' },
  ]

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    if (key === 'details') {
      openEdit(selectedRow)
      return
    }
    if (key === 'quality-inspections') {
      navigate(V1_ROUTE_PATHS.qualityInspections)
      return
    }
    if (key === 'inventory') {
      navigate(V1_ROUTE_PATHS.inventory)
      return
    }
    if (key === 'payables') {
      navigate(V1_ROUTE_PATHS.payables)
    }
  }

  return (
    <BusinessPageLayout className="erp-v1-outsourcing-orders-page">
      <PageHeaderCard
        compact
        title="委外订单"
        description="维护加工合同源单、工序明细、加工厂承诺和打印快照；发料、回货、质检、应付仍由对应事实 usecase 承接。"
        tags={[
          <Tag color="blue" key="source">
            Source Document：加工合同
          </Tag>,
          <Tag color="green" key="process">
            工序来自加工环节字典
          </Tag>,
          <Tag color="gold" key="fact">
            不直接写库存 / 应付
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总记录', value: total },
          { key: 'current', label: '当前结果', value: activeRows },
          { key: 'draft', label: '草稿', value: draftCount },
          { key: 'confirmed', label: '已确认', value: confirmedCount },
          { key: 'closed', label: '已关闭/取消', value: closedCount },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索合同号或来源订单"
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => {
                setPagination(DEFAULT_PAGINATION)
                loadOrders()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setStatusFilter(value)
                setPagination(DEFAULT_PAGINATION)
              }}
            />
            <DateRangeFilter
              options={DATE_FILTER_OPTIONS}
              value={dateField}
              onTypeChange={(value) => {
                setDateField(value || 'order_date')
                setPagination(DEFAULT_PAGINATION)
              }}
              startValue={dateRange?.[0] || ''}
              endValue={dateRange?.[1] || ''}
              onStartChange={(value) => {
                setDateRange((current) => [value, current?.[1] || ''])
                setPagination(DEFAULT_PAGINATION)
              }}
              onEndChange={(value) => {
                setDateRange((current) => [current?.[0] || '', value])
                setPagination(DEFAULT_PAGINATION)
              }}
            />
            <SelectFilter
              value={sortValue}
              options={SORT_OPTIONS}
              onChange={setSortValue}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={rows.length === 0}
              onClick={exportOrders}
            >
              导出当前结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
            <Tooltip title="加工合同源单当前没有物理删除 API；退出推进请走取消或关闭状态。">
              <span>
                <ToolbarButton icon={<DeleteOutlined />} danger disabled>
                  批量删除
                </ToolbarButton>
              </span>
            </Tooltip>
            <Tooltip title="当前 outsourcing_order JSON-RPC 没有回收站主路径，页面不做前端假恢复。">
              <span>
                <ToolbarButton icon={<InboxOutlined />} disabled>
                  回收站
                </ToolbarButton>
              </span>
            </Tooltip>
          </Space>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建加工合同
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          boundaryText="加工合同只表达委外承诺和打印快照；确认下单不自动写库存、质检、应付或 Workflow 完成。"
        >
          {selectedRow ? statusTag(selectedRow.lifecycle_status) : null}
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!selectedRow || !canUpdate || !canEditOrder(selectedRow)}
            onClick={() => openEdit(selectedRow)}
          >
            编辑
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedRow}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          {LIFECYCLE_ACTIONS.map((action) => (
            <Button
              key={action.key}
              size="small"
              type={action.key === 'confirm' ? 'primary' : 'default'}
              danger={action.danger}
              icon={
                action.danger ? (
                  <CloseCircleOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              disabled={
                !selectedRow ||
                saving ||
                !hasActionPermission(adminProfile, action.permission) ||
                !canRunOutsourcingOrderLifecycleAction(
                  selectedRow.lifecycle_status,
                  action.nextStatus
                )
              }
              onClick={() => runLifecycleAction(action)}
            >
              {action.label}
            </Button>
          ))}
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!selectedRow || printing}
            loading={printing}
            onClick={openPrint}
          >
            加工合同打印
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRow(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
        })}
        emptyDescription="暂无加工合同"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
          showTotal: (nextTotal, range) =>
            `第 ${range[0]}-${range[1]} 条 / 共 ${nextTotal} 条`,
        }}
        scroll={{ x: 1220 }}
      />

      <CollaborationTaskPanel
        tasks={workflowTasks}
        selectedTasks={selectedWorkflowTasks}
        selectedRecordLabel={selectedRow?.outsourcing_order_no || ''}
        roleLabelMap={WORKFLOW_ROLE_LABELS}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeOutsourcingWorkflowTask : undefined
        }
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="委外订单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onReset={() => persistColumnOrder([], dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        title={
          <div className="erp-business-action-modal__title">
            <FileTextOutlined />
            <span>{editingRow ? '编辑加工合同' : '新建加工合同'}</span>
            <small>只维护委外源单；库存和应付由后续事实动作处理。</small>
          </div>
        }
        open={modalOpen}
        onCancel={closeModal}
        onOk={submitForm}
        confirmLoading={saving}
        centered
        forceRender
        width={BUSINESS_FORM_MODAL_WIDTH}
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          className="erp-business-action-form"
        >
          <Form.Item
            className="erp-business-action-form__field"
            name="outsourcing_order_no"
            label="加工合同号"
            rules={[{ required: true, message: '请输入加工合同号' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="supplier_id"
            label="加工厂"
            rules={[{ required: true, message: '请选择加工厂' }]}
          >
            <Select
              showSearch
              options={supplierOptions}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="source_order_no"
            label="来源订单号"
          >
            <Input maxLength={128} placeholder="如产品订单编号 / 销售订单号" />
          </Form.Item>
          <Form.Item name="source_sales_order_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="order_date"
            label="下单日期"
            rules={[{ required: true, message: '请选择下单日期' }]}
          >
            <DateInput />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="expected_return_date"
            label="预计回货"
          >
            <DateInput />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field erp-business-action-form__field--full"
            name="note"
            label="备注"
          >
            <Input maxLength={255} />
          </Form.Item>

          <section className="erp-sales-order-lines-form">
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  <div className="erp-sales-order-lines-form__head">
                    <div>
                      <strong>加工明细</strong>
                    </div>
                  </div>
                  <div className="erp-sales-order-lines-form__list">
                    {fields.map((field, index) => (
                      <div
                        className="erp-sales-order-lines-form__row"
                        key={field.key}
                      >
                        <div className="erp-sales-order-lines-form__row-head">
                          <strong>第 {index + 1} 行</strong>
                          <Button
                            danger
                            type="text"
                            icon={<DeleteOutlined />}
                            disabled={fields.length <= 1}
                            onClick={() => remove(field.name)}
                          >
                            删除行
                          </Button>
                        </div>
                        <div className="erp-sales-order-lines-form__grid">
                          <Form.Item name={[field.name, 'id']} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'line_no']}
                            label="行号"
                            rules={[{ required: true, message: '请输入行号' }]}
                          >
                            <InputNumber
                              min={1}
                              precision={0}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'product_id']}
                            label="产品"
                            rules={[{ required: true, message: '请选择产品' }]}
                          >
                            <Select
                              showSearch
                              options={productOptions}
                              optionFilterProp="label"
                              onChange={(value) =>
                                handleProductChange(field.name, value)
                              }
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'process_id']}
                            label="工序"
                            rules={[{ required: true, message: '请选择工序' }]}
                          >
                            <Select
                              showSearch
                              options={processOptions}
                              optionFilterProp="label"
                              onChange={(value) =>
                                handleProcessChange(field.name, value)
                              }
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'unit_id']}
                            label="单位"
                            rules={[{ required: true, message: '请选择单位' }]}
                          >
                            <Select
                              showSearch
                              options={unitOptions}
                              optionFilterProp="label"
                              onChange={(value) =>
                                handleUnitChange(field.name, value)
                              }
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'product_no_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'product_name_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'process_name_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'process_category_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'unit_name_snapshot']}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'outsourcing_quantity']}
                            label="加工数量"
                            rules={[
                              { required: true, message: '请输入加工数量' },
                            ]}
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'unit_price']}
                            label="单价"
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item name={[field.name, 'amount']} label="金额">
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'expected_return_date']}
                            label="行预计回货"
                          >
                            <DateInput />
                          </Form.Item>
                          <Form.Item name={[field.name, 'note']} label="备注">
                            <Input maxLength={255} />
                          </Form.Item>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="erp-line-items-form__footer">
                    <div className="erp-line-items-form__footer-actions">
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() =>
                          add(
                            createBlankLine(
                              getNextLineNo(form.getFieldValue('items') || [])
                            )
                          )
                        }
                      >
                        添加条目
                      </Button>
                    </div>
                    <div className="erp-line-items-form__stats">
                      <span className="erp-line-items-form__stat">
                        已录入
                        <strong className="erp-line-items-form__stat-value">
                          {lineSummary.count}
                        </strong>
                        条
                      </span>
                      <span className="erp-line-items-form__stat">
                        数量合计
                        <strong className="erp-line-items-form__stat-value">
                          {formatSummaryNumber(lineSummary.quantity, 3)}
                        </strong>
                      </span>
                      <span className="erp-line-items-form__stat">
                        金额合计
                        <strong className="erp-line-items-form__stat-value">
                          {formatSummaryNumber(lineSummary.amount, 2)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </>
              )}
            </Form.List>
          </section>
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
