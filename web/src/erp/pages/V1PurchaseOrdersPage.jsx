import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  ImportOutlined,
  LinkOutlined,
  PlusOutlined,
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
  BusinessOperationPanel,
  BusinessDataTable,
  CollaborationTaskPanel,
  DateInput,
  DateRangeFilter,
  BusinessPageLayout,
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
import SourceImportPickerModal from '../components/business-list/SourceImportPickerModal.jsx'
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  listMaterials,
  listPurchaseOrderItems,
  listPurchaseOrders,
  listSuppliers,
  savePurchaseOrderWithItems,
  submitPurchaseOrder,
} from '../api/masterDataOrderApi.mjs'
import { createPurchaseReceiptFromPurchaseOrder } from '../api/purchaseApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import {
  PURCHASE_ORDER_STATUS_COLORS,
  PURCHASE_ORDER_STATUS_LABELS,
  V1_ROUTE_PATHS,
  buildMaterialPurchaseContractDraftFromPurchaseOrder,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSupplierSnapshot,
  canRunPurchaseOrderLifecycleAction,
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
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已审核', value: 'approved' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

const SORT_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '采购日期新到旧', value: 'purchase_date:desc' },
  { label: '采购日期旧到新', value: 'purchase_date:asc' },
  { label: '预计到货新到旧', value: 'expected_arrival_date:desc' },
  { label: '预计到货旧到新', value: 'expected_arrival_date:asc' },
]

const DATE_FILTER_OPTIONS = [
  { label: '采购日期', value: 'purchase_date' },
  { label: '预计到货', value: 'expected_arrival_date' },
]

const LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'purchase.order.update',
    nextStatus: 'submitted',
    run: submitPurchaseOrder,
  },
  {
    key: 'approve',
    label: '审核',
    permission: 'purchase.order.approve',
    nextStatus: 'approved',
    run: approvePurchaseOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'purchase.order.update',
    nextStatus: 'closed',
    confirmTitle: '确认关闭采购订单',
    confirmContent: '关闭后该采购订单不再继续推进，是否继续？',
    okText: '确认关闭',
    run: closePurchaseOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'purchase.order.update',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消采购订单',
    confirmContent: '取消后该采购订单不再继续推进，是否继续？',
    okText: '确认取消',
    run: cancelPurchaseOrder,
  },
]

const BUSINESS_FORM_MODAL_WIDTH = 'min(1040px, calc(100vw - 96px))'
const PURCHASE_ORDERS_MODULE_KEY = 'accessories-purchase'
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

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
}

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={PURCHASE_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, PURCHASE_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function createBlankLine(lineNo = 1) {
  return {
    line_no: lineNo,
    material_id: undefined,
    unit_id: undefined,
    material_code_snapshot: '',
    material_name_snapshot: '',
    color_snapshot: '',
    purchased_quantity: '',
    unit_price: '',
    amount: '',
    expected_arrival_date: '',
    note: '',
  }
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

function purchaseLineAmount(line = {}) {
  const explicitAmount = decimalNumber(line.amount)
  if (explicitAmount > 0) {
    return explicitAmount
  }
  return decimalNumber(line.purchased_quantity) * decimalNumber(line.unit_price)
}

function summarizePurchaseLines(lines = []) {
  const items = Array.isArray(lines) ? lines : []
  return items.reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.purchased_quantity),
      amount: summary.amount + purchaseLineAmount(line),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function createLineFromMaterial(material = {}, lineNo = 1) {
  return {
    ...createBlankLine(lineNo),
    material_id: material.id,
    unit_id: material.default_unit_id,
    material_code_snapshot: material.code || '',
    material_name_snapshot: material.name || '',
    color_snapshot: material.color || '',
  }
}

function normalizeLine(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    material_id: item.material_id,
    unit_id: item.unit_id,
    material_code_snapshot: item.material_code_snapshot || '',
    material_name_snapshot: item.material_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    purchased_quantity: item.purchased_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    expected_arrival_date: unixToDateInputValue(item.expected_arrival_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

function supplierLabel(supplier = {}) {
  return [supplier.code, supplier.name].filter(Boolean).join(' / ')
}

function materialLabel(material = {}) {
  return [material.code, material.name].filter(Boolean).join(' / ')
}

function workflowPayloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export default function V1PurchaseOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [form] = Form.useForm()
  const [inboundDraftForm] = Form.useForm()
  const canCreate = hasActionPermission(adminProfile, 'purchase.order.create')
  const canUpdate = hasActionPermission(adminProfile, 'purchase.order.update')
  const canCreatePurchaseReceipt = hasActionPermission(
    adminProfile,
    'purchase.receipt.create'
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

  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printingContract, setPrintingContract] = useState(false)
  const [generatingInboundDraft, setGeneratingInboundDraft] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dateFilterField, setDateFilterField] = useState('purchase_date')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [editingOrder, setEditingOrder] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inboundDraftModalOpen, setInboundDraftModalOpen] = useState(false)
  const [materialImportOpen, setMaterialImportOpen] = useState(false)

  const applySelectedRowKeys = useCallback((nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    selectedRowKeysRef.current = normalizedKeys
    setSelectedRowKeys(normalizedKeys)
  }, [])

  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )

  const materialOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        label: materialLabel(item),
        item,
      })),
    [materials]
  )
  const watchedItems = Form.useWatch('items', form) || []
  const lineSummary = summarizePurchaseLines(watchedItems)
  const materialImportColumns = useMemo(
    () => [
      {
        title: '材料编码',
        dataIndex: 'code',
        width: 150,
        searchText: (material) => materialLabel(material),
      },
      {
        title: '材料名称',
        dataIndex: 'name',
        width: 190,
        searchText: (material) => materialLabel(material),
      },
      { title: '分类', dataIndex: 'category', width: 120 },
      { title: '规格', dataIndex: 'spec', width: 170 },
      { title: '颜色', dataIndex: 'color', width: 110 },
      { title: '默认单位', dataIndex: 'default_unit_id', width: 100 },
    ],
    []
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, materialData] = await Promise.all([
        listSuppliers({ active_only: true, limit: 200 }),
        listMaterials({ active_only: true, limit: 200 }),
      ])
      setSuppliers(supplierData?.suppliers || [])
      setMaterials(materialData?.materials || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购基础资料失败'))
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { sortBy, sortDirection } = parseSortValue(sortValue)
      const data = await listPurchaseOrders({
        keyword,
        lifecycle_status: status,
        date_field: dateFilterField,
        date_from: dateFilterStart || undefined,
        date_to: dateFilterEnd || undefined,
        sort_by: sortBy,
        sort_direction: sortDirection,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      })
      const nextOrders = data?.purchase_orders || []
      setOrders(nextOrders)
      setTotal(Number(data?.total || 0))
      const validKeys = selectedRowKeysRef.current.filter((key) =>
        nextOrders.some((item) => item.id === key)
      )
      applySelectedRowKeys(validKeys)
      if (validKeys.length === 1) {
        setSelectedOrder(nextOrders.find((item) => item.id === validKeys[0]))
      } else {
        setSelectedOrder(null)
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购订单失败'))
    } finally {
      setLoading(false)
    }
  }, [
    applySelectedRowKeys,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    pagination,
    sortValue,
    status,
  ])

  const loadWorkflowTasks = useCallback(async () => {
    if (!canReadWorkflowTasks) {
      setWorkflowTasks([])
      return
    }
    try {
      const data = await listWorkflowTasks({
        source_type: PURCHASE_ORDERS_MODULE_KEY,
        limit: 200,
      })
      setWorkflowTasks(data?.tasks || [])
    } catch (error) {
      setWorkflowTasks([])
      message.error(getActionErrorMessage(error, '加载采购协同任务失败'))
    }
  }, [canReadWorkflowTasks])

  const loadOrderItems = useCallback(async (order) => {
    if (!order?.id) {
      return []
    }
    setItemsLoading(true)
    try {
      const data = await listPurchaseOrderItems({
        purchase_order_id: order.id,
        limit: 200,
      })
      const nextItems = data?.purchase_order_items || []
      return nextItems
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购订单明细失败'))
      return []
    } finally {
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  const refreshPageData = useCallback(async () => {
    await Promise.all([loadOrders(), loadWorkflowTasks()])
  }, [loadOrders, loadWorkflowTasks])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const openCreateModal = () => {
    setEditingOrder(null)
    form.setFieldsValue({
      purchase_order_no: '',
      supplier_id: undefined,
      supplier_purchase_order_no: '',
      purchase_date: todayInputValue(),
      expected_arrival_date: '',
      note: '',
      items: [createBlankLine(1)],
    })
    setModalOpen(true)
  }

  const openEditModal = async (record) => {
    const lines = await loadOrderItems(record)
    setEditingOrder(record)
    form.setFieldsValue({
      purchase_order_no: record.purchase_order_no || '',
      supplier_id: record.supplier_id,
      supplier_purchase_order_no: record.supplier_purchase_order_no || '',
      purchase_date: unixToDateInputValue(record.purchase_date),
      expected_arrival_date: unixToDateInputValue(record.expected_arrival_date),
      note: record.note || '',
      items:
        lines
          .filter((line) => line.line_status !== 'canceled')
          .map(normalizeLine).length > 0
          ? lines
              .filter((line) => line.line_status !== 'canceled')
              .map(normalizeLine)
          : [createBlankLine(1)],
    })
    setModalOpen(true)
  }

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
  }

  const handleMaterialChange = (fieldName, materialID) => {
    const material = materials.find((item) => item.id === materialID)
    if (!material) return
    form.setFieldValue(
      ['items', fieldName, 'unit_id'],
      material.default_unit_id
    )
    form.setFieldValue(
      ['items', fieldName, 'material_code_snapshot'],
      material.code
    )
    form.setFieldValue(
      ['items', fieldName, 'material_name_snapshot'],
      material.name
    )
    form.setFieldValue(
      ['items', fieldName, 'color_snapshot'],
      material.color || ''
    )
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const supplier = suppliers.find((item) => item.id === values.supplier_id)
      const params = buildPurchaseOrderParams(values, {
        id: editingOrder?.id,
        supplier_snapshot: buildSupplierSnapshot(supplier),
        items: (values.items || []).map((line, index) =>
          buildPurchaseOrderItemParams(line, {
            id: line.id,
            line_no: Number(line.line_no || index + 1),
          })
        ),
      })
      setSaving(true)
      const result = await savePurchaseOrderWithItems(params)
      const saved = result?.purchase_order
      if (saved) {
        setSelectedOrder(saved)
        applySelectedRowKeys([saved.id])
        await loadOrderItems(saved)
      }
      setModalOpen(false)
      message.success('采购订单已保存')
      await loadOrders()
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '保存采购订单失败'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, record) => {
    setSaving(true)
    try {
      const updated = await action.run({ id: record.id })
      message.success(`采购订单已${action.label}`)
      if (updated) {
        setSelectedOrder(updated)
        applySelectedRowKeys([updated.id])
        await loadOrderItems(updated)
      }
      await loadOrders()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${action.label}采购订单失败`))
    } finally {
      setSaving(false)
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
          purchase_order_page_action: 'complete',
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
          purchase_order_page_action: 'block',
          blocked_reason: reason,
        },
      })
      message.success('阻塞原因已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const urgePurchaseWorkflowTask = useCallback(
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
          entry: 'purchase_order_page',
        },
      })
      message.success('催办已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const requestLifecycleAction = (action, record) => {
    if (!action || !record) {
      return
    }
    if (!action.confirmTitle) {
      runLifecycleAction(action, record)
      return
    }
    modal.confirm({
      centered: true,
      title: action.confirmTitle,
      content: action.confirmContent,
      okText: action.okText || `确认${action.label}`,
      cancelText: '取消',
      okButtonProps: action.danger ? { danger: true } : undefined,
      onOk: () => runLifecycleAction(action, record),
    })
  }

  const printPurchaseContract = async (record) => {
    if (!record) {
      return
    }
    setPrintingContract(true)
    try {
      const items = await loadOrderItems(record)
      if (items.length === 0) {
        message.warning('当前采购订单没有可打印的明细')
        return
      }
      const initialDraft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
        record,
        items,
        { materials }
      )
      openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
      })
      message.success('已打开采购合同打印模板')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开采购合同打印模板失败'))
    } finally {
      setPrintingContract(false)
    }
  }

  const openInboundDraftModal = (record) => {
    if (!record) {
      return
    }
    inboundDraftForm.setFieldsValue({
      receipt_no: `IN-${record.purchase_order_no || record.id}`,
      warehouse_id: undefined,
      received_at: todayInputValue(),
      note: `来源采购订单 ${record.purchase_order_no || record.id}`,
    })
    setInboundDraftModalOpen(true)
  }

  const createInboundDraftFromOrder = async () => {
    if (!singleSelectedOrder) {
      return
    }
    try {
      const values = await inboundDraftForm.validateFields()
      setGeneratingInboundDraft(true)
      await createPurchaseReceiptFromPurchaseOrder({
        purchase_order_id: singleSelectedOrder.id,
        receipt_no: values.receipt_no,
        warehouse_id: Number(values.warehouse_id || 0),
        received_at: values.received_at,
        note: values.note || undefined,
      })
      setInboundDraftModalOpen(false)
      message.success('采购入库草稿已生成')
      navigate(V1_ROUTE_PATHS.purchaseReceipts)
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '生成采购入库草稿失败'))
    } finally {
      setGeneratingInboundDraft(false)
    }
  }

  const resolveSupplierName = useCallback(
    (record = {}) =>
      record?.supplier_snapshot?.name ||
      suppliers.find((item) => item.id === record.supplier_id)?.name ||
      record.supplier_id ||
      '未指定供应商',
    [suppliers]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(PURCHASE_ORDERS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: PURCHASE_ORDERS_MODULE_KEY,
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
          title: '采购单号',
          exportTitle: '采购单号',
          dataIndex: 'purchase_order_no',
          width: 180,
          fixed: 'left',
          sorter: (a, b) =>
            compareText(a?.purchase_order_no, b?.purchase_order_no),
        },
        {
          title: '供应商',
          exportTitle: '供应商',
          dataIndex: 'supplier_id',
          width: 160,
          sortValue: resolveSupplierName,
          render: (_value, record) => resolveSupplierName(record),
          exportValue: (record) => resolveSupplierName(record),
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'lifecycle_status',
          width: 110,
          sortValue: (record) =>
            statusText(record?.lifecycle_status, PURCHASE_ORDER_STATUS_LABELS),
          render: statusTag,
          exportValue: (record) =>
            statusText(record?.lifecycle_status, PURCHASE_ORDER_STATUS_LABELS),
        },
        {
          title: '采购日期',
          exportTitle: '采购日期',
          dataIndex: 'purchase_date',
          width: 130,
          sorter: (a, b) => compareNumber(a?.purchase_date, b?.purchase_date),
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record?.purchase_date),
        },
        {
          title: '预计到货',
          exportTitle: '预计到货',
          dataIndex: 'expected_arrival_date',
          width: 130,
          sorter: (a, b) =>
            compareNumber(a?.expected_arrival_date, b?.expected_arrival_date),
          render: formatUnixDate,
          exportValue: (record) =>
            formatUnixDate(record?.expected_arrival_date),
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 160,
          sorter: (a, b) => compareNumber(a?.updated_at, b?.updated_at),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ]),
    [resolveSupplierName]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: PURCHASE_ORDERS_MODULE_KEY,
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
    if (orders.length === 0) return
    downloadCSV({
      filename: `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleDataColumns,
      rows: orders,
    })
  }, [orders, visibleDataColumns])

  const selectedOrders = useMemo(
    () => orders.filter((record) => selectedRowKeys.includes(record.id)),
    [orders, selectedRowKeys]
  )
  const singleSelectedOrder =
    selectedRowKeys.length === 1 ? selectedOrders[0] || selectedOrder : null
  const selectedOrderWorkflowTasks = useMemo(
    () =>
      singleSelectedOrder?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: PURCHASE_ORDERS_MODULE_KEY,
            sourceIDs: [singleSelectedOrder.id],
          })
        : [],
    [singleSelectedOrder, workflowTasks]
  )

  const stats = [
    { key: 'total', label: '总订单', value: total },
    { key: 'current', label: '当前结果', value: orders.length },
    {
      key: 'approved',
      label: '已审核',
      value: orders.filter((item) => item.lifecycle_status === 'approved')
        .length,
    },
    { key: 'selected', label: '已选订单', value: selectedRowKeys.length },
  ]
  const selectedOrderDisplayText =
    selectedOrders.length === 1
      ? `${
          selectedOrders[0]?.purchase_order_no || selectedOrders[0]?.id
        } / ${resolveSupplierName(selectedOrders[0])}`
      : selectedOrders.length > 1
        ? `已选择 ${selectedOrders.length} 张采购订单`
        : '请先选择采购订单'
  const selectedItems = selectedOrders.map((record) => ({
    key: record.id,
    label: record.purchase_order_no || `采购订单 ${record.id}`,
    title: `${resolveSupplierName(record)} / ${
      PURCHASE_ORDER_STATUS_LABELS[record.lifecycle_status] ||
      record.lifecycle_status ||
      '-'
    }`,
  }))
  const selectedOrderCanEdit =
    singleSelectedOrder &&
    canUpdate &&
    !['closed', 'canceled'].includes(singleSelectedOrder.lifecycle_status)
  const canGenerateInboundDraft =
    canCreatePurchaseReceipt &&
    singleSelectedOrder?.lifecycle_status === 'approved'
  const relatedMenuItems = [
    { key: 'order-items', label: '采购订单明细' },
    { key: 'purchase-receipts', label: '采购入库' },
    { key: 'quality-inspections', label: '来料质检' },
    { key: 'inventory', label: '库存台账' },
  ]
  const openRelatedTable = ({ key }) => {
    if (!singleSelectedOrder) {
      return
    }
    if (key === 'order-items') {
      openEditModal(singleSelectedOrder)
      return
    }
    if (key === 'purchase-receipts') {
      navigate(V1_ROUTE_PATHS.purchaseReceipts)
      return
    }
    if (key === 'quality-inspections') {
      navigate(V1_ROUTE_PATHS.qualityInspections)
      return
    }
    if (key === 'inventory') {
      navigate(V1_ROUTE_PATHS.inventory)
    }
  }
  const visibleLifecycleActions = useMemo(() => {
    if (!singleSelectedOrder) {
      return []
    }
    return LIFECYCLE_ACTIONS.filter(
      (action) =>
        hasActionPermission(adminProfile, action.permission) &&
        canRunPurchaseOrderLifecycleAction(
          singleSelectedOrder.lifecycle_status,
          action.nextStatus
        )
    )
  }, [adminProfile, singleSelectedOrder])
  const primaryLifecycleAction =
    visibleLifecycleActions.find((action) => action.key !== 'cancel') || null
  const secondaryLifecycleActions = visibleLifecycleActions.filter(
    (action) => action.key !== primaryLifecycleAction?.key
  )
  const lifecycleMenuItems =
    secondaryLifecycleActions.length > 0
      ? [
          {
            key: 'status-transitions',
            label: '状态变更',
            type: 'group',
            children: secondaryLifecycleActions.map((action) => ({
              key: action.key,
              label: action.label,
              danger: action.danger,
            })),
          },
        ]
      : []

  return (
    <BusinessPageLayout className="erp-v1-purchase-orders-page">
      <PageHeaderCard
        title="采购订单"
        description="维护供应商采购承诺；采购订单不写库存，不替代采购入库、退货、质检或应付事实。"
        stats={stats}
        compact
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索采购单号 / 供应商单号"
              onChange={(event) => {
                setPagination((current) => ({ ...current, current: 1 }))
                setKeyword(event.target.value)
              }}
              onPressEnter={loadOrders}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setPagination((current) => ({ ...current, current: 1 }))
                setStatus(value)
              }}
            />
            <DateRangeFilter
              options={DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(value) => {
                setPagination((current) => ({ ...current, current: 1 }))
                setDateFilterField(value || 'purchase_date')
              }}
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onStartChange={(value) => {
                setPagination((current) => ({ ...current, current: 1 }))
                setDateFilterStart(value)
              }}
              onEndChange={(value) => {
                setPagination((current) => ({ ...current, current: 1 }))
                setDateFilterEnd(value)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--sort"
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
              disabled={orders.length === 0}
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
            <Tooltip title="采购订单当前没有物理删除或回收站 API；如需退出使用，请走取消或关闭状态。">
              <span>
                <ToolbarButton icon={<DeleteOutlined />} danger disabled>
                  批量删除
                </ToolbarButton>
              </span>
            </Tooltip>
            <Tooltip title="当前 purchase_order JSON-RPC 没有回收站主路径，列表不做前端假恢复。">
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
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreateModal}
          >
            新建采购订单
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedOrderDisplayText}
          selectedItems={selectedItems}
        >
          <Button
            type="link"
            size="small"
            disabled={selectedRowKeys.length === 0}
            onClick={() => {
              applySelectedRowKeys([])
              setSelectedOrder(null)
            }}
          >
            清空
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!selectedOrderCanEdit}
            onClick={() => openEditModal(singleSelectedOrder)}
          >
            编辑
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={selectedRowKeys.length !== 1 || !singleSelectedOrder}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={selectedRowKeys.length !== 1 || !singleSelectedOrder}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          {primaryLifecycleAction ? (
            <Button
              size="small"
              type="primary"
              disabled={
                saving || selectedRowKeys.length !== 1 || !singleSelectedOrder
              }
              loading={saving}
              onClick={() =>
                requestLifecycleAction(
                  primaryLifecycleAction,
                  singleSelectedOrder
                )
              }
            >
              {primaryLifecycleAction.label}
            </Button>
          ) : null}
          <Tooltip
            title={
              canGenerateInboundDraft
                ? '按当前采购订单剩余明细生成采购入库草稿'
                : '仅已审核采购订单且具备采购入库创建权限时可生成'
            }
          >
            <span>
              <Button
                size="small"
                type="primary"
                icon={<ImportOutlined />}
                disabled={
                  !canGenerateInboundDraft ||
                  selectedRowKeys.length !== 1 ||
                  !singleSelectedOrder
                }
                loading={generatingInboundDraft}
                onClick={() => openInboundDraftModal(singleSelectedOrder)}
              >
                生成入库
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            disabled={
              selectedRowKeys.length !== 1 ||
              !singleSelectedOrder ||
              itemsLoading
            }
            loading={printingContract}
            onClick={() => printPurchaseContract(singleSelectedOrder)}
          >
            打印合同
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={
              saving ||
              selectedRowKeys.length !== 1 ||
              !singleSelectedOrder ||
              secondaryLifecycleActions.length === 0
            }
            menu={{
              items: lifecycleMenuItems,
              onClick: ({ key }) => {
                const action = secondaryLifecycleActions.find(
                  (item) => item.key === key
                )
                requestLifecycleAction(action, singleSelectedOrder)
              },
            }}
          >
            <Button
              size="small"
              aria-label="更多操作"
              disabled={
                saving ||
                selectedRowKeys.length !== 1 ||
                !singleSelectedOrder ||
                secondaryLifecycleActions.length === 0
              }
            >
              更多 <DownOutlined />
            </Button>
          </Dropdown>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={orders}
        scroll={{ x: 1200 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (nextKeys, nextRows) => {
            applySelectedRowKeys(nextKeys)
            const nextSingle = nextKeys.length === 1 ? nextRows[0] : null
            if (nextSingle?.id) {
              setSelectedOrder(nextSingle)
            } else {
              setSelectedOrder(null)
            }
          },
        }}
        rowClassName={(record) =>
          selectedRowKeys.includes(record?.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: (event) => {
            if (
              event.target?.closest?.(
                '.ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column'
              )
            ) {
              return
            }
            applySelectedRowKeys([record.id])
            setSelectedOrder(record)
          },
          onDoubleClick: () => openEditModal(record),
        })}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
        emptyDescription="暂无采购订单"
      />

      <CollaborationTaskPanel
        tasks={workflowTasks}
        selectedTasks={selectedOrderWorkflowTasks}
        selectedRecordLabel={singleSelectedOrder?.purchase_order_no || ''}
        roleLabelMap={WORKFLOW_ROLE_LABELS}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgePurchaseWorkflowTask : undefined
        }
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="采购订单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onReset={() => persistColumnOrder([], dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        open={modalOpen}
        title={
          <div className="erp-business-action-modal__title">
            <span>{editingOrder ? '编辑采购订单' : '新建采购订单'}</span>
            <small>只维护采购承诺，不在此写库存、质检或应付事实。</small>
          </div>
        }
        okText="保存"
        confirmLoading={saving || itemsLoading}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          className="erp-business-action-form"
        >
          <Form.Item name="supplier_snapshot" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="purchase_order_no"
            label="采购单号"
            rules={[{ required: true, message: '请输入采购单号' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="supplier_id"
            label="供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              showSearch
              options={supplierOptions}
              optionFilterProp="label"
              onChange={handleSupplierChange}
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="supplier_purchase_order_no"
            label="供应商单号"
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="purchase_date"
            label="采购日期"
            rules={[{ required: true, message: '请选择采购日期' }]}
          >
            <DateInput />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="expected_arrival_date"
            label="预计到货"
          >
            <DateInput />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            name="note"
            label="备注"
          >
            <Input maxLength={255} />
          </Form.Item>

          <section className="erp-sales-order-lines-form">
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  <div className="erp-line-items-form__import-row">
                    <div className="erp-line-items-form__import-copy">
                      <strong>导入材料</strong>
                      <span>
                        从来源选择器导入；数量、单价和预计到货回到采购明细维护。
                      </span>
                    </div>
                    <Button
                      className="erp-line-items-form__import-button"
                      onClick={() => setMaterialImportOpen(true)}
                    >
                      从材料库导入
                    </Button>
                  </div>
                  <SourceImportPickerModal
                    open={materialImportOpen}
                    title="从材料库导入采购明细"
                    description="这里只选择材料来源；数量、单价和预计到货仍在主弹窗采购明细里维护。"
                    rows={materials}
                    columns={materialImportColumns}
                    getSelectedLabel={(material) =>
                      material?.material_no ||
                      material?.code ||
                      material?.name ||
                      material?.id ||
                      '-'
                    }
                    searchPlaceholder="搜索材料编码、名称、分类、规格或颜色"
                    emptyDescription="暂无可导入材料"
                    onCancel={() => setMaterialImportOpen(false)}
                    onImport={(selectedMaterials) => {
                      let nextLineNo = getNextLineNo(
                        form.getFieldValue('items') || []
                      )
                      selectedMaterials.forEach((material) => {
                        add(createLineFromMaterial(material, nextLineNo))
                        nextLineNo += 1
                      })
                      setMaterialImportOpen(false)
                    }}
                  />
                  <div className="erp-sales-order-lines-form__head">
                    <div>
                      <strong>采购明细</strong>
                      <span>同一个采购订单内维护多条供应商承诺明细。</span>
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
                            name={[field.name, 'material_id']}
                            label="材料"
                            rules={[{ required: true, message: '请选择材料' }]}
                          >
                            <Select
                              showSearch
                              options={materialOptions}
                              optionFilterProp="label"
                              onChange={(value) =>
                                handleMaterialChange(field.name, value)
                              }
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'unit_id']}
                            label="单位ID"
                            rules={[
                              { required: true, message: '请输入单位ID' },
                            ]}
                          >
                            <InputNumber
                              min={1}
                              precision={0}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'material_code_snapshot']}
                            label="材料编码快照"
                          >
                            <Input maxLength={64} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'material_name_snapshot']}
                            label="材料名称快照"
                          >
                            <Input maxLength={255} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'color_snapshot']}
                            label="颜色快照"
                          >
                            <Input maxLength={64} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'purchased_quantity']}
                            label="采购数量"
                            rules={[
                              { required: true, message: '请输入采购数量' },
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
                            <Input placeholder="留空时按数量和单价派生" />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'expected_arrival_date']}
                            label="预计到货"
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
                        onClick={() => {
                          const currentLines = form.getFieldValue('items') || []
                          add(createBlankLine(getNextLineNo(currentLines)))
                        }}
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
                          {formatSummaryNumber(lineSummary.quantity)}
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
      <Modal
        title="生成采购入库草稿"
        open={inboundDraftModalOpen}
        centered
        width={520}
        okText="生成草稿"
        cancelText="取消"
        confirmLoading={generatingInboundDraft}
        onOk={createInboundDraftFromOrder}
        onCancel={() => setInboundDraftModalOpen(false)}
      >
        <Form
          form={inboundDraftForm}
          layout="vertical"
          className="erp-business-form"
        >
          <Form.Item
            name="receipt_no"
            label="入库单号"
            rules={[{ required: true, message: '请输入入库单号' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="warehouse_id"
            label="入库仓库 ID"
            rules={[{ required: true, message: '请输入入库仓库 ID' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="received_at"
            label="入库日期"
            rules={[{ required: true, message: '请选择入库日期' }]}
          >
            <DateInput />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
