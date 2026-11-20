import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  BarChartOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Space } from 'antd'
import { getBusinessDocumentTitle } from '../config/businessModules.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import {
  useReferenceRecords,
  useReferenceHydration,
} from '../hooks/useReferenceRecords.js'
import RemoteReferenceSelect, {
  ReferenceRecordsProvider,
} from '../components/RemoteReferenceSelect.jsx'
import { canReadReference } from '../utils/remoteReferences.mjs'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import {
  effectiveSessionAllowsPage,
  filterColumnsByEffectiveFieldPolicy,
} from '../utils/adminProfileSync.mjs'
import { useProcessSubmissionReceipt } from '../components/workflow/ProcessSubmissionReceipt.jsx'
import useWorkflowTaskBusinessResult from '../hooks/useWorkflowTaskBusinessResult.js'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import BusinessTaskActions from '../components/workflow/BusinessTaskActions.jsx'
import { orderSubmissionSuccessMessage } from '../utils/approvalCondition.mjs'
import { resolveBusinessStatusCounts } from '../utils/businessStatusCounts.mjs'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import useBusinessPageState from '../hooks/useBusinessPageState.js'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import { message, useModal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  BusinessActionTooltip,
  BusinessLifecycleSecondaryAction,
  BusinessLifecyclePrimaryAction,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessDateInputs.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import { salesOrderLineGroupKey } from '../utils/sourceDocumentLineGroupKeys.mjs'
import SourceOrderLifecycleConfirmContent from '../components/business-list/SourceOrderLifecycleConfirmContent.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import SalesOrderReservationModal from '../components/sales-orders/SalesOrderReservationModal.jsx'
import SalesDeliveryWorkspace from '../components/sales-orders/SalesDeliveryWorkspace.jsx'
import { useSalesDeliveryWorkspace } from '../components/sales-orders/useSalesDeliveryWorkspace.js'
import { progressBoardAccess } from '../utils/progressBoardAccess.mjs'
import { useSalesOrderEditor } from '../components/sales-orders/useSalesOrderEditor.mjs'
import { useSalesOrderReservation } from '../components/sales-orders/useSalesOrderReservation.mjs'
import {
  getSalesOrder,
  listAllContactsByOwner,
  listAllCustomers,
  listAllSalesOrderItems,
  exportSalesOrders,
  listSalesOrders,
  listAllUnits,
} from '../api/masterDataOrderApi.mjs'
import { ProductThumbnail } from '../components/master-data/ProductIdentity.jsx'
import { documentProductGalleryColumn } from '../components/business-list/BusinessDocumentProductGallery.jsx'
import { DOCUMENT_PRODUCT_SOURCES } from '../utils/businessProductGallery.mjs'
import SalesOrderEngineeringModal from '../components/sales-orders/SalesOrderEngineeringModal.jsx'
import EngineeringMaterialRequestModal from '../components/sales-orders/EngineeringMaterialRequestModal.jsx'
import { getEngineeringMaterialPermissions } from '../utils/engineeringMaterialTask.mjs'
import {
  salesOrderRequirementName,
  salesOrderEngineeringLabel,
} from '../utils/salesOrderRequirements.mjs'
import SalesOrderEditor from '../components/sales-orders/SalesOrderEditor.jsx'
import SalesOrderExcelImport from '../components/sales-orders/SalesOrderExcelImport.jsx'
import {
  buildSalesOrderColumns,
  buildSalesOrderListColumns,
  buildSalesOrderExportColumns,
  buildSalesOrderColumnProfile,
} from '../components/sales-orders/salesOrderColumns.jsx'
import {
  SALES_ORDER_DATE_FILTER_OPTIONS,
  SALES_ORDER_LIFECYCLE_ACTIONS,
  SALES_ORDER_SORT_FILTER_OPTIONS,
  SALES_ORDER_STATUS_FILTER_OPTIONS,
  SALES_ORDERS_MODULE_KEY,
} from '../components/sales-orders/salesOrderPageConfig.mjs'
import { useSalesOrderPaymentReview } from '../components/sales-orders/useSalesOrderPaymentReview.mjs'
import {
  BUSINESS_ROUTE_PATHS,
  canRunSalesOrderLifecycleAction,
  formatUnixDate,
  hasActionPermission,
  SALES_ORDER_ITEM_STATUS_LABELS,
  SOURCE_DOCUMENT_ITEM_STATUS_TONES,
  statusText,
} from '../utils/masterDataOrderView.mjs'
import {
  buildSalesOrderContactFormValues,
  buildSalesOrderCustomerSourceValues,
} from '../utils/sourcePartySnapshots.mjs'
import { parseBusinessSortValue } from '../utils/businessTableActions.mjs'
import { isDraftSourceDocument } from '../utils/sourceDocumentEditing.mjs'
import {
  DEFAULT_BUSINESS_PAGE_SIZE,
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
  resolveExactRecordPage,
} from '../utils/businessPagination.mjs'
import { searchParamPositiveInt } from '../utils/routeQuery.mjs'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  normalizeLifecycleStatus,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  customerOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
} from '../utils/referenceSelectOptions.mjs'
import { resolveBusinessLifecycleActions } from '../utils/businessActionAvailability.mjs'
import { resolveRelatedRecordActionAvailability } from '../utils/operationalActionAvailability.mjs'
import {
  requireSourceActionRecord,
  createSourceBusinessActionAttemptStore,
} from '../utils/sourceBusinessAction.mjs'
import {
  normalizeSourceOrderLifecycleReason,
  prepareSourceOrderLifecycleAttempt,
} from '../utils/sourceOrderLifecycleAction.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'

const CUSTOMER_CONTACT_OWNER_TYPE = 'CUSTOMER'

function salesOwnerOptionFromText(text) {
  const value = String(text || '').trim()
  return value ? { value, label: value } : null
}

export default function SalesOrdersPage() {
  const modal = useModal()
  const outletContext = useBusinessPageContext()
  const showProcessSubmissionReceipt = useProcessSubmissionReceipt()
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const navigate = useBusinessNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useBusinessSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useBusinessPageState('keyword', '')
  const [lifecycleScope, setLifecycleScope] = useState(() =>
    lifecycleScopeFromSearchParams(searchParams)
  )
  const [savedStatusFilter, setStatusFilter] = useBusinessPageState(
    'statusFilter',
    ''
  )
  const statusFilter = normalizeLifecycleStatus(
    lifecycleScope,
    savedStatusFilter,
    ['closed', 'canceled']
  )
  useEffect(() => {
    if (savedStatusFilter !== statusFilter) setStatusFilter(statusFilter)
  }, [savedStatusFilter, setStatusFilter, statusFilter])
  const [customerFilter, setCustomerFilter] = useBusinessPageState(
    'customerFilter',
    ''
  )
  const [dateFilterField, setDateFilterField] = useBusinessPageState(
    'dateFilterField',
    'order_date'
  )
  const [dateFilterStart, setDateFilterStart] = useBusinessPageState(
    'dateFilterStart',
    ''
  )
  const [dateFilterEnd, setDateFilterEnd] = useBusinessPageState(
    'dateFilterEnd',
    ''
  )
  const [sortFilter, setSortFilter] = useBusinessPageState(
    'sortFilter',
    'updated_at:desc'
  )
  const [orders, setOrders] = useState([])
  const [referenceRefreshKey, setReferenceRefreshKey] = useState(0)
  const [customers, , mergeCustomers] = useReferenceRecords(adminProfile)
  const [units, setUnits] = useState([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState(null)
  const [pagination, setPagination] = useBusinessPageState('pagination', {
    current: 1,
    pageSize: DEFAULT_BUSINESS_PAGE_SIZE,
  })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [savedProgressReturn, setSavedProgressReturn] = useBusinessPageState(
    'progressReturn',
    null
  )
  const initialProgressReturn = useRef(
    location.state?.restoredSalesDeliverySelection || savedProgressReturn
  )
  const restoreProgressSelection = useRef(
    initialProgressReturn.current?.orderID || 0
  )
  const progressTriggerRef = useRef(null)
  const searchInputRef = useRef(null)
  const [engineeringOrderID, setEngineeringOrderID] = useState(null)
  const [materialRequestOrderID, setMaterialRequestOrderID] = useState(null)
  const canReviewMaterialRequest =
    hasActionPermission(
      adminProfile,
      PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE
    ) ||
    hasActionPermission(
      adminProfile,
      PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE
    )
  const [detailOrder, setDetailOrder] = useState(null)
  const [orderForm] = Form.useForm()
  const [productSKUs, , mergeProductSKUs] = useReferenceRecords(adminProfile)
  const [customerContacts, setCustomerContacts] = useState([])
  const routeSalesOrderID = searchParamPositiveInt(
    searchParams,
    'sales_order_id'
  )
  const routeMaterialRequestID = searchParamPositiveInt(
    searchParams,
    'material_request_id'
  )
  const engineeringEntry =
    outletContext?.taskBusiness?.task?.task_group === 'engineering_data'
  useEffect(() => {
    if (engineeringEntry && routeSalesOrderID) {
      setEngineeringOrderID(routeSalesOrderID)
    }
  }, [engineeringEntry, routeSalesOrderID])
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const resolvedRouteKeyword =
    routeSalesOrderID &&
    Number(selectedOrder?.id || 0) === Number(routeSalesOrderID)
      ? String(selectedOrder?.order_no || '').trim()
      : ''
  const allowedMenuPaths = useMemo(
    () => outletContext?.allowedMenuPaths || [],
    [outletContext?.allowedMenuPaths]
  )
  const canOpenRelatedPath = useCallback(
    (path) =>
      canOpenRelatedDocumentPath({
        path,
        adminProfile,
        allowedMenuPaths,
      }),
    [adminProfile, allowedMenuPaths]
  )
  const contactLoadSeqRef = useRef(0)
  const lifecycleInFlightRef = useRef(false)
  const lifecycleAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const beginLatestRequest = useLatestRequestCoordinator()

  const canCreateOrder = hasActionPermission(
    adminProfile,
    PermissionCode.SALES_ORDER_CREATE
  )
  const canUpdateOrder = hasActionPermission(
    adminProfile,
    PermissionCode.SALES_ORDER_UPDATE
  )
  const canReadOrderItems = hasActionPermission(
    adminProfile,
    PermissionCode.SALES_ORDER_ITEM_READ
  )
  const deliveryWorkspace = useSalesDeliveryWorkspace(
    adminProfile,
    location.pathname === BUSINESS_ROUTE_PATHS.salesOrders && !outletContext?.taskBusiness
  )
  const canOpenBoardFromOrder =
    location.pathname === BUSINESS_ROUTE_PATHS.salesOrders &&
    canReadOrderItems &&
    hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_READ) &&
    progressBoardAccess(adminProfile).sales &&
    (adminProfile.is_super_admin ||
      allowedMenuPaths.includes(BUSINESS_ROUTE_PATHS.businessDashboard)) &&
    effectiveSessionAllowsPage(adminProfile, 'business-dashboard', {
      isLocalDev: false,
      isSuperAdmin: adminProfile.is_super_admin === true,
    })
  const goToOrderProgress = (orderID) => {
    if (!canOpenBoardFromOrder || !orderID || saving) return
    const selection = {
      orderID,
      draft: searchInputRef.current?.input?.value,
    }
    setSavedProgressReturn(selection)
    const params = new URLSearchParams({
      view: 'orders',
      display: 'lines',
      scope: 'all',
      sales_order_id: String(orderID),
    })
    navigate(`${BUSINESS_ROUTE_PATHS.businessDashboard}?${params}`, {
      state: {
        salesDeliveryReturn: {
          adminID: adminProfile.id,
          pathname: location.pathname,
          search: location.search,
          selection,
        },
      },
    })
  }
  const canCreateReservation = hasActionPermission(
    adminProfile,
    PermissionCode.STOCK_RESERVATION_CREATE
  )

  const selectedOrderCanEdit = Boolean(
    canUpdateOrder && isDraftSourceDocument(selectedOrder)
  )
  const selectedOrderLifecycleStatus = String(
    selectedOrder?.lifecycle_status || ''
  ).toLowerCase()
  // 订单头和明细共用一个聚合保存事务；明细编辑不能再投影旧分拆写接口权限。
  const canCreateItem = canCreateOrder || canUpdateOrder
  const canUpdateItem = canUpdateOrder
  const canCancelItem = canUpdateOrder
  const customerOptions = useMemo(
    () => uniqueReferenceOptions(customers, customerOption),
    [customers]
  )
  const lifecycleStatusOptions = useMemo(
    () =>
      filterLifecycleStatusOptions(
        SALES_ORDER_STATUS_FILTER_OPTIONS,
        lifecycleScope,
        ['closed', 'canceled']
      ),
    [lifecycleScope]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const getSalesOrderItemFields = useCallback(
    (item) => [
      {
        label: '产品图',
        media: true,
        value: (
          <ProductThumbnail
            productId={item?.product_id}
            name={salesOrderRequirementName(item)}
            code={item?.product_code_snapshot}
          />
        ),
      },
      {
        label: '需求名称',
        value: salesOrderRequirementName(item),
        strong: true,
        wide: true,
      },
      { label: '客户款号', value: item?.customer_product_no },
      {
        label: '类别',
        value: item?.order_category === 'REPEAT' ? '返单' : '新单',
      },
      {
        label: '行状态',
        tone: SOURCE_DOCUMENT_ITEM_STATUS_TONES[item?.line_status],
        value: statusText(
          item?.line_status,
          SALES_ORDER_ITEM_STATUS_LABELS,
          '明细状态待核对'
        ),
      },
      { label: '产品编号', value: item?.product_code_snapshot },
      {
        label: '产品名称',
        value: item?.product_name_snapshot,
        strong: true,
        wide: true,
      },
      { label: '颜色', value: item?.color_snapshot },
      {
        label: '计划交付日期',
        value: formatUnixDate(item?.planned_delivery_date),
      },
      { label: '订单数量', value: item?.ordered_quantity, rowStart: true },
      { label: '船头版数量', value: item?.pre_shipment_sample_quantity },
      { label: '生产数量', value: item?.production_quantity },
      { label: '已出货数', value: item?.shipped_quantity },
      { label: '未出货数', value: item?.unshipped_quantity },
      {
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      { label: '单价', value: item?.unit_price, rowStart: true },
      { label: '金额', value: item?.amount },
      {
        label: '工程资料',
        value: salesOrderEngineeringLabel(item),
        wide: true,
      },
      { label: '设计师', value: item?.designer, wide: true },
      { label: '工艺要求', value: item?.process_requirement, fullWidth: true },
      { label: '备注', value: item?.note, fullWidth: true },
    ],
    [unitOptions]
  )
  const loadSalesOrderDetailsItems = useCallback(async (order, { signal }) => {
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
  }, [])
  const {
    applyCustomerPaymentDefaults,
    rememberPaymentCondition,
    requestPaymentConditionPriceReview,
  } = useSalesOrderPaymentReview({
    customers,
    form: orderForm,
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
      setCustomerContacts([])
      if (normalizedCustomerID <= 0) {
        if (applyDefault) {
          clearContactFields()
        }
        return []
      }
      try {
        const result = await listAllContactsByOwner({
          owner_type: CUSTOMER_CONTACT_OWNER_TYPE,
          owner_id: normalizedCustomerID,
          active_only: true,
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
      const customer = customers.find(
        (item) => String(item?.id || '') === String(customerID || '')
      )
      orderForm.setFieldsValue(buildSalesOrderCustomerSourceValues(customer))
      applyCustomerPaymentDefaults(customerID)
      clearContactFields()
      loadCustomerContacts(customerID, { applyDefault: true })
    },
    [
      applyCustomerPaymentDefaults,
      clearContactFields,
      customers,
      loadCustomerContacts,
      orderForm,
    ]
  )

  const loadImportReferenceData = useCallback(
    async (options) => {
      const data = await listAllCustomers({ active_only: true }, options)
      mergeCustomers(data.customers)
    },
    [mergeCustomers]
  )

  const loadCustomers = useCallback(async () => {
    setReferencesLoading(true)
    try {
      const unitResult = await listAllUnits({ active_only: true })
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      showPageLoadError(error, '加载客户、SKU 和单位选项')
    } finally {
      setReferencesLoading(false)
    }
  }, [])

  const orderListParams = useMemo(() => {
    const { sortBy, sortDirection } = parseBusinessSortValue(sortFilter)
    return {
      keyword: linkedDocumentRequestKeyword({
        localKeyword: keyword,
        linkedKeyword,
        hasExactContext: Boolean(routeSalesOrderID),
      }),
      customer_id: customerFilter || undefined,
      lifecycle_status: statusFilter,
      lifecycle_scope: lifecycleScope,
      date_field: dateFilterField,
      date_from: dateFilterStart || undefined,
      date_to: dateFilterEnd || undefined,
      sort_by: sortBy,
      sort_direction: sortDirection,
    }
  }, [
    customerFilter,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    linkedKeyword,
    lifecycleScope,
    routeSalesOrderID,
    sortFilter,
    statusFilter,
  ])

  const loadOrders = useCallback(async () => {
    const request = beginLatestRequest('orders')
    setLoading(true)
    setStatusCounts(null)
    try {
      const routeSelectedID = Number(routeSalesOrderID || 0)
      const [result, routeOrder] = await Promise.all([
        listSalesOrders(
          {
            ...orderListParams,
            include_status_counts: true,
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
      const exactPage = resolveExactRecordPage({
        records: listedOrders,
        exactRecord: routeOrder,
        hasExactContext: routeSelectedID > 0,
        total: Number(result?.total || listedOrders.length || 0),
      })
      const nextOrders = exactPage.records
      setOrders(nextOrders)
      setTotal(exactPage.total)
      setStatusCounts(
        resolveBusinessStatusCounts(result, {
          hasExactContext: routeSelectedID > 0,
          exactRecord: routeOrder,
          statusField: 'lifecycle_status',
        })
      )
      const restoreID = restoreProgressSelection.current
      if (restoreID) {
        restoreProgressSelection.current = 0
        setSavedProgressReturn(null)
      }
      setSelectedOrder((current) => {
        if (routeSelectedID > 0) {
          return routeOrder || null
        }
        const selectionID = current?.id || restoreID
        return nextOrders.find((item) => item.id === selectionID) || null
      })
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      showPageLoadError(error, '加载销售订单')
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    orderListParams,
    pagination,
    routeSalesOrderID,
    setSavedProgressReturn,
  ])

  useEffect(() => {
    if (
      loading ||
      !selectedOrder ||
      selectedOrder.id !== initialProgressReturn.current?.orderID
    ) {
      return
    }
    initialProgressReturn.current = null
    progressTriggerRef.current?.focus({ preventScroll: true })
  }, [loading, selectedOrder])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() => {
      setReferenceRefreshKey((key) => key + 1)
      return loadOrders()
    })
  }, [loadOrders, outletContext])

  const {
    cancelOrderEdit,
    editingOrder,
    invalidatePendingEdit,
    itemLoading,
    openCreateOrder,
    openEditOrder,
    orderAttachmentRef,
    orderCreateResultUnknown,
    orderModalOpen,
    saveOrder,
  } = useSalesOrderEditor({
    adminProfile,
    beginLatestRequest,
    canUpdateOrder,
    customers,
    loadCustomerContacts,
    loadOrders,
    mergeCustomers,
    mergeProductSKUs,
    orderForm,
    rememberPaymentCondition,
    setCustomerContacts,
    setPagination,
    setSaving,
    setSelectedOrder,
  })
  const {
    closeSalesOrderReservation,
    loadReservationBalances,
    openSalesOrderReservation,
    reservationContext,
    reservationLoading,
    reservationOpen,
    submitSalesOrderReservation,
  } = useSalesOrderReservation({
    activeCustomerKey,
    beginLatestRequest,
    loadOrders,
    selectedOrder,
  })

  const openSalesOrderDetails = (order) => {
    if (!order?.id) return
    invalidatePendingEdit()
    setSelectedOrder(order)
    setDetailOrder(order)
  }

  const openSalesOrderRecord = (order) => {
    if (!order?.id) return
    setSelectedOrder(order)
    if (canUpdateOrder && isDraftSourceDocument(order)) {
      setDetailOrder(null)
      openEditOrder(order)
      return
    }
    openSalesOrderDetails(order)
  }

  const runLifecycleAction = async (action, order, reason = '') => {
    if (lifecycleInFlightRef.current || !action || !order) {
      return
    }
    lifecycleInFlightRef.current = true
    setSaving(true)
    let lifecycleAttempt = null
    try {
      let params = {
        id: order.id,
        sales_order_id: order.id,
        order_no: order.order_no,
        business_ref_no: order.order_no,
        customer_key: activeCustomerKey || undefined,
      }
      if (action.sourceLifecycle) {
        lifecycleAttempt = prepareSourceOrderLifecycleAttempt({
          action,
          attemptStore: lifecycleAttemptsRef.current,
          customerKey: activeCustomerKey,
          reason,
          record: order,
        })
        params = lifecycleAttempt.attempt.params
      }
      const updated = await action.run(params)
      if (action.returnsRecord !== false) {
        requireSourceActionRecord(updated, order.id)
      }
      if (lifecycleAttempt) {
        lifecycleAttemptsRef.current.settle(
          lifecycleAttempt.scope,
          lifecycleAttempt.attempt,
          null
        )
      }
      if (action.key === 'submit') {
        const title = orderSubmissionSuccessMessage('sales_order', updated)
        await reportBusinessResult(
          title,
          { id: order.id, order_no: order.order_no },
          getSalesOrder
        )
        showProcessSubmissionReceipt({ result: updated, title })
      } else {
        const title = action.successMessage || `销售订单已${action.label}`
        reportBusinessResult(title, updated)
        message.success(title)
      }
      const nextSelectedOrder = action.returnsRecord === false ? order : updated
      setSelectedOrder(nextSelectedOrder)
      await loadOrders()
    } catch (error) {
      const resultUnknown = lifecycleAttempt
        ? lifecycleAttemptsRef.current.settle(
            lifecycleAttempt.scope,
            lifecycleAttempt.attempt,
            error
          )
        : false
      if (resultUnknown) {
        message.warning(
          '暂时无法确认订单是否处理成功，请刷新核对最新状态；内容不变时可安全重试'
        )
      } else {
        message.error(
          getActionErrorMessage(
            error,
            action.key === 'submit' ? '提交销售订单' : `${action.label}销售订单`
          )
        )
      }
    } finally {
      lifecycleInFlightRef.current = false
      setSaving(false)
    }
  }

  const requestLifecycleAction = (action, order) => {
    if (!action || !order || lifecycleInFlightRef.current || saving) {
      return
    }
    if (!action.confirmTitle) {
      runLifecycleAction(action, order)
      return
    }
    let reason = ''
    modal.confirm({
      maskClosable: true,
      centered: true,
      title: action.confirmTitle,
      content: (
        <SourceOrderLifecycleConfirmContent
          action={action}
          processKey="sales_order_acceptance"
          customerKey={activeCustomerKey}
          onReasonChange={(value) => {
            reason = value
          }}
        />
      ),
      okText: action.okText || `确认${action.label}`,
      cancelText: '取消',
      okButtonProps: action.danger ? { danger: true } : undefined,
      onOk: (_close) => {
        try {
          normalizeSourceOrderLifecycleReason(action, reason)
        } catch (error) {
          message.warning(getActionErrorMessage(error, '校验业务原因'))
          return
        }
        return runLifecycleAction(action, order, reason)
      },
    })
  }

  const orderDataColumns = useMemo(
    () =>
      filterColumnsByEffectiveFieldPolicy(
        buildSalesOrderColumns(),
        adminProfile,
        'sales_orders.default'
      ),
    [adminProfile]
  )
  const galleryColumns = useMemo(
    () =>
      documentProductGalleryColumn(
        DOCUMENT_PRODUCT_SOURCES.SALES_ORDER,
        adminProfile
      ),
    [adminProfile]
  )
  const taskDetailColumns = useMemo(
    () => [...galleryColumns, ...orderDataColumns],
    [galleryColumns, orderDataColumns]
  )
  const orderListColumns = useMemo(
    () => [...galleryColumns, ...buildSalesOrderListColumns(orderDataColumns)],
    [orderDataColumns, galleryColumns]
  )
  const columnOrderProfile = useMemo(
    () => buildSalesOrderColumnProfile(adminProfile, orderListColumns),
    [adminProfile, orderListColumns]
  )

  const {
    tableColumns: orderColumns,
    exportColumns: orderedListColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile: columnOrderProfile,
    moduleKey: SALES_ORDERS_MODULE_KEY,
    moduleTitle: '销售订单列表',
    columns: orderListColumns,
  })
  const visibleOrderDataColumns = useMemo(
    () => buildSalesOrderExportColumns(orderedListColumns, orderDataColumns),
    [orderedListColumns, orderDataColumns]
  )

  const loadExportOrders = useCallback(
    async ({ signal }) => {
      const routeSelectedID = Number(routeSalesOrderID || 0)
      return exportSalesOrders(
        routeSelectedID > 0 ? { id: routeSelectedID } : orderListParams,
        { signal }
      )
    },
    [orderListParams, routeSalesOrderID]
  )
  const { exporting, exportRows: exportOrders } = useBusinessListExport({
    requestKey: 'sales-orders-export',
    loadRows: loadExportOrders,
    filename: `销售订单-${currentBusinessDate()}.csv`,
    columns: visibleOrderDataColumns,
    recordLabel: '销售订单',
  })

  const activeFilterCount = [
    lifecycleScope !== LIFECYCLE_SCOPE.CURRENT,
    customerFilter,
    dateFilterStart || dateFilterEnd,
    sortFilter !== 'updated_at:desc',
  ].filter(Boolean).length
  const clearRouteContext = useCallback(
    (resetScope = false) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      nextParams.delete('sales_order_id')
      setSearchParams(
        resetScope
          ? withLifecycleScopeSearchParam(nextParams, LIFECYCLE_SCOPE.CURRENT)
          : nextParams,
        { replace: true }
      )
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams, setPagination]
  )
  const clearFilters = useCallback(() => {
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    setStatusFilter((current) =>
      lifecycleScopeIncludesStatus(LIFECYCLE_SCOPE.CURRENT, current, [
        'closed',
        'canceled',
      ])
        ? current
        : ''
    )
    setCustomerFilter('')
    setDateFilterField('order_date')
    setDateFilterStart('')
    setDateFilterEnd('')
    setSortFilter('updated_at:desc')
    setSearchParams(
      (current) =>
        withLifecycleScopeSearchParam(current, LIFECYCLE_SCOPE.CURRENT),
      { replace: true }
    )
    resetBusinessPaginationCurrent(setPagination)
  }, [
    setLifecycleScope,
    setStatusFilter,
    setCustomerFilter,
    setDateFilterField,
    setDateFilterStart,
    setDateFilterEnd,
    setSortFilter,
    setSearchParams,
    setPagination,
  ])

  const selectedOrderDisplayText = useMemo(() => {
    if (!selectedOrder) return '请先选择销售订单'
    const customerName =
      selectedOrder.customer_snapshot?.name ||
      (selectedOrder.customer_id ? '客户已关联' : '未指定客户')
    return `${selectedOrder.order_no || '已登记销售订单'} / ${customerName}`
  }, [selectedOrder])
  const lifecycleActions = useMemo(() => {
    return resolveBusinessLifecycleActions({
      actions: SALES_ORDER_LIFECYCLE_ACTIONS,
      selected: Boolean(selectedOrder),
      busy: saving,
      hasPermission: (action) =>
        hasActionPermission(adminProfile, action.permission),
      canRun: (action) =>
        canRunSalesOrderLifecycleAction(
          selectedOrder?.lifecycle_status,
          action.nextStatus
        ),
      selectionReason: '请先选择一条销售订单',
      busyReason: '当前订单操作完成后可继续办理',
      getUnavailableReason: (action) => `当前销售订单状态不能${action.label}`,
    })
  }, [adminProfile, saving, selectedOrder])
  const {
    showPrimarySlot: showLifecyclePrimary,
    primaryAction: primaryLifecycleAction,
    secondaryActions: secondaryLifecycleActions,
    actionStates: lifecycleActionStates,
  } = lifecycleActions
  const primaryLifecycleState = lifecycleActionStates[
    primaryLifecycleAction?.key
  ] || {
    disabled: true,
    disabledReason: '请先选择一条销售订单',
  }
  const relatedMenuItems = useMemo(
    () =>
      [
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.shipments)
          ? { key: 'shipments', label: '出货单' }
          : null,
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.outbound)
          ? { key: 'outbound', label: '出库 / 预留' }
          : null,
      ].filter(Boolean),
    [canOpenRelatedPath]
  )
  const relatedActionAvailability = resolveRelatedRecordActionAvailability({
    authorized: relatedMenuItems.length > 0,
    record: selectedOrder,
    itemCount: relatedMenuItems.length,
    busy: saving,
    busyReason: '当前订单操作完成后可查看相关单据',
  })
  const openRelatedTable = ({ key }) => {
    if (!selectedOrder) return
    const salesOrderID = selectedOrder.id
    const pathByKey = {
      shipments: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.shipments,
        { sales_order_id: salesOrderID },
        {
          keyword: selectedOrder.order_no,
          source: 'sales-order',
          fields: ['sales_order_no'],
        }
      ),
      outbound: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.outbound,
        { sales_order_id: salesOrderID },
        {
          keyword: selectedOrder.order_no,
          source: 'sales-order',
          fields: ['sales_order_no'],
        }
      ),
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }
  useReferenceHydration(
    {
      customers: {
        ids: [
          ...orders.map((row) => row.customer_id),
          editingOrder?.customer_id,
          customerFilter,
        ],
        records: customers,
        onRecords: mergeCustomers,
        enabled: canReadReference(adminProfile, 'customers'),
      },
    },
    adminProfile,
    referenceRefreshKey
  )

  return (
    <ReferenceRecordsProvider
      component={BusinessPageLayout}
      adminProfile={adminProfile}
      handlers={{ customers: mergeCustomers, product_skus: mergeProductSKUs }}
      className="erp-sales-orders-page"
    >
      <PageHeaderCard
        compact
        helpKey="sales-orders"
        title={getBusinessDocumentTitle('sales_order')}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SearchInput
              inputRef={searchInputRef}
              initialDraft={initialProgressReturn.current?.draft}
              {...BUSINESS_SEARCH_SCOPES.sales}
              value={resolvedRouteKeyword || linkedKeyword || keyword}
              onSearch={(value) => {
                if (linkedKeyword || routeSalesOrderID) {
                  clearRouteContext()
                }
                setKeyword(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <LifecycleScopeFilter
              value={lifecycleScope}
              onChange={(nextScope) => {
                setLifecycleScope(nextScope)
                if (
                  !lifecycleScopeIncludesStatus(nextScope, statusFilter, [
                    'closed',
                    'canceled',
                  ])
                ) {
                  setStatusFilter('')
                }
                const nextParams = clearLinkedDocumentParams(searchParams)
                nextParams.delete('sales_order_id')
                setSearchParams(
                  withLifecycleScopeSearchParam(nextParams, nextScope),
                  { replace: true }
                )
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <BusinessStatusFilter
              inline
              counts={statusCounts}
              countUnit="张"
              loading={loading}
              exact={Boolean(routeSalesOrderID)}
              aria-label="销售订单状态"
              options={lifecycleStatusOptions}
              value={statusFilter}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <RemoteReferenceSelect
              referenceType="customers"
              component={SelectFilter}
              aria-label="客户"
              className="erp-business-filter-control--status"
              options={[{ label: '全部客户', value: '' }, ...customerOptions]}
              value={customerFilter}
              placeholder="客户"
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
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onRangeChange={(from, to, field) => {
                setDateFilterField(field)
                setDateFilterStart(from)
                setDateFilterEnd(to)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              emptyValue="updated_at:desc"
              aria-label="排序方式"
              purpose="sort"
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
            {canCreateOrder ? (
              <SalesOrderExcelImport
                loadReferenceData={loadImportReferenceData}
                customers={customers}
                units={units}
                unitOptions={unitOptions}
                disabled={referencesLoading || saving || orderModalOpen}
                disabledReason={
                  referencesLoading
                    ? '基础资料加载中，请稍候'
                    : saving
                      ? '正在保存，请稍候'
                      : '请先完成当前订单编辑'
                }
                productSKUs={productSKUs}
                salesOwnerOptions={salesOwnerOptions}
                customerKey={activeCustomerKey}
                onSaved={loadOrders}
              />
            ) : null}
            <BusinessListToolbarActions
              onExport={exportOrders}
              exportDisabled={loading || exporting || total === 0}
              exportDisabledReason={exporting ? '正在准备导出，请稍候' : ''}
              onOpenColumnOrder={openColumnOrder}
            />
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
          <SelectionClearAction
            selectedCount={selectedOrder ? 1 : 0}
            selectionLabel="销售订单"
            disabled={saving}
            disabledReason="当前订单操作完成后可更换选择"
            onClear={() => {
              if (saving) return
              setSelectedOrder(null)
            }}
          />
          {hasActionPermission(
            adminProfile,
            PermissionCode.SALES_ORDER_ENGINEERING_UPDATE
          ) ? (
            <BusinessActionTooltip
              visible={
                !selectedOrder ||
                ['draft', 'submitted', 'active'].includes(
                  selectedOrderLifecycleStatus
                )
              }
              disabled={
                !selectedOrder ||
                !['draft', 'submitted', 'active'].includes(
                  selectedOrder.lifecycle_status
                ) ||
                saving
              }
              disabledReason="请选择仍在办理的销售订单"
            >
              <Button
                data-business-action-key="engineering"
                data-business-action-role="action"
                size="small"
                disabled={
                  !selectedOrder ||
                  !['draft', 'submitted', 'active'].includes(
                    selectedOrder.lifecycle_status
                  ) ||
                  saving
                }
                onClick={() => setEngineeringOrderID(selectedOrder.id)}
              >
                工程资料
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {hasActionPermission(
            adminProfile,
            PermissionCode.ENGINEERING_MATERIAL_READ
          ) ? (
            <Button
              data-business-action-key="engineering-material"
              data-business-action-role="action"
              data-business-action-group={
                canReviewMaterialRequest ? 'business' : 'query'
              }
              size="small"
              disabled={!selectedOrder || saving}
              onClick={() => setMaterialRequestOrderID(selectedOrder.id)}
            >
              {canReviewMaterialRequest ? '审核用料汇总' : '查看用料汇总'}
            </Button>
          ) : null}
          {relatedActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={relatedActionAvailability.disabled}
              disabledReason={relatedActionAvailability.disabledReason}
            >
              <Dropdown
                trigger={['click']}
                destroyOnHidden
                disabled={relatedActionAvailability.disabled}
                menu={{
                  items: relatedMenuItems,
                  onClick: openRelatedTable,
                }}
              >
                <Button
                  data-business-action-key="related-records"
                  data-business-action-role="related"
                  size="small"
                  icon={<LinkOutlined />}
                  disabled={relatedActionAvailability.disabled}
                >
                  相关单据 <DownOutlined />
                </Button>
              </Dropdown>
            </BusinessActionTooltip>
          ) : null}
          <BusinessActionTooltip
            disabled={!selectedOrder || saving}
            disabledReason={
              saving ? '当前订单操作完成后可查看详情' : '请先选择一条销售订单'
            }
          >
            <Button
              data-business-action-key="view-details"
              data-business-action-role="view"
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedOrder || saving}
              onClick={() => openSalesOrderDetails(selectedOrder)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {deliveryWorkspace.enabled && (
            <Button
              ref={progressTriggerRef}
              data-business-action-key="view-delivery-progress"
              data-business-action-role="view"
              size="small"
              icon={<BarChartOutlined aria-hidden="true" />}
              disabled={!selectedOrder || loading || saving}
              onClick={() => deliveryWorkspace.openProgress(selectedOrder.id)}
            >
              查看交付进度
            </Button>
          )}
          {canUpdateOrder ? (
            <BusinessActionTooltip
              visible={
                !selectedOrder || selectedOrderLifecycleStatus === 'draft'
              }
              disabled={!selectedOrderCanEdit || itemLoading || saving}
              disabledReason={
                !selectedOrder
                  ? '请先选择一条销售订单'
                  : selectedOrderLifecycleStatus !== 'draft'
                    ? '只有草稿销售订单可以编辑'
                    : itemLoading || saving
                      ? '当前订单操作完成后可编辑'
                      : ''
              }
            >
              <Button
                data-business-action-key="edit"
                data-business-action-role="edit"
                size="small"
                icon={<EditOutlined />}
                loading={itemLoading}
                disabled={!selectedOrderCanEdit || itemLoading || saving}
                onClick={() => openEditOrder(selectedOrder)}
              >
                编辑订单
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canCreateReservation ? (
            <BusinessActionTooltip
              visible={
                !selectedOrder ||
                ['draft', 'submitted', 'active'].includes(
                  selectedOrderLifecycleStatus
                )
              }
              disabled={
                !selectedOrder ||
                selectedOrderLifecycleStatus !== 'active' ||
                reservationLoading ||
                saving
              }
              disabledReason={
                !selectedOrder
                  ? '请先选择一条销售订单'
                  : selectedOrderLifecycleStatus !== 'active'
                    ? '销售订单生效后可预留库存'
                    : reservationLoading || saving
                      ? '当前操作完成后可继续预留库存'
                      : ''
              }
            >
              <Button
                data-business-action-key="reserve-stock"
                data-business-action-role="action"
                size="small"
                disabled={
                  !selectedOrder ||
                  selectedOrderLifecycleStatus !== 'active' ||
                  reservationLoading ||
                  saving
                }
                loading={reservationLoading}
                onClick={openSalesOrderReservation}
              >
                预留库存
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {showLifecyclePrimary ? (
            <BusinessLifecyclePrimaryAction
              action={primaryLifecycleAction}
              disabled={primaryLifecycleState.disabled}
              disabledReason={primaryLifecycleState.disabledReason}
              loading={saving && Boolean(primaryLifecycleAction)}
              onAction={(action) =>
                requestLifecycleAction(action, selectedOrder)
              }
            />
          ) : null}
          {secondaryLifecycleActions.map((action) => (
            <BusinessLifecycleSecondaryAction
              key={action.key}
              action={action}
              disabled={lifecycleActionStates[action.key]?.disabled}
              disabledReason={lifecycleActionStates[action.key]?.disabledReason}
              onAction={(requestedAction) =>
                requestLifecycleAction(requestedAction, selectedOrder)
              }
            />
          ))}
          <BusinessTaskActions
            sourceType="sales_order"
            record={selectedOrder}
            adminProfile={adminProfile}
            disabled={saving}
          />
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderColumns}
        taskDetailColumns={taskDetailColumns}
        dataSource={orders}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无销售订单"
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedOrder?.id ? [selectedOrder.id] : [],
          getCheckboxProps: () => ({ disabled: saving }),
          onChange: (_keys, selectedRows) => {
            if (saving) return
            setSelectedOrder(selectedRows[0] || null)
          },
        }}
        rowClassName={(record) =>
          record.id === selectedOrder?.id ? 'ant-table-row-selected' : ''
        }
        onRow={
          saving
            ? undefined
            : (record) => ({ onClick: () => setSelectedOrder(record) })
        }
        onOpenRecord={saving ? undefined : openSalesOrderRecord}
      />

      <BusinessDetailsModal
        descriptionInHelp
        columns={orderDataColumns}
        description="查看订单摘要和完整明细；草稿且具备编辑权限时，双击会直接进入编辑。"
        lineItems={
          canReadOrderItems
            ? {
                emptyDescription: '当前销售订单暂无明细',
                getItemFields: getSalesOrderItemFields,
                getItemGroup: (item) => ({
                  key: salesOrderLineGroupKey(item),
                  label: [
                    salesOrderRequirementName(item),
                    item?.product_code_snapshot,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }),
                getItemLabel: (item, { index }) =>
                  `明细 ${item?.line_no || index + 1}`,
                load: loadSalesOrderDetailsItems,
                title: '销售订单明细',
              }
            : null
        }
        open={Boolean(detailOrder)}
        record={detailOrder}
        title={`${getBusinessDocumentTitle('sales_order')}详情`}
        onClose={() => setDetailOrder(null)}
        extraActions={
          deliveryWorkspace.enabled &&
          detailOrder && (
            <Button
              onClick={() => {
                deliveryWorkspace.openProgress(detailOrder.id)
                setDetailOrder(null)
              }}
              icon={<BarChartOutlined aria-hidden="true" />}
            >
              查看交付进度
            </Button>
          )
        }
      />

      <SalesDeliveryWorkspace
        workspace={deliveryWorkspace}
        onOpenDashboard={canOpenBoardFromOrder ? goToOrderProgress : undefined}
      />

      {columnOrderModal}

      <SalesOrderEngineeringModal
        key={engineeringOrderID}
        orderID={engineeringOrderID}
        onCancel={() => {
          setEngineeringOrderID(null)
        }}
        onSaved={() => {
          setEngineeringOrderID(null)
          loadOrders()
        }}
      />
      <EngineeringMaterialRequestModal
        key={`${materialRequestOrderID || routeSalesOrderID || 'closed'}:${routeMaterialRequestID || 'latest'}`}
        orderID={
          materialRequestOrderID ||
          (routeMaterialRequestID ? routeSalesOrderID : null)
        }
        requestID={materialRequestOrderID ? undefined : routeMaterialRequestID}
        permissions={getEngineeringMaterialPermissions(adminProfile)}
        onCancel={() => {
          setMaterialRequestOrderID(null)
          if (routeMaterialRequestID) {
            const next = new URLSearchParams(searchParams)
            next.delete('material_request_id')
            setSearchParams(next, { replace: true })
          }
        }}
        onChanged={loadOrders}
      />
      <SalesOrderEditor
        open={orderModalOpen}
        form={orderForm}
        editingOrder={editingOrder}
        createResultUnknown={orderCreateResultUnknown}
        saving={saving}
        itemLoading={itemLoading}
        referencesLoading={referencesLoading}
        orderAttachmentRef={orderAttachmentRef}
        customers={customers}
        customerContacts={customerContacts}
        salesOwnerOptions={salesOwnerOptions}
        unitOptions={unitOptions}
        productSKUs={productSKUs}
        canCreateOrder={canCreateOrder}
        canUpdateOrder={canUpdateOrder}
        canCreateItem={canCreateItem}
        canUpdateItem={canUpdateItem}
        canCancelItem={canCancelItem}
        onOk={saveOrder}
        onCancel={cancelOrderEdit}
        onCustomerChange={applyCustomerOrderDefaults}
        onContactSelect={applyContactToOrderForm}
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
        onCancel={closeSalesOrderReservation}
        onSubmit={submitSalesOrderReservation}
      />
    </ReferenceRecordsProvider>
  )
}
