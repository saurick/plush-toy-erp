import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Space } from 'antd'
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
} from '../components/business-list/ColumnOrderModal.jsx'
import {
  activateSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
  listCustomers,
  listProductSKUs,
  listSalesOrderItems,
  listSalesOrders,
  listUnits,
  saveSalesOrderWithItems,
  submitSalesOrder,
} from '../api/masterDataOrderApi.mjs'
import {
  createBlankOrderLine,
  normalizeSalesOrderItemFormValue,
} from '../components/sales-orders/SalesOrderForm.jsx'
import SalesOrderBusinessModal from '../components/sales-orders/SalesOrderBusinessModal.jsx'
import {
  buildSalesOrderColumns,
  buildSalesOrderItemColumns,
} from '../components/sales-orders/salesOrderColumns.jsx'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  V1_ROUTE_PATHS,
  buildCustomerSnapshot,
  buildPaymentConditionOptions,
  buildSequentialDraftCode,
  canRunSalesOrderLifecycleAction,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  hasActionPermission,
  mergePaymentConditionOptions,
  normalizeOptionalNonNegativeInteger,
  resolvePaymentTermDays,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  downloadCSV,
  getPreferredColumnOrder,
  parseBusinessSortValue,
  writeStoredColumnOrder,
} from '../utils/businessTableActions.mjs'
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
  unitOption,
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
const OPEN_LINE_STATUS = 'open'

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
  const [units, setUnits] = useState([])
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
  const orderAttachmentRef = useRef(null)

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
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
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
      const [customerResult, skuResult, unitResult] = await Promise.all([
        listCustomers({ active_only: true, limit: 200 }),
        listProductSKUs({ active_only: true, limit: 200 }),
        listUnits({ active_only: true, limit: 500 }),
      ])
      setCustomers(
        Array.isArray(customerResult?.customers) ? customerResult.customers : []
      )
      setProductSKUs(
        Array.isArray(skuResult?.product_skus) ? skuResult.product_skus : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载客户、SKU 和单位选项'))
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
      const { sortBy, sortDirection } = parseBusinessSortValue(sortFilter)
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
    orderAttachmentRef.current?.clearPendingAttachments()
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
    orderAttachmentRef.current?.clearPendingAttachments()
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
        items: (Array.isArray(values.items) ? values.items : []).map(
          (item, index) =>
            buildSalesOrderItemParams(item, {
              ...(item?.id ? { id: item.id } : {}),
              line_no: index + 1,
            })
        ),
      })
      const saved = result?.sales_order || null
      const savedItems = Array.isArray(result?.sales_order_items)
        ? result.sales_order_items
        : []
      const attachmentSaved =
        (await orderAttachmentRef.current?.flushPendingAttachments(
          saved?.id
        )) !== false
      message.success(
        attachmentSaved
          ? editingOrder?.id
            ? '销售订单与订单行已更新'
            : '销售订单已创建'
          : '销售订单已保存，未上传的附件请重新选择'
      )
      orderAttachmentRef.current?.clearPendingAttachments()
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

  const orderDataColumns = useMemo(() => buildSalesOrderColumns(), [])

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

  const itemDataColumns = useMemo(() => buildSalesOrderItemColumns(), [])

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

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      customerFilter ||
      dateFilterStart ||
      dateFilterEnd
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setCustomerFilter('')
    setDateFilterField('order_date')
    setDateFilterStart('')
    setDateFilterEnd('')
    resetBusinessPaginationCurrent(setPagination)
  }, [])

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
      (selectedOrder.customer_id ? '客户已关联' : '未指定客户')
    return `${selectedOrder.order_no || '已登记销售订单'} / ${customerName}`
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
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
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

      <SalesOrderBusinessModal
        open={orderModalOpen}
        form={orderForm}
        editingOrder={editingOrder}
        saving={saving}
        itemLoading={itemLoading}
        orderAttachmentRef={orderAttachmentRef}
        customers={customers}
        paymentConditionOptions={paymentConditionOptions}
        unitOptions={unitOptions}
        productSKUs={productSKUs}
        canCreateOrder={canCreateOrder}
        canUpdateOrder={canUpdateOrder}
        canCreateItem={canCreateItem}
        canUpdateItem={canUpdateItem}
        canCancelItem={canCancelItem}
        onOk={saveOrder}
        onCancel={() => {
          orderAttachmentRef.current?.clearPendingAttachments()
          setOrderModalOpen(false)
        }}
        onCustomerChange={applyCustomerPaymentDefaults}
        onPaymentMethodChange={applyPaymentMethodTermDays}
        onPaymentConditionBlur={requestPaymentConditionPriceReview}
      />
    </BusinessPageLayout>
  )
}
