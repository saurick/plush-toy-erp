import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
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
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import {
  PurchaseOrderFormFields,
  createBlankPurchaseLine,
  normalizePurchaseLineFormValue,
} from '../components/purchase-orders/PurchaseOrderForm.jsx'
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  listMaterials,
  listPurchaseOrderItems,
  listPurchaseOrders,
  listSuppliers,
  listUnits,
  savePurchaseOrderWithItems,
  submitPurchaseOrder,
} from '../api/masterDataOrderApi.mjs'
import { createPurchaseReceiptFromPurchaseOrder } from '../api/purchaseApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
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
  buildSequentialDraftCode,
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
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
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
  const [units, setUnits] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
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

  const applySelectedRowKeys = useCallback((nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    selectedRowKeysRef.current = normalizedKeys
    setSelectedRowKeys(normalizedKeys)
  }, [])

  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, warehouseOptionFromRecord),
    [inventoryLots]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, materialData, unitData, lotData] = await Promise.all(
        [
          listSuppliers({ active_only: true, limit: 200 }),
          listMaterials({ active_only: true, limit: 200 }),
          listUnits({ limit: 500 }),
          listInventoryLots({ limit: 500 }),
        ]
      )
      setSuppliers(supplierData?.suppliers || [])
      setMaterials(materialData?.materials || [])
      setUnits(unitData?.units || [])
      setInventoryLots(lotData?.inventory_lots || [])
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
      purchase_order_no: buildSequentialDraftCode(orders, {
        prefix: 'PO',
        field: 'purchase_order_no',
      }),
      supplier_id: undefined,
      supplier_purchase_order_no: '',
      purchase_date: todayInputValue(),
      expected_arrival_date: '',
      note: '',
      items: [createBlankPurchaseLine(1)],
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
          .map(normalizePurchaseLineFormValue).length > 0
          ? lines
              .filter((line) => line.line_status !== 'canceled')
              .map(normalizePurchaseLineFormValue)
          : [createBlankPurchaseLine(1)],
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
          type: 'radio',
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
                '.ant-checkbox-wrapper, .ant-checkbox, .ant-radio-wrapper, .ant-radio, .ant-table-selection-column'
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
        adminProfile={adminProfile}
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
        onClose={() => setColumnOrderOpen(false)}
      />

      <BusinessFormModal
        open={modalOpen}
        title={editingOrder ? '编辑采购订单' : '新建采购订单'}
        description="只维护采购承诺，不在此写库存、质检或应付事实。"
        okText="保存"
        confirmLoading={saving || itemsLoading}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        forceRender
      >
        <PurchaseOrderFormFields
          form={form}
          suppliers={suppliers}
          materials={materials}
          unitOptions={unitOptions}
          onSupplierChange={handleSupplierChange}
          onMaterialChange={handleMaterialChange}
        />
      </BusinessFormModal>
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
            label="入库仓库"
            rules={[{ required: true, message: '请选择入库仓库' }]}
          >
            <Select
              allowClear
              optionFilterProp="label"
              options={warehouseOptions}
              placeholder="请选择入库仓库"
              showSearch
            />
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
