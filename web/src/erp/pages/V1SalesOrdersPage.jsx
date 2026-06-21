import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Space, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  CollaborationTaskPanel,
  BusinessPageLayout,
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
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import {
  activateSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
  listCustomers,
  listProductSKUs,
  listSalesOrderItems,
  listSalesOrders,
  saveSalesOrderWithItems,
  submitSalesOrder,
} from '../api/masterDataOrderApi.mjs'
import {
  SalesOrderFormFields,
  SalesOrderItemsFormSection,
  createBlankOrderLine,
  normalizeSalesOrderItemFormValue,
} from '../components/sales-orders/SalesOrderForm.jsx'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  SALES_ORDER_ITEM_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
  V1_ROUTE_PATHS,
  buildCustomerSnapshot,
  buildPaymentConditionOptions,
  buildSequentialDraftCode,
  canRunSalesOrderLifecycleAction,
  deriveSalesOrderItemAmount,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  formatPaymentCondition,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  mergePaymentConditionOptions,
  normalizeOptionalNonNegativeInteger,
  resolvePaymentTermDays,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import {
  applyBusinessColumnSorters,
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  routeWithQuery,
  searchParamPositiveIntText,
} from '../utils/routeQuery.mjs'
import {
  customerOption,
  uniqueReferenceOptions,
} from '../utils/referenceSelectOptions.mjs'

const STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已生效', value: 'active' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

const DATE_FILTER_OPTIONS = [
  { label: '订单日期', value: 'order_date' },
  { label: '计划交付', value: 'planned_delivery_date' },
]

const SORT_FILTER_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '订单日期新到旧', value: 'order_date:desc' },
  { label: '订单日期旧到新', value: 'order_date:asc' },
  { label: '交付日期新到旧', value: 'planned_delivery_date:desc' },
  { label: '交付日期旧到新', value: 'planned_delivery_date:asc' },
]

const LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'sales_order.submit',
    nextStatus: 'submitted',
    run: submitSalesOrder,
  },
  {
    key: 'activate',
    label: '生效',
    permission: 'sales_order.activate',
    nextStatus: 'active',
    run: activateSalesOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'sales_order.close',
    nextStatus: 'closed',
    confirmTitle: '确认关闭销售订单',
    confirmContent: '关闭后该销售订单不再继续推进，是否继续？',
    okText: '确认关闭',
    run: closeSalesOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'sales_order.cancel',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消销售订单',
    confirmContent: '取消后该销售订单不再继续推进，是否继续？',
    okText: '确认取消',
    run: cancelSalesOrder,
  },
]

const SALES_ORDERS_MODULE_KEY = 'sales-orders'
const SALES_ORDER_ITEMS_MODULE_KEY = 'sales-order-items'
const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const OPEN_LINE_STATUS = 'open'

function parseSortFilterValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') {
    return []
  }

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
  if (typeof window === 'undefined') {
    return
  }

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
  if (sanitizedAccountOrder.length > 0) {
    return sanitizedAccountOrder
  }
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
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

function salesOrderStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={SALES_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, SALES_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function lineStatusTag(status) {
  const key = String(status || '').trim()
  return <Tag>{statusText(key, SALES_ORDER_ITEM_STATUS_LABELS)}</Tag>
}

export default function V1SalesOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [itemLoading, setItemLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('order_date')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [sortFilter, setSortFilter] = useState('updated_at:desc')
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [orderColumnOrder, setOrderColumnOrder] = useState(null)
  const [itemColumnOrder, setItemColumnOrder] = useState(null)
  const [columnOrderTarget, setColumnOrderTarget] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [orderForm] = Form.useForm()
  const [productSKUs, setProductSKUs] = useState([])
  const routeSalesOrderID = searchParamPositiveIntText(
    searchParams,
    'sales_order_id'
  )
  const paymentConditionSnapshotRef = useRef({
    method: '',
    termDays: undefined,
  })

  const canCreateOrder = hasActionPermission(adminProfile, 'sales_order.create')
  const canUpdateOrder = hasActionPermission(adminProfile, 'sales_order.update')
  const canCreateItem = hasActionPermission(
    adminProfile,
    'sales_order_item.create'
  )
  const canUpdateItem = hasActionPermission(
    adminProfile,
    'sales_order_item.update'
  )
  const canCancelItem = hasActionPermission(
    adminProfile,
    'sales_order_item.cancel'
  )
  const customerOptions = useMemo(
    () => uniqueReferenceOptions(customers, customerOption),
    [customers]
  )
  const paymentConditionOptions = useMemo(
    () =>
      mergePaymentConditionOptions(
        buildPaymentConditionOptions(customers),
        buildPaymentConditionOptions(orders, {
          methodField: 'payment_method',
          termDaysField: 'payment_term_days',
        })
      ),
    [customers, orders]
  )

  const readPaymentCondition = useCallback(() => {
    const values = orderForm.getFieldsValue([
      'payment_method',
      'payment_term_days',
    ])
    return {
      method: String(values.payment_method || '').trim(),
      termDays: normalizeOptionalNonNegativeInteger(values.payment_term_days),
    }
  }, [orderForm])

  const rememberPaymentCondition = useCallback((values = {}) => {
    paymentConditionSnapshotRef.current = {
      method: String(values.payment_method || '').trim(),
      termDays: normalizeOptionalNonNegativeInteger(values.payment_term_days),
    }
  }, [])

  const hasPricedOrderLines = useCallback(() => {
    const lines = orderForm.getFieldValue('items')
    return (Array.isArray(lines) ? lines : []).some((line) =>
      ['unit_price', 'amount'].some((field) =>
        String(line?.[field] ?? '').trim()
      )
    )
  }, [orderForm])

  const clearOrderLinePrices = useCallback(() => {
    const lines = orderForm.getFieldValue('items')
    orderForm.setFieldValue(
      'items',
      (Array.isArray(lines) ? lines : []).map((line) => ({
        ...line,
        unit_price: '',
        amount: '',
      }))
    )
  }, [orderForm])

  const requestPaymentConditionPriceReview = useCallback(() => {
    const current = readPaymentCondition()
    const previous = paymentConditionSnapshotRef.current
    if (
      current.method === previous.method &&
      current.termDays === previous.termDays
    ) {
      return
    }
    paymentConditionSnapshotRef.current = current
    if (!hasPricedOrderLines()) {
      return
    }
    modal.confirm({
      centered: true,
      title: '付款条件已变化，请核对单价',
      content:
        '付款方式或账期会影响本单成交价。系统不会自动重算单价，请选择保留当前单价或清空明细单价后重新报价。',
      okText: '清空单价重新报价',
      cancelText: '保留当前单价',
      onOk: clearOrderLinePrices,
    })
  }, [clearOrderLinePrices, hasPricedOrderLines, readPaymentCondition])

  const applyPaymentMethodTermDays = useCallback(
    (method) => {
      const termDays = resolvePaymentTermDays(method, paymentConditionOptions)
      if (termDays !== undefined) {
        orderForm.setFieldValue('payment_term_days', termDays)
      }
    },
    [orderForm, paymentConditionOptions]
  )

  const applyCustomerPaymentDefaults = useCallback(
    (customerID) => {
      const customer = customers.find((item) => item.id === customerID)
      const termDays = normalizeOptionalNonNegativeInteger(
        customer?.default_payment_term_days
      )
      orderForm.setFieldsValue({
        payment_method: customer?.default_payment_method || undefined,
        payment_term_days: termDays,
      })
      requestPaymentConditionPriceReview()
    },
    [customers, orderForm, requestPaymentConditionPriceReview]
  )

  const loadCustomers = useCallback(async () => {
    try {
      const [customerResult, skuResult] = await Promise.all([
        listCustomers({ active_only: true, limit: 200 }),
        listProductSKUs({ active_only: true, limit: 200 }),
      ])
      setCustomers(
        Array.isArray(customerResult?.customers) ? customerResult.customers : []
      )
      setProductSKUs(
        Array.isArray(skuResult?.product_skus) ? skuResult.product_skus : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载客户和 SKU 选项'))
    }
  }, [])

  const loadItems = useCallback(async (order) => {
    if (!order?.id) {
      setItems([])
      return
    }
    setItemLoading(true)
    try {
      const result = await listSalesOrderItems({
        sales_order_id: order.id,
        limit: 200,
      })
      setItems(
        Array.isArray(result?.sales_order_items) ? result.sales_order_items : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载订单行'))
    } finally {
      setItemLoading(false)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { sortBy, sortDirection } = parseSortFilterValue(sortFilter)
      const result = await listSalesOrders({
        keyword,
        customer_id: customerFilter || undefined,
        lifecycle_status: statusFilter,
        date_field: dateFilterField,
        date_from: dateFilterStart || undefined,
        date_to: dateFilterEnd || undefined,
        sort_by: sortBy,
        sort_direction: sortDirection,
        ...getBusinessPaginationParams(pagination),
      })
      const nextOrders = Array.isArray(result?.sales_orders)
        ? result.sales_orders
        : []
      setOrders(nextOrders)
      setTotal(Number(result?.total || nextOrders.length || 0))
      setSelectedOrder((current) => {
        const routeSelectedID = Number(routeSalesOrderID || 0)
        if (routeSelectedID > 0) {
          return nextOrders.find((item) => item.id === routeSelectedID) || null
        }
        if (!current?.id) return null
        return nextOrders.find((item) => item.id === current.id) || null
      })
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载销售订单'))
      return false
    } finally {
      setLoading(false)
    }
  }, [
    customerFilter,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    pagination,
    routeSalesOrderID,
    sortFilter,
    statusFilter,
  ])

  useEffect(() => {
    loadCustomers()
    loadOrders()
  }, [loadCustomers, loadOrders])

  useEffect(() => {
    loadItems(selectedOrder)
  }, [loadItems, selectedOrder])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadOrders)
  }, [loadOrders, outletContext])

  const openCreateOrder = () => {
    setEditingOrder(null)
    orderForm.resetFields()
    orderForm.setFieldsValue({
      order_no: buildSequentialDraftCode(orders, {
        prefix: 'SO',
        field: 'order_no',
      }),
      order_date: new Date().toISOString().slice(0, 10),
      items: [createBlankOrderLine(1)],
    })
    rememberPaymentCondition({})
    setOrderModalOpen(true)
  }

  const openEditOrder = async (order) => {
    if (!order?.id) return
    setSelectedOrder(order)
    setEditingOrder(order)
    orderForm.setFieldsValue({
      ...order,
      order_date: unixToDateInputValue(order.order_date),
      planned_delivery_date: unixToDateInputValue(order.planned_delivery_date),
      items: [],
    })
    rememberPaymentCondition(order)
    setOrderModalOpen(true)
    setItemLoading(true)
    try {
      const result = await listSalesOrderItems({
        sales_order_id: order.id,
        limit: 200,
      })
      const nextItems = Array.isArray(result?.sales_order_items)
        ? result.sales_order_items
        : []
      setItems(nextItems)
      const openItems = nextItems.filter(
        (item) => String(item?.line_status) === OPEN_LINE_STATUS
      )
      orderForm.setFieldsValue({
        ...order,
        order_date: unixToDateInputValue(order.order_date),
        planned_delivery_date: unixToDateInputValue(
          order.planned_delivery_date
        ),
        items: openItems.map(normalizeSalesOrderItemFormValue),
      })
      rememberPaymentCondition(order)
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载订单行'))
    } finally {
      setItemLoading(false)
    }
  }

  const saveOrder = async () => {
    const values = await orderForm.validateFields()
    const customer = customers.find((item) => item.id === values.customer_id)
    setSaving(true)
    try {
      const params = buildSalesOrderParams(
        {
          ...values,
          customer_snapshot: buildCustomerSnapshot(customer),
        },
        editingOrder?.id ? { id: editingOrder.id } : {}
      )
      const result = await saveSalesOrderWithItems({
        ...params,
        items: (Array.isArray(values.items) ? values.items : []).map((item) =>
          buildSalesOrderItemParams(item, item?.id ? { id: item.id } : {})
        ),
      })
      const saved = result?.sales_order || null
      const savedItems = Array.isArray(result?.sales_order_items)
        ? result.sales_order_items
        : []
      message.success(
        editingOrder?.id ? '销售订单与订单行已更新' : '销售订单已创建'
      )
      setOrderModalOpen(false)
      setSelectedOrder(saved || selectedOrder)
      setItems(savedItems)
      try {
        await loadOrders()
        if (saved?.id) {
          await loadItems(saved)
        }
      } catch (refreshError) {
        message.warning(getActionErrorMessage(refreshError, '刷新销售订单列表'))
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存销售订单与订单行'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, order) => {
    setSaving(true)
    try {
      const updated = await action.run({ id: order.id })
      message.success(`销售订单已${action.label}`)
      setSelectedOrder(updated || order)
      await loadOrders()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${action.label}销售订单`))
    } finally {
      setSaving(false)
    }
  }

  const requestLifecycleAction = (action, order) => {
    if (!action || !order) {
      return
    }
    if (!action.confirmTitle) {
      runLifecycleAction(action, order)
      return
    }
    modal.confirm({
      centered: true,
      title: action.confirmTitle,
      content: action.confirmContent,
      okText: action.okText || `确认${action.label}`,
      cancelText: '取消',
      okButtonProps: action.danger ? { danger: true } : undefined,
      onOk: () => runLifecycleAction(action, order),
    })
  }

  const persistColumnOrder = useCallback(
    async ({ moduleKey, columns, nextOrder, setLocalOrder }) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(nextOrder, columns)
      setLocalOrder(sanitizedOrder)
      writeStoredColumnOrder(moduleKey, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleKey,
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

  const orderDataColumns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '订单号',
          exportTitle: '订单号',
          dataIndex: 'order_no',
          width: 160,
          sorter: (a, b) => compareText(a?.order_no, b?.order_no),
        },
        {
          title: '客户',
          exportTitle: '客户',
          dataIndex: 'customer_snapshot',
          width: 180,
          sorter: (a, b) =>
            compareText(a?.customer_snapshot?.name, b?.customer_snapshot?.name),
          render: (value, record) =>
            value?.name || `客户 #${record.customer_id}`,
          exportValue: (record) =>
            record?.customer_snapshot?.name ||
            (record?.customer_id ? `客户 #${record.customer_id}` : ''),
        },
        {
          title: '客户订单号',
          exportTitle: '客户订单号',
          dataIndex: 'customer_order_no',
          width: 150,
          sorter: (a, b) =>
            compareText(a?.customer_order_no, b?.customer_order_no),
          render: (value) => value || '-',
        },
        {
          title: '付款条件',
          exportTitle: '付款条件',
          dataIndex: 'payment_method',
          width: 170,
          sorter: (a, b) =>
            compareText(formatPaymentCondition(a), formatPaymentCondition(b)),
          render: (_, record) => formatPaymentCondition(record),
          exportValue: formatPaymentCondition,
        },
        {
          title: '订单日期',
          exportTitle: '订单日期',
          dataIndex: 'order_date',
          width: 120,
          sorter: (a, b) => compareNumber(a?.order_date, b?.order_date),
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record?.order_date),
        },
        {
          title: '计划交付',
          exportTitle: '计划交付',
          dataIndex: 'planned_delivery_date',
          width: 120,
          sorter: (a, b) =>
            compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
          render: formatUnixDate,
          exportValue: (record) =>
            formatUnixDate(record?.planned_delivery_date),
        },
        {
          title: '生命周期',
          exportTitle: '生命周期',
          dataIndex: 'lifecycle_status',
          width: 120,
          sorter: (a, b) =>
            compareText(a?.lifecycle_status, b?.lifecycle_status),
          render: salesOrderStatusTag,
          exportValue: (record) =>
            statusText(record?.lifecycle_status, SALES_ORDER_STATUS_LABELS),
        },
        {
          title: '创建时间',
          exportTitle: '创建时间',
          dataIndex: 'created_at',
          width: 160,
          sorter: (a, b) => compareNumber(a?.created_at, b?.created_at),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.created_at),
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
    []
  )

  const effectiveOrderColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: SALES_ORDERS_MODULE_KEY,
        columns: orderDataColumns,
        localOrder: orderColumnOrder,
      }),
    [adminProfile, orderColumnOrder, orderDataColumns]
  )

  const visibleOrderDataColumns = useMemo(
    () => applyModuleColumnOrder(orderDataColumns, effectiveOrderColumnOrder),
    [effectiveOrderColumnOrder, orderDataColumns]
  )

  const orderColumns = useMemo(
    () =>
      visibleOrderDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={orderDataColumns}
            order={effectiveOrderColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) =>
              persistColumnOrder({
                moduleKey: SALES_ORDERS_MODULE_KEY,
                columns: orderDataColumns,
                nextOrder,
                setLocalOrder: setOrderColumnOrder,
              })
            }
            onOpenPanel={() => setColumnOrderTarget('orders')}
          />
        ),
      })),
    [
      columnOrderSaving,
      effectiveOrderColumnOrder,
      orderDataColumns,
      persistColumnOrder,
      visibleOrderDataColumns,
    ]
  )

  const itemDataColumns = useMemo(
    () => [
      {
        title: '行号',
        exportTitle: '行号',
        dataIndex: 'line_no',
        width: 80,
        sorter: (a, b) => compareNumber(a?.line_no, b?.line_no),
      },
      {
        title: '产品编号',
        exportTitle: '产品编号',
        dataIndex: 'product_code_snapshot',
        width: 140,
        sorter: (a, b) =>
          compareText(a?.product_code_snapshot, b?.product_code_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '产品名称',
        exportTitle: '产品名称',
        dataIndex: 'product_name_snapshot',
        width: 180,
        sorter: (a, b) =>
          compareText(a?.product_name_snapshot, b?.product_name_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '颜色',
        exportTitle: '颜色',
        dataIndex: 'color_snapshot',
        width: 100,
        sorter: (a, b) => compareText(a?.color_snapshot, b?.color_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '订单数量',
        exportTitle: '订单数量',
        dataIndex: 'ordered_quantity',
        width: 120,
        sorter: (a, b) =>
          compareNumber(a?.ordered_quantity, b?.ordered_quantity),
      },
      {
        title: '单价',
        exportTitle: '单价',
        dataIndex: 'unit_price',
        width: 100,
        sorter: (a, b) => compareNumber(a?.unit_price, b?.unit_price),
        render: (value) => value || '-',
      },
      {
        title: '金额',
        exportTitle: '金额',
        dataIndex: 'amount',
        width: 100,
        sorter: (a, b) => compareNumber(a?.amount, b?.amount),
        render: (value, record) => deriveSalesOrderItemAmount(record) || '-',
        exportValue: (record) => deriveSalesOrderItemAmount(record) || '',
      },
      {
        title: '计划交付',
        exportTitle: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        sorter: (a, b) =>
          compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
      },
      {
        title: '行状态',
        exportTitle: '行状态',
        dataIndex: 'line_status',
        width: 100,
        sorter: (a, b) => compareText(a?.line_status, b?.line_status),
        render: lineStatusTag,
        exportValue: (record) =>
          statusText(record?.line_status, SALES_ORDER_ITEM_STATUS_LABELS),
      },
      {
        title: '创建时间',
        exportTitle: '创建时间',
        dataIndex: 'created_at',
        width: 160,
        sorter: (a, b) => compareNumber(a?.created_at, b?.created_at),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.created_at),
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
    ],
    []
  )

  const effectiveItemColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: SALES_ORDER_ITEMS_MODULE_KEY,
        columns: itemDataColumns,
        localOrder: itemColumnOrder,
      }),
    [adminProfile, itemColumnOrder, itemDataColumns]
  )

  const visibleItemDataColumns = useMemo(
    () => applyModuleColumnOrder(itemDataColumns, effectiveItemColumnOrder),
    [effectiveItemColumnOrder, itemDataColumns]
  )

  const exportOrders = useCallback(() => {
    if (orders.length === 0) return
    downloadCSV({
      filename: `sales-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleOrderDataColumns,
      rows: orders,
    })
  }, [orders, visibleOrderDataColumns])

  const exportItems = useCallback(() => {
    if (!selectedOrder || items.length === 0) return
    const orderNo = String(
      selectedOrder.order_no || selectedOrder.id || 'order'
    )
      .trim()
      .replace(/[^\w.-]+/g, '-')
    downloadCSV({
      filename: `sales-order-items-${orderNo}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      columns: visibleItemDataColumns,
      rows: items,
    })
  }, [items, selectedOrder, visibleItemDataColumns])

  const activeOrderCount = useMemo(
    () =>
      orders.filter((order) => String(order.lifecycle_status) === 'active')
        .length,
    [orders]
  )
  const selectedOrderDisplayText = useMemo(() => {
    if (!selectedOrder) return '请先选择销售订单'
    const customerName =
      selectedOrder.customer_snapshot?.name ||
      `客户 #${selectedOrder.customer_id}`
    return `${selectedOrder.order_no || selectedOrder.id} / ${customerName}`
  }, [selectedOrder])
  const visibleLifecycleActions = useMemo(() => {
    if (!selectedOrder) {
      return []
    }
    return LIFECYCLE_ACTIONS.filter(
      (action) =>
        hasActionPermission(adminProfile, action.permission) &&
        canRunSalesOrderLifecycleAction(
          selectedOrder.lifecycle_status,
          action.nextStatus
        )
    )
  }, [adminProfile, selectedOrder])
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
  const relatedMenuItems = [
    { key: 'shipments', label: '出货单' },
    { key: 'outbound', label: '出库 / 预留' },
  ]
  const openRelatedTable = ({ key }) => {
    if (!selectedOrder) return
    const salesOrderID = selectedOrder.id
    const pathByKey = {
      shipments: routeWithQuery(V1_ROUTE_PATHS.shipments, {
        sales_order_id: salesOrderID,
      }),
      outbound: routeWithQuery(V1_ROUTE_PATHS.outbound, {
        sales_order_id: salesOrderID,
      }),
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }
  return (
    <BusinessPageLayout className="erp-v1-sales-orders-page">
      <PageHeaderCard
        compact
        title="销售订单"
        description="维护客户订单承诺和订单行；出货、库存、应收、发票和收款在对应业务模块处理。"
        stats={[
          { key: 'total', label: '总订单', value: total },
          { key: 'current', label: '当前结果', value: orders.length },
          { key: 'active', label: '已生效', value: activeOrderCount },
          { key: 'selected', label: '已选订单', value: selectedOrder ? 1 : 0 },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              placeholder="搜索订单号、客户订单号、付款方式"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadOrders}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              options={[{ label: '全部客户', value: '' }, ...customerOptions]}
              value={customerFilter}
              placeholder="全部客户"
              showSearch
              optionFilterProp="label"
              onChange={(nextCustomer) => {
                setCustomerFilter(nextCustomer || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(nextField) => {
                setDateFilterField(nextField)
                resetBusinessPaginationCurrent(setPagination)
              }}
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onStartChange={(nextStart) => {
                setDateFilterStart(nextStart)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onEndChange={(nextEnd) => {
                setDateFilterEnd(nextEnd)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--sort"
              options={SORT_FILTER_OPTIONS}
              value={sortFilter}
              onChange={(nextSort) => {
                setSortFilter(nextSort)
                resetBusinessPaginationCurrent(setPagination)
              }}
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
              onClick={() => setColumnOrderTarget('orders')}
            >
              列顺序
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          canCreateOrder ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreateOrder}
            >
              新建订单
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedOrder ? 1 : 0}
          selectedLabel={selectedOrderDisplayText}
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedOrder}
            onClick={() => {
              setSelectedOrder(null)
              setItems([])
            }}
          >
            清空已选
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!selectedOrder || items.length === 0}
            onClick={exportItems}
          >
            导出订单行
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedOrder}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedOrder}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          {canUpdateOrder ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!selectedOrder}
              onClick={() => openEditOrder(selectedOrder)}
            >
              编辑订单
            </Button>
          ) : null}
          {primaryLifecycleAction ? (
            <Button
              size="small"
              type="primary"
              disabled={!selectedOrder || saving}
              loading={saving}
              onClick={() =>
                requestLifecycleAction(primaryLifecycleAction, selectedOrder)
              }
            >
              {primaryLifecycleAction.label}
            </Button>
          ) : null}
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={
              !selectedOrder || saving || secondaryLifecycleActions.length === 0
            }
            menu={{
              items: lifecycleMenuItems,
              onClick: ({ key }) => {
                const action = secondaryLifecycleActions.find(
                  (item) => item.key === key
                )
                requestLifecycleAction(action, selectedOrder)
              },
            }}
          >
            <Button
              size="small"
              disabled={
                !selectedOrder ||
                saving ||
                secondaryLifecycleActions.length === 0
              }
            >
              更多操作 <DownOutlined />
            </Button>
          </Dropdown>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderColumns}
        dataSource={orders}
        scroll={{ x: 1560 }}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无销售订单"
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedOrder?.id ? [selectedOrder.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedOrder(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedOrder?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedOrder(record),
          onDoubleClick: () => {
            if (canUpdateOrder) {
              openEditOrder(record)
            }
          },
        })}
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedOrder?.order_no || ''}
      />

      <ColumnOrderModal
        open={columnOrderTarget === 'orders'}
        moduleTitle="销售订单列表"
        columns={orderDataColumns}
        order={effectiveOrderColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) =>
          persistColumnOrder({
            moduleKey: SALES_ORDERS_MODULE_KEY,
            columns: orderDataColumns,
            nextOrder,
            setLocalOrder: setOrderColumnOrder,
          })
        }
        onClose={() => setColumnOrderTarget(null)}
      />

      <ColumnOrderModal
        open={columnOrderTarget === 'items'}
        moduleTitle="销售订单行列表"
        columns={itemDataColumns}
        order={effectiveItemColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) =>
          persistColumnOrder({
            moduleKey: SALES_ORDER_ITEMS_MODULE_KEY,
            columns: itemDataColumns,
            nextOrder,
            setLocalOrder: setItemColumnOrder,
          })
        }
        onClose={() => setColumnOrderTarget(null)}
      />

      <BusinessFormModal
        title={editingOrder?.id ? '编辑销售订单' : '新建销售订单'}
        description="只维护客户订单承诺，不在此写出货、库存或财务事实。"
        open={orderModalOpen}
        onOk={saveOrder}
        onCancel={() => setOrderModalOpen(false)}
        confirmLoading={saving || itemLoading}
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={orderForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <SalesOrderFormFields
            form={orderForm}
            customers={customers}
            paymentConditionOptions={paymentConditionOptions}
            onCustomerChange={applyCustomerPaymentDefaults}
            onPaymentMethodChange={applyPaymentMethodTermDays}
            onPaymentConditionBlur={requestPaymentConditionPriceReview}
          />
          <SalesOrderItemsFormSection
            form={orderForm}
            canCreateItem={canCreateItem}
            canUpdateItem={canUpdateItem}
            canCancelItem={canCancelItem}
            productSKUs={productSKUs}
          />
        </Form>
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
