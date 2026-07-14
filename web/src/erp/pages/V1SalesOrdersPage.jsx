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
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
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
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import SalesOrderReservationModal from '../components/sales-orders/SalesOrderReservationModal.jsx'
import {
  getSalesOrder,
  listCustomers,
  listContactsByOwner,
  listProductSKUs,
  listAllSalesOrderItems,
  listSalesOrderItemsPreview,
  listSalesOrders,
  listUnits,
  listWarehouses,
  saveSalesOrderWithItems,
} from '../api/masterDataOrderApi.mjs'
import {
  createStockReservationFromSalesOrder,
  listShipments,
  listStockReservations,
} from '../api/operationalFactApi.mjs'
import {
  listInventoryBalances,
  listInventoryLots,
} from '../api/inventoryApi.mjs'
import {
  createBlankOrderLine,
  normalizeSalesOrderItemFormValue,
} from '../components/sales-orders/SalesOrderForm.jsx'
import SalesOrderBusinessModal from '../components/sales-orders/SalesOrderBusinessModal.jsx'
import { buildSalesOrderColumns } from '../components/sales-orders/salesOrderColumns.jsx'
import {
  SALES_ORDER_DATE_FILTER_OPTIONS,
  SALES_ORDER_LIFECYCLE_ACTIONS,
  SALES_ORDER_SORT_FILTER_OPTIONS,
  SALES_ORDER_STATUS_FILTER_OPTIONS,
  SALES_ORDERS_MODULE_KEY,
} from '../components/sales-orders/salesOrderPageConfig.mjs'
import { useSalesOrderPaymentReview } from '../components/sales-orders/useSalesOrderPaymentReview.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  V1_ROUTE_PATHS,
  buildOrderContactSnapshot,
  buildSalesOrderCustomerSourceValues,
  buildSequentialDraftCode,
  canRunSalesOrderLifecycleAction,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  formatUnixDate,
  hasActionPermission,
  SALES_ORDER_ITEM_STATUS_LABELS,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { filterColumnsByEffectiveFieldPolicy } from '../utils/adminProfileSync.mjs'
import {
  downloadCSV,
  getPreferredColumnOrder,
  parseBusinessSortValue,
  writeStoredColumnOrder,
} from '../utils/businessTableActions.mjs'
import { isDraftSourceDocument } from '../utils/sourceDocumentEditing.mjs'
import {
  commitSourceDocumentSaveResult,
  createSourceDocumentOpenEditController,
  isMutationResultUnknown,
  isResourceVersionConflict,
  openSourceDocumentEditWithAccessGate,
  selectOpenSourceDocumentItems,
  settleSourceDocumentPostSaveEffect,
} from '../utils/sourceDocumentMutation.mjs'
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
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
} from '../utils/referenceSelectOptions.mjs'
import {
  buildSalesOrderReservationItemChoices,
  buildSalesOrderReservationPayload,
} from '../utils/salesOrderReservationAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  sourceBusinessActionNo,
} from '../utils/sourceBusinessAction.mjs'

const CUSTOMER_CONTACT_OWNER_TYPE = 'CUSTOMER'

function contactPhoneText(contact = {}) {
  return contact.mobile || contact.phone || ''
}

function buildSalesOrderContactFormValues(source = {}) {
  const snapshot = source.contact_snapshot || source
  return {
    contact_name: snapshot?.name || '',
    contact_phone: contactPhoneText(snapshot),
    contact_mobile: snapshot?.mobile || '',
    contact_email: snapshot?.email || '',
    contact_title: snapshot?.title || '',
  }
}

function salesOwnerOptionFromText(text) {
  const value = String(text || '').trim()
  return value ? { value, label: value } : null
}

function reservationInventoryParams(item = {}) {
  return {
    subject_type: 'PRODUCT',
    subject_id: Number(item.product_id || 0),
    ...(Number(item.product_sku_id || 0) > 0
      ? { product_sku_id: Number(item.product_sku_id) }
      : {}),
    limit: 500,
  }
}

function enrichReservationBalances(balances = [], warehouses = [], lots = []) {
  const warehousesByID = new Map(
    (Array.isArray(warehouses) ? warehouses : []).map((warehouse) => [
      Number(warehouse?.id || 0),
      warehouse,
    ])
  )
  const lotsByID = new Map(
    (Array.isArray(lots) ? lots : []).map((lot) => [Number(lot?.id || 0), lot])
  )
  return (Array.isArray(balances) ? balances : []).map((balance) => {
    const warehouse = warehousesByID.get(Number(balance?.warehouse_id || 0))
    const lot = lotsByID.get(Number(balance?.lot_id || 0))
    return {
      ...balance,
      warehouse_name: warehouse?.name || warehouse?.code || '',
      lot_no: lot?.lot_no || lot?.production_lot_no || '',
    }
  })
}

async function loadReservationStockForItem(item = {}) {
  const params = reservationInventoryParams(item)
  const [balanceData, lotData] = await Promise.all([
    listInventoryBalances(params),
    listInventoryLots({ ...params, status: 'ACTIVE' }),
  ])
  return {
    balances: Array.isArray(balanceData?.inventory_balances)
      ? balanceData.inventory_balances
      : [],
    lots: Array.isArray(lotData?.inventory_lots) ? lotData.inventory_lots : [],
  }
}

export default function V1SalesOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
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
  const [customers, setCustomers] = useState([])
  const [units, setUnits] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [orderColumnOrder, setOrderColumnOrder] = useState(null)
  const [columnOrderTarget, setColumnOrderTarget] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [orderForm] = Form.useForm()
  const [productSKUs, setProductSKUs] = useState([])
  const [customerContacts, setCustomerContacts] = useState([])
  const [reservationOpen, setReservationOpen] = useState(false)
  const [reservationLoading, setReservationLoading] = useState(false)
  const [reservationContext, setReservationContext] = useState({
    order: null,
    items: [],
    reservations: [],
    shipments: [],
    balances: [],
    warehouses: [],
  })
  const routeSalesOrderID = searchParamPositiveIntText(
    searchParams,
    'sales_order_id'
  )
  const orderAttachmentRef = useRef(null)
  const contactLoadSeqRef = useRef(0)
  const reservationContextRequestRef = useRef(0)
  const reservationBalanceRequestRef = useRef(0)
  const reservationInFlightRef = useRef(false)
  const reservationAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const selectedOrderIDRef = useRef(0)
  const beginLatestRequest = useLatestRequestCoordinator()
  const sourceDocumentOpenEditController = useMemo(
    () =>
      createSourceDocumentOpenEditController({
        beginLatestRequest,
        setLoading: setItemLoading,
      }),
    [beginLatestRequest]
  )

  const canCreateOrder = hasActionPermission(adminProfile, 'sales_order.create')
  const canUpdateOrder = hasActionPermission(adminProfile, 'sales_order.update')
  const canReadOrder = hasActionPermission(adminProfile, 'sales_order.read')
  const canReadOrderItems = hasActionPermission(
    adminProfile,
    'sales_order_item.read'
  )
  const canCreateReservation = hasActionPermission(
    adminProfile,
    'stock.reservation.create'
  )

  useEffect(() => {
    selectedOrderIDRef.current = Number(selectedOrder?.id || 0)
  }, [selectedOrder?.id])
  const selectedOrderCanEdit = Boolean(
    canUpdateOrder && isDraftSourceDocument(selectedOrder)
  )
  // 订单头和明细共用一个聚合保存事务；明细编辑不能再投影旧分拆写接口权限。
  const canCreateItem = canCreateOrder || canUpdateOrder
  const canUpdateItem = canUpdateOrder
  const canCancelItem = canUpdateOrder
  const customerOptions = useMemo(
    () => uniqueReferenceOptions(customers, customerOption),
    [customers]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const getSalesOrderItemFields = useCallback(
    (item, { view }) => [
      { label: '产品编号', value: item?.product_code_snapshot },
      { label: '产品名称', value: item?.product_name_snapshot },
      { label: '颜色', value: item?.color_snapshot },
      { label: '订单数量', value: item?.ordered_quantity },
      {
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      { label: '单价', value: item?.unit_price },
      { label: '金额', value: item?.amount },
      {
        label: '计划交付日期',
        value: formatUnixDate(item?.planned_delivery_date),
      },
      {
        label: '行状态',
        value: statusText(
          item?.line_status,
          SALES_ORDER_ITEM_STATUS_LABELS,
          '明细状态待核对'
        ),
      },
      ...(view === 'modal'
        ? [{ label: '备注', value: item?.note, wide: true }]
        : []),
    ],
    [unitOptions]
  )
  const loadSalesOrderItemsPreview = useCallback(async (order, { signal }) => {
    const data = await listSalesOrderItemsPreview(
      {
        sales_order_id: order.id,
        expected_version: order.version,
      },
      { signal }
    )
    return {
      items: data?.sales_order_items,
      total: data?.total,
    }
  }, [])
  const loadAllSalesOrderItemsForPreview = useCallback(
    async (order, { signal }) => {
      const data = await listAllSalesOrderItems(
        {
          sales_order_id: order.id,
          expected_version: order.version,
        },
        { signal }
      )
      return {
        items: data?.sales_order_items,
        total: data?.total,
      }
    },
    []
  )
  const salesOrderItemsPreview = useBusinessRowItemsPreview({
    records: orders,
    rowExpandable: (order) =>
      canReadOrder &&
      canReadOrderItems &&
      Number(order?.id || 0) > 0 &&
      Number(order?.version || 0) > 0,
    loadPreview: loadSalesOrderItemsPreview,
    loadAll: loadAllSalesOrderItemsForPreview,
    getItemFields: getSalesOrderItemFields,
    getItemLabel: (item, { index }) => `明细 ${item?.line_no || index + 1}`,
    getItemSummary: (item) =>
      [item?.product_code_snapshot, item?.product_name_snapshot]
        .filter(Boolean)
        .join(' / '),
    getRecordLabel: (order) => order?.order_no || '当前销售订单',
    modalTitle: '销售订单全部明细',
    emptyDescription: '当前销售订单暂无明细',
  })
  const {
    applyCustomerPaymentDefaults,
    applyPaymentMethodTermDays,
    paymentConditionOptions,
    rememberPaymentCondition,
    requestPaymentConditionPriceReview,
  } = useSalesOrderPaymentReview({
    customers,
    form: orderForm,
    orders,
  })
  const salesOwnerOptions = useMemo(() => {
    const seen = new Set()
    return (Array.isArray(orders) ? orders : [])
      .map((order) => salesOwnerOptionFromText(order?.sales_owner))
      .filter(Boolean)
      .filter((option) => {
        if (seen.has(option.value)) {
          return false
        }
        seen.add(option.value)
        return true
      })
  }, [orders])

  const applyContactToOrderForm = useCallback(
    (contact = {}) => {
      orderForm.setFieldsValue(buildSalesOrderContactFormValues(contact))
    },
    [orderForm]
  )

  const clearContactFields = useCallback(() => {
    orderForm.setFieldsValue(buildSalesOrderContactFormValues({}))
  }, [orderForm])

  const loadCustomerContacts = useCallback(
    async (customerID, { applyDefault = false } = {}) => {
      const normalizedCustomerID = Number(customerID || 0)
      const requestSeq = contactLoadSeqRef.current + 1
      contactLoadSeqRef.current = requestSeq
      if (normalizedCustomerID <= 0) {
        setCustomerContacts([])
        if (applyDefault) {
          clearContactFields()
        }
        return []
      }
      try {
        const result = await listContactsByOwner({
          owner_type: CUSTOMER_CONTACT_OWNER_TYPE,
          owner_id: normalizedCustomerID,
          active_only: true,
          limit: 200,
        })
        const nextContacts = Array.isArray(result?.contacts)
          ? result.contacts
          : []
        if (contactLoadSeqRef.current !== requestSeq) {
          return nextContacts
        }
        setCustomerContacts(nextContacts)
        if (applyDefault) {
          const defaultContact =
            nextContacts.find((contact) => contact?.is_primary) ||
            nextContacts[0]
          if (defaultContact) {
            applyContactToOrderForm(defaultContact)
          } else {
            clearContactFields()
          }
        }
        return nextContacts
      } catch (error) {
        if (contactLoadSeqRef.current === requestSeq) {
          setCustomerContacts([])
          if (applyDefault) {
            clearContactFields()
          }
        }
        message.warning(getActionErrorMessage(error, '加载客户联系人'))
        return []
      }
    },
    [applyContactToOrderForm, clearContactFields]
  )

  const applyCustomerOrderDefaults = useCallback(
    (customerID) => {
      applyCustomerPaymentDefaults(customerID)
      clearContactFields()
      loadCustomerContacts(customerID, { applyDefault: true })
    },
    [applyCustomerPaymentDefaults, clearContactFields, loadCustomerContacts]
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

  const loadOrders = useCallback(async () => {
    const request = beginLatestRequest('orders')
    setLoading(true)
    try {
      const { sortBy, sortDirection } = parseBusinessSortValue(sortFilter)
      const routeSelectedID = Number(routeSalesOrderID || 0)
      const [result, routeOrder] = await Promise.all([
        listSalesOrders(
          {
            keyword,
            customer_id: customerFilter || undefined,
            lifecycle_status: statusFilter,
            date_field: dateFilterField,
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
            sort_by: sortBy,
            sort_direction: sortDirection,
            ...getBusinessPaginationParams(pagination),
          },
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getSalesOrder({ id: routeSelectedID }, { signal: request.signal })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const listedOrders = Array.isArray(result?.sales_orders)
        ? result.sales_orders
        : []
      const nextOrders = routeOrder
        ? [
            routeOrder,
            ...listedOrders.filter((item) => item.id !== routeOrder.id),
          ]
        : listedOrders
      setOrders(nextOrders)
      setTotal(
        Number(result?.total || listedOrders.length || 0) +
          (routeOrder && !listedOrders.some((item) => item.id === routeOrder.id)
            ? 1
            : 0)
      )
      setSelectedOrder((current) => {
        if (routeSelectedID > 0) {
          return routeOrder || null
        }
        if (!current?.id) return null
        return nextOrders.find((item) => item.id === current.id) || null
      })
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, '加载销售订单'))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
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
    return outletContext?.registerPageRefresh?.(loadOrders)
  }, [loadOrders, outletContext])

  const loadReservationBalances = useCallback(
    async (item) => {
      const orderID = Number(reservationContext.order?.id || 0)
      const requestID = reservationBalanceRequestRef.current + 1
      reservationBalanceRequestRef.current = requestID
      if (!item || orderID <= 0) {
        setReservationContext((current) => ({ ...current, balances: [] }))
        return
      }
      setReservationLoading(true)
      try {
        const stock = await loadReservationStockForItem(item)
        if (
          reservationBalanceRequestRef.current !== requestID ||
          Number(reservationContext.order?.id || 0) !== orderID
        ) {
          return
        }
        setReservationContext((current) =>
          Number(current.order?.id || 0) === orderID
            ? {
                ...current,
                balances: enrichReservationBalances(
                  stock.balances,
                  current.warehouses,
                  stock.lots
                ),
              }
            : current
        )
      } catch (error) {
        if (reservationBalanceRequestRef.current === requestID) {
          setReservationContext((current) => ({ ...current, balances: [] }))
          message.error(getActionErrorMessage(error, '加载可用库存'))
        }
      } finally {
        if (reservationBalanceRequestRef.current === requestID) {
          setReservationLoading(false)
        }
      }
    },
    [reservationContext.order?.id]
  )

  const openSalesOrderReservation = async () => {
    const orderID = Number(selectedOrder?.id || 0)
    if (
      orderID <= 0 ||
      String(selectedOrder?.lifecycle_status || '').toLowerCase() !== 'active'
    ) {
      message.warning('请先选择已生效的销售订单')
      return
    }
    selectedOrderIDRef.current = orderID
    const requestID = reservationContextRequestRef.current + 1
    reservationContextRequestRef.current = requestID
    setReservationLoading(true)
    try {
      const freshOrder = await getSalesOrder({ id: orderID })
      if (
        reservationContextRequestRef.current !== requestID ||
        selectedOrderIDRef.current !== orderID
      ) {
        return
      }
      if (
        String(freshOrder?.lifecycle_status || '').toLowerCase() !== 'active'
      ) {
        message.warning('销售订单状态已变化，请刷新后重试')
        await loadOrders()
        return
      }
      const itemData = await listAllSalesOrderItems({
        sales_order_id: orderID,
        expected_version: freshOrder.version,
      })
      const items = Array.isArray(itemData?.sales_order_items)
        ? itemData.sales_order_items
        : []
      const [reservationData, shipmentData, warehouseData] = await Promise.all([
        listStockReservations({
          source_id: orderID,
          status: 'ACTIVE',
          limit: 200,
        }),
        listShipments({ source_id: orderID, status: 'SHIPPED', limit: 200 }),
        listWarehouses({ active_only: true, limit: 500 }),
      ])
      if (
        reservationContextRequestRef.current !== requestID ||
        selectedOrderIDRef.current !== orderID
      ) {
        return
      }
      const warehouses = Array.isArray(warehouseData?.warehouses)
        ? warehouseData.warehouses
        : []
      const reservations = Array.isArray(reservationData?.stock_reservations)
        ? reservationData.stock_reservations
        : []
      const shipments = Array.isArray(shipmentData?.shipments)
        ? shipmentData.shipments
        : []
      if (
        Number(reservationData?.total || reservations.length) >
          reservations.length ||
        Number(shipmentData?.total || shipments.length) > shipments.length
      ) {
        message.warning('相关预留或出货记录未完整加载，暂不能新增预留')
        return
      }
      const firstReservableItem = buildSalesOrderReservationItemChoices(
        items,
        reservations,
        shipments
      ).find((choice) => !choice.disabled)?.item
      if (!firstReservableItem) {
        message.warning('当前销售订单已没有可预留数量')
        return
      }
      const stock = await loadReservationStockForItem(firstReservableItem)
      if (
        reservationContextRequestRef.current !== requestID ||
        selectedOrderIDRef.current !== orderID
      ) {
        return
      }
      setReservationContext({
        order: freshOrder,
        items,
        reservations,
        shipments,
        balances: enrichReservationBalances(
          stock.balances,
          warehouses,
          stock.lots
        ),
        warehouses,
      })
      setReservationOpen(true)
    } catch (error) {
      if (reservationContextRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载库存预留上下文'))
      }
    } finally {
      if (reservationContextRequestRef.current === requestID) {
        setReservationLoading(false)
      }
    }
  }

  const submitSalesOrderReservation = async (values) => {
    if (reservationInFlightRef.current || !reservationContext.order) return
    let payload
    try {
      payload = {
        ...buildSalesOrderReservationPayload(
          values,
          reservationContext.order,
          reservationContext.items,
          reservationContext.balances,
          reservationContext.reservations,
          reservationContext.shipments
        ),
        customer_key: activeCustomerKey || undefined,
      }
    } catch (error) {
      message.error(error.message)
      return
    }
    const scope = `sales-order-reservation:${reservationContext.order.id}:${payload.sales_order_item_id}`
    const attempt = reservationAttemptsRef.current.prepare(scope, payload)
    const params = {
      ...attempt.params,
      reservation_no: sourceBusinessActionNo(
        'RSV',
        reservationContext.order.order_no,
        attempt.params.idempotency_key
      ),
    }
    reservationInFlightRef.current = true
    setReservationLoading(true)
    try {
      const result = await createStockReservationFromSalesOrder(params)
      if (!result || result.status !== 'ACTIVE') {
        const error = new Error('库存预留返回结果无法确认')
        error.isInvalidResponse = true
        throw error
      }
      reservationAttemptsRef.current.settle(scope, attempt, null)
      setReservationContext((current) => ({
        ...current,
        reservations: [...current.reservations, result],
      }))
      setReservationOpen(false)
      message.success('库存预留已创建，可在“相关单据 → 出库 / 预留”查看')
    } catch (error) {
      const retained = reservationAttemptsRef.current.settle(
        scope,
        attempt,
        error
      )
      if (retained) {
        message.warning(
          '库存预留结果暂时无法确认，已保留本次请求，请使用相同内容重试'
        )
      } else {
        message.error(getActionErrorMessage(error, '创建库存预留'))
      }
    } finally {
      reservationInFlightRef.current = false
      setReservationLoading(false)
    }
  }

  const openCreateOrder = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingOrder(null)
    setCustomerContacts([])
    orderForm.resetFields()
    const defaultUnitID =
      unitOptions.length === 1 ? unitOptions[0].value : undefined
    orderForm.setFieldsValue({
      order_no: buildSequentialDraftCode(orders, {
        prefix: 'SO',
        field: 'order_no',
      }),
      order_date: new Date().toISOString().slice(0, 10),
      items: [createBlankOrderLine(1, { unitID: defaultUnitID })],
    })
    rememberPaymentCondition({})
    setOrderModalOpen(true)
  }

  const openEditOrder = async (order) => {
    const editResult = await openSourceDocumentEditWithAccessGate({
      canUpdate: canUpdateOrder,
      document: order,
      invalidatePending: () => sourceDocumentOpenEditController.invalidate(),
      isEditable: isDraftSourceDocument,
      open: () =>
        sourceDocumentOpenEditController.open({
          loadItems: async ({ signal }) => {
            const result = await listAllSalesOrderItems(
              {
                sales_order_id: order.id,
                expected_version: order.version,
              },
              { signal }
            )
            return result?.sales_order_items
          },
          enterEditing: (nextItems) => {
            const openItems = selectOpenSourceDocumentItems(nextItems)
            orderAttachmentRef.current?.clearPendingAttachments()
            setSelectedOrder(order)
            setEditingOrder(order)
            orderForm.setFieldsValue({
              ...order,
              order_date: unixToDateInputValue(order.order_date),
              planned_delivery_date: unixToDateInputValue(
                order.planned_delivery_date
              ),
              ...buildSalesOrderContactFormValues(order),
              items: openItems.map(normalizeSalesOrderItemFormValue),
            })
            rememberPaymentCondition(order)
            loadCustomerContacts(order.customer_id)
            setOrderModalOpen(true)
          },
        }),
    })
    if (editResult.status === 'blocked') {
      if (editResult.reason === 'forbidden') {
        message.warning('当前账号没有编辑销售订单的权限。')
      } else if (editResult.reason === 'not_editable') {
        message.warning('订单提交后已冻结；如需调整，请取消后重新建立订单。')
      }
      return
    }
    if (editResult.status === 'load_failed') {
      message.error(
        `${getActionErrorMessage(
          editResult.error,
          '加载销售订单明细失败'
        )}，未进入编辑`
      )
    }
  }

  const saveOrder = async () => {
    const values = await orderForm.validateFields()
    const customer = customers.find((item) => item.id === values.customer_id)
    let params
    try {
      params = buildSalesOrderParams(
        {
          ...values,
          ...buildSalesOrderCustomerSourceValues(customer),
          contact_snapshot: buildOrderContactSnapshot(values),
        },
        editingOrder?.id
          ? {
              id: editingOrder.id,
              expected_version: editingOrder.version,
            }
          : {}
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备销售订单保存'))
      return
    }
    setSaving(true)
    try {
      const saveResult = await commitSourceDocumentSaveResult({
        save: async () => {
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
          return result.sales_order
        },
        bindSaved: (savedOrder) => {
          setEditingOrder(savedOrder)
          setSelectedOrder(savedOrder)
        },
      })
      if (saveResult.status === 'save_failed') {
        const saveError = saveResult.error
        if (isResourceVersionConflict(saveError)) {
          message.warning(
            '该单据已被其他人更新，本次内容没有覆盖最新数据。请核对最新单据后再保存。'
          )
        } else if (isMutationResultUnknown(saveError)) {
          message.warning(
            '保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。'
          )
        } else {
          message.error(
            getActionErrorMessage(saveError, '保存销售订单与订单行')
          )
        }
        return
      }

      const { saved } = saveResult
      const attachmentEffect = await settleSourceDocumentPostSaveEffect(() =>
        orderAttachmentRef.current?.flushPendingAttachments(saved.id)
      )
      const attachmentSaved =
        attachmentEffect.status === 'fulfilled' &&
        attachmentEffect.value !== false
      if (attachmentEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(attachmentEffect.error, '上传销售订单附件')
        )
      }
      message.success(
        attachmentSaved
          ? editingOrder?.id
            ? '销售订单与订单行已更新'
            : '销售订单已创建'
          : '销售订单已保存，未上传的附件请重新选择'
      )
      orderAttachmentRef.current?.clearPendingAttachments()
      setOrderModalOpen(false)
      const refreshEffect = await settleSourceDocumentPostSaveEffect(loadOrders)
      if (refreshEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(refreshEffect.error, '刷新销售订单列表')
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, order) => {
    setSaving(true)
    try {
      const updated = await action.run({
        id: order.id,
        sales_order_id: order.id,
        order_no: order.order_no,
        business_ref_no: order.order_no,
        customer_key: activeCustomerKey || undefined,
      })
      message.success(action.successMessage || `销售订单已${action.label}`)
      const nextSelectedOrder =
        action.returnsRecord === false ? order : updated || order
      setSelectedOrder(nextSelectedOrder)
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
      filterColumnsByEffectiveFieldPolicy(
        buildSalesOrderColumns(),
        adminProfile,
        'sales_orders.default'
      ),
    [adminProfile]
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
    return SALES_ORDER_LIFECYCLE_ACTIONS.filter(
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
        description="维护客户订单承诺和订单行；生效订单可在此预留库存，出货、应收、发票和收款仍在对应业务模块处理。"
        stats={[
          { key: 'total', label: '总订单', value: total },
          { key: 'current', label: '当前结果', value: orders.length },
          { key: 'active', label: '已生效', value: activeOrderCount },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              placeholder="搜索订单"
              searchHint="可搜索：订单号、客户订单号、业务员、付款方式"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadOrders}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              options={SALES_ORDER_STATUS_FILTER_OPTIONS}
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
              options={SALES_ORDER_DATE_FILTER_OPTIONS}
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
              options={SALES_ORDER_SORT_FILTER_OPTIONS}
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
              导出筛选结果
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
            }}
          >
            清空已选
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
              相关单据 <DownOutlined />
            </Button>
          </Dropdown>
          {canUpdateOrder ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              loading={itemLoading}
              disabled={!selectedOrderCanEdit || itemLoading}
              onClick={() => openEditOrder(selectedOrder)}
            >
              编辑订单
            </Button>
          ) : null}
          {canCreateReservation ? (
            <Button
              size="small"
              disabled={
                !selectedOrder ||
                String(selectedOrder.lifecycle_status || '').toLowerCase() !==
                  'active' ||
                reservationLoading ||
                saving
              }
              loading={reservationLoading}
              onClick={openSalesOrderReservation}
            >
              预留库存
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
        expandable={salesOrderItemsPreview.expandable}
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
          onDoubleClick: () => openEditOrder(record),
        })}
      />

      {salesOrderItemsPreview.modal}

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

      <SalesOrderBusinessModal
        open={orderModalOpen}
        form={orderForm}
        editingOrder={editingOrder}
        saving={saving}
        itemLoading={itemLoading}
        orderAttachmentRef={orderAttachmentRef}
        customers={customers}
        customerContacts={customerContacts}
        salesOwnerOptions={salesOwnerOptions}
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
          sourceDocumentOpenEditController.invalidate()
          orderAttachmentRef.current?.clearPendingAttachments()
          setOrderModalOpen(false)
        }}
        onCustomerChange={applyCustomerOrderDefaults}
        onContactSelect={applyContactToOrderForm}
        onPaymentMethodChange={applyPaymentMethodTermDays}
        onPaymentConditionBlur={requestPaymentConditionPriceReview}
      />

      <SalesOrderReservationModal
        open={reservationOpen}
        order={reservationContext.order}
        items={reservationContext.items}
        reservations={reservationContext.reservations}
        shipments={reservationContext.shipments}
        balances={reservationContext.balances}
        loading={reservationLoading}
        onItemChange={loadReservationBalances}
        onCancel={() => {
          if (reservationInFlightRef.current) return
          reservationBalanceRequestRef.current += 1
          setReservationOpen(false)
        }}
        onSubmit={submitSalesOrderReservation}
      />
    </BusinessPageLayout>
  )
}
