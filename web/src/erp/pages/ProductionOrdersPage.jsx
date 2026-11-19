import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Tag, Typography } from 'antd'
import { EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import { getBusinessDocumentTitle } from '../config/businessModules.mjs'
import { documentProductGalleryColumn } from '../components/business-list/BusinessDocumentProductGallery.jsx'
import { DOCUMENT_PRODUCT_SOURCES } from '../utils/businessProductGallery.mjs'
import { applyBusinessFormReadback } from '../utils/businessFormReadback.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import useTaskBusinessEditor from '../hooks/useTaskBusinessEditor.js'
import useWorkflowTaskBusinessBusy from '../hooks/useWorkflowTaskBusinessBusy.js'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import useWorkflowTaskBusinessResult from '../hooks/useWorkflowTaskBusinessResult.js'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import BusinessTaskActions from '../components/workflow/BusinessTaskActions.jsx'
import { resolveBusinessStatusCounts } from '../utils/businessStatusCounts.mjs'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import { message, useModal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  applyBusinessServerColumnSorters,
  readBusinessServerTableSort,
} from '../utils/moduleTableColumns.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
} from '../components/business-list/BusinessListLayout.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessDateInputs.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import ProductionCompletionModal from '../components/production-orders/ProductionCompletionModal.jsx'
import ProductionMaterialIssueModal from '../components/production-orders/ProductionMaterialIssueModal.jsx'
import ProductionOverIssueRequestModal from '../components/production-orders/ProductionOverIssueRequestModal.jsx'
import ProductionOrderEditor from '../components/production-orders/ProductionOrderEditor.jsx'
import ProductionReworkProgressModal from '../components/production-orders/ProductionReworkProgressModal.jsx'
import ProductionRouteExecutionModal from '../components/production-orders/ProductionRouteExecutionModal.jsx'
import { useProductionCompletion } from '../components/production-orders/useProductionCompletion.mjs'
import { useProductionMaterialIssue } from '../components/production-orders/useProductionMaterialIssue.mjs'
import { listAllProductionFacts } from '../api/operationalFactApi.mjs'
import {
  cancelProductionOrder,
  closeProductionOrder,
  createProductionOrder,
  getProductionOrder,
  listAllProductionOrders,
  listProductionOrderReferenceOptions,
  listProductionOrders,
  releaseProductionOrder,
  saveProductionOrder,
} from '../api/productionOrderApi.mjs'
import useProductionReworkProgress from '../components/production-orders/useProductionReworkProgress.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  hasActionPermission,
  BUSINESS_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createProductionOrderAttemptStore,
  dateInputToUnix,
  isProductionOrderResultUnknown,
  PRODUCTION_ORDER_STATUS,
  PRODUCTION_ORDER_STATUS_META,
  unixToDateInput,
} from '../utils/productionOrderModel.mjs'
import {
  productionReferenceSnapshotOptions,
  resolveProductionOrderDetailAccess,
} from '../utils/productionOrderPermissionAccess.mjs'
import { PRODUCTION_WIP_ROUTE_CODE } from '../utils/productionWipModel.mjs'
import { routeWithQuery, searchParamPositiveInt } from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  DEFAULT_BUSINESS_PAGE_SIZE,
  createBusinessTablePagination,
  normalizeBusinessPageSize,
  resolveExactRecordPage,
} from '../utils/businessPagination.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import {
  resolveBusinessActionAvailability,
  resolveContextualBusinessActionAvailability,
} from '../utils/businessActionAvailability.mjs'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  withLifecycleScopeSearchParam,
  normalizeLifecycleStatus,
} from '../utils/lifecycleScope.mjs'
import BusinessForm from '../components/business-list/BusinessForm.jsx'

const { Text } = Typography
const DEFAULT_QUERY = Object.freeze({
  keyword: '',
  scope: LIFECYCLE_SCOPE.CURRENT,
  status: '',
  date_field: 'planned_start_at',
  date_from: '',
  date_to: '',
  sort_by: 'updated_at',
  sort_direction: 'desc',
  page: 1,
  page_size: DEFAULT_BUSINESS_PAGE_SIZE,
})
const PRODUCTION_DATE_FILTER_OPTIONS = [
  { value: 'planned_start_at', label: '计划开始', upcoming: true },
  { value: 'planned_end_at', label: '计划结束', upcoming: true },
]
const PRODUCTION_SORT_FIELDS = {
  order_no: 'order_no',
  planned_start_at: 'planned_start_at',
  planned_end_at: 'planned_end_at',
}
const EMPTY_ORDERS = Object.freeze([])

function positiveQuery(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function queryFromSearchParams(params) {
  const scope = lifecycleScopeFromSearchParams(params)
  return {
    keyword: params.get('keyword') || '',
    scope,
    status: normalizeLifecycleStatus(scope, params.get('status'), [
      'CLOSED',
      'CANCELLED',
    ]),
    date_field: params.get('date_field') || DEFAULT_QUERY.date_field,
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    sort_by: params.get('sort_by') || DEFAULT_QUERY.sort_by,
    sort_direction:
      params.get('sort_direction') || DEFAULT_QUERY.sort_direction,
    page: positiveQuery(params.get('page'), 1),
    page_size: normalizeBusinessPageSize(params.get('page_size')),
  }
}

function displayTime(value, { emptyText = '-' } = {}) {
  if (!value) return emptyText
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function optionIDs(items, key) {
  return [
    ...new Set(
      items
        .map((item) => item?.[key])
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    ),
  ]
}

function aggregateToForm(aggregate) {
  return {
    order_no: aggregate.order.order_no,
    planned_start_at: unixToDateInput(aggregate.order.planned_start_at),
    planned_end_at: unixToDateInput(aggregate.order.planned_end_at),
    note: aggregate.order.note || '',
    items: aggregate.items.map((item) => ({
      line_no: item.line_no,
      product_id: item.product_id,
      product_sku_id: item.product_sku_id ?? null,
      unit_id: item.unit_id,
      planned_quantity: item.planned_quantity,
      sales_order_item_id: item.sales_order_item_id ?? null,
      bom_header_id: item.bom_header_id ?? null,
      route_code: item.route_code || null,
      customer_inspection_required: Boolean(item.customer_inspection_required),
      note: item.note || '',
    })),
  }
}

function draftParams(values) {
  return {
    order_no: String(values.order_no || '').trim(),
    planned_start_at: dateInputToUnix(values.planned_start_at),
    planned_end_at: dateInputToUnix(values.planned_end_at),
    note: String(values.note || '').trim() || null,
    items: (values.items || []).map((item, index) => ({
      line_no: index + 1,
      product_id: item.product_id,
      product_sku_id: item.product_sku_id || null,
      unit_id: item.unit_id,
      planned_quantity: String(item.planned_quantity || '').trim(),
      sales_order_item_id: item.sales_order_item_id || null,
      bom_header_id: item.bom_header_id || null,
      route_code: item.route_code || null,
      customer_inspection_required: Boolean(item.customer_inspection_required),
      note: String(item.note || '').trim() || null,
    })),
  }
}

export default function ProductionOrdersPage() {
  const modal = useModal()
  const outletContext = useBusinessPageContext()
  const taskSource =
    outletContext?.taskCommand?.kind === 'production_plan'
      ? outletContext.taskCommand
      : null
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const allowedMenuPaths = outletContext?.allowedMenuPaths || []
  const navigate = useBusinessNavigate()
  const location = useLocation()
  const processReturn = location.state?.productionProcessReturn
  const canReturnToExecution =
    processReturn?.pathname === BUSINESS_ROUTE_PATHS.productionProgress &&
    new URLSearchParams(processReturn.search || '').get('display') === 'process'
  const [searchParams, setSearchParams] = useBusinessSearchParams()
  const routeProductionOrderID = searchParamPositiveInt(
    searchParams,
    'production_order_id'
  )
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const [form] = Form.useForm()
  const [reasonForm] = Form.useForm()
  const [query, setQuery] = useState(() => queryFromSearchParams(searchParams))
  const [listResult, setListResult] = useState(null)
  const orders = listResult?.orders || EMPTY_ORDERS
  const total = listResult?.total || 0
  const displayedQuery = listResult?.query || query
  const [statusCounts, setStatusCounts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mutationLoading, setMutationLoading] = useState(false)
  useWorkflowTaskBusinessBusy(mutationLoading)
  const [selected, setSelected] = useState(null)
  const [aggregate, setAggregate] = useState(null)
  const resolvedRouteKeyword =
    routeProductionOrderID &&
    Number(selected?.id || 0) === Number(routeProductionOrderID)
      ? String(selected?.order_no || '').trim()
      : ''
  const [formMode, setFormMode] = useState(null)
  const [formValues, setFormValues] = useState(null)
  const [reasonAction, setReasonAction] = useState(null)
  const [optionsByType, setOptionsByType] = useState({})
  const [productionRouteOpen, setProductionRouteOpen] = useState(false)
  const linkedWipBatchID = searchParamPositiveInt(searchParams, 'wip_batch_id')
  const linkedProductionItemID = searchParamPositiveInt(
    searchParams,
    'production_order_item_id'
  )
  useEffect(() => {
    if (
      (linkedWipBatchID || linkedProductionItemID) &&
      Number(selected?.id) === Number(routeProductionOrderID)
    ) {
      setProductionRouteOpen(true)
    }
  }, [
    linkedWipBatchID,
    linkedProductionItemID,
    selected?.id,
    routeProductionOrderID,
  ])
  const [overIssueRequirement, setOverIssueRequirement] = useState(null)
  const attemptsRef = useRef(createProductionOrderAttemptStore())
  const inFlightRef = useRef(false)
  const selectedIDRef = useRef(0)
  const beginLatestRequest = useLatestRequestCoordinator()

  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''

  const canReadProductionWip = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_WIP_READ
  )
  const canReadProductionPlan = hasActionPermission(
    adminProfile,
    PermissionCode.PMC_PLAN_READ
  )
  const canRead = canReadProductionPlan || canReadProductionWip
  const canCreate =
    canReadProductionPlan &&
    hasActionPermission(adminProfile, PermissionCode.PMC_PLAN_CREATE)
  const canUpdate =
    canReadProductionPlan &&
    hasActionPermission(adminProfile, PermissionCode.PMC_PLAN_UPDATE)
  const canReadSalesOrderReferences =
    canReadProductionPlan &&
    hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_READ) &&
    hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_ITEM_READ)
  const canReadBOMReferences =
    canReadProductionPlan &&
    hasActionPermission(adminProfile, PermissionCode.BOM_READ)
  const productionReferenceAccess = useMemo(
    () => ({
      product: canReadProductionPlan,
      product_sku: canReadProductionPlan,
      unit: canReadProductionPlan,
      sales_order_item: canReadSalesOrderReferences,
      active_bom: canReadBOMReferences,
    }),
    [canReadBOMReferences, canReadProductionPlan, canReadSalesOrderReferences]
  )
  const canCreateCompletion = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_COMPLETION_CREATE
  )
  const canReadProductionFacts = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_FACT_READ
  )
  const canCreateMaterialIssue = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_MATERIAL_ISSUE_CREATE
  )
  const canSubmitProductionException = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_OVER_ISSUE_SUBMIT
  )
  const canWarehousePackaging = hasActionPermission(
    adminProfile,
    PermissionCode.WAREHOUSE_PACKAGING_EXECUTE
  )
  const canIssueCutting = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_MATERIAL_ISSUE_CREATE
  )
  const canAssignProductionWip = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_WIP_ASSIGN
  )
  const canExecuteProductionWip = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_WIP_EXECUTE
  )
  const canReceiveProductionReturn = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_RETURN_RECEIPT_CREATE
  )
  const canConfirmPackagingMaterial = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_PACKAGING_MATERIAL_CONFIRM
  )
  const canReadOutsourcingContracts = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_ORDER_READ
  )
  const canManageProductionWip =
    canWarehousePackaging ||
    canIssueCutting ||
    canAssignProductionWip ||
    canExecuteProductionWip ||
    canReceiveProductionReturn ||
    canConfirmPackagingMaterial
  const productionRouteReadOnly =
    canReadProductionWip && !canManageProductionWip
  const selectedProductionRouteRelevant = [
    PRODUCTION_ORDER_STATUS.RELEASED,
    PRODUCTION_ORDER_STATUS.CLOSED,
  ].includes(selected?.status)
  const productionRouteActionAvailability = productionRouteReadOnly
    ? resolveContextualBusinessActionAvailability({
        authorized: canReadProductionWip,
        selected: Boolean(selected),
        relevant: selectedProductionRouteRelevant,
        busy: detailLoading || mutationLoading,
        busyReason: '当前资料处理完成后可查看工序',
      })
    : resolveBusinessActionAvailability({
        authorized: canReadProductionWip,
        selected: Boolean(selected),
        relevant: selectedProductionRouteRelevant,
        applicable: selectedProductionRouteRelevant,
        busy: detailLoading || mutationLoading,
        selectionReason: '请先选择一张生产订单',
        unavailableReason: '生产订单发布后可办理工序',
        busyReason: '当前资料处理完成后可办理工序',
      })
  const reworkProgress = useProductionReworkProgress(
    selected, canReadProductionWip && canReadProductionFacts
  )
  const productionReworkProgressAvailability =
    resolveContextualBusinessActionAvailability({
      authorized: canReadProductionWip && canReadProductionFacts,
      selected: Boolean(selected),
      relevant: selectedProductionRouteRelevant,
      busy: detailLoading || reworkProgress.loading,
      busyReason: '当前资料加载完成后可查看返工进度',
    })
  const canOpenProductionScheduling = canOpenRelatedDocumentPath({
    path: '/erp/task-board',
    adminProfile,
    allowedMenuPaths,
  })
  const productionSchedulingRelevant = [
    PRODUCTION_ORDER_STATUS.RELEASED,
    PRODUCTION_ORDER_STATUS.CLOSED,
    PRODUCTION_ORDER_STATUS.CANCELLED,
  ].includes(selected?.status)
  const productionSchedulingActionAvailability =
    resolveContextualBusinessActionAvailability({
      authorized: canOpenProductionScheduling,
      selected: Boolean(selected),
      relevant: productionSchedulingRelevant,
      busy: detailLoading || mutationLoading,
      busyReason: '当前资料处理完成后可查看排产确认',
    })

  useEffect(() => {
    selectedIDRef.current = Number(selected?.id || 0)
  }, [selected?.id])

  const writeQuery = useCallback(
    (patch) => {
      const next = { ...query, ...patch }
      setQuery(next)
      if (taskSource) return
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(next)) {
        if (key === 'scope' && value === LIFECYCLE_SCOPE.CURRENT) continue
        if (value !== '' && value !== null && value !== undefined) {
          params.set(key, String(value))
        }
      }
      setSearchParams(params, { replace: true })
    },
    [query, setSearchParams, taskSource]
  )

  const productionOrderListParams = useMemo(
    () => ({
      keyword: linkedDocumentRequestKeyword({
        localKeyword: query.keyword,
        linkedKeyword,
        hasExactContext: Boolean(routeProductionOrderID),
      }),
      status: query.status,
      lifecycle_scope: query.scope,
      date_field: query.date_field,
      date_from: dateInputToUnix(query.date_from),
      date_to: dateInputToUnix(query.date_to),
      sort_by: query.sort_by,
      sort_direction: query.sort_direction,
    }),
    [linkedKeyword, query, routeProductionOrderID]
  )
  const productionStatusOptions = useMemo(
    () =>
      filterLifecycleStatusOptions(
        Object.entries(PRODUCTION_ORDER_STATUS_META).map(([value, meta]) => ({
          value,
          label: meta.label,
        })),
        query.scope,
        [PRODUCTION_ORDER_STATUS.CLOSED, PRODUCTION_ORDER_STATUS.CANCELLED]
      ),
    [query.scope]
  )

  const loadOrders = useCallback(async () => {
    if (!canRead) return
    const request = beginLatestRequest('production-orders')
    setLoading(true)
    setStatusCounts(null)
    try {
      const routeSelectedID = Number(routeProductionOrderID || 0)
      const [data, routeAggregate] = await Promise.all([
        listProductionOrders(
          {
            ...productionOrderListParams,
            include_status_counts: true,
            limit: query.page_size,
            offset: (query.page - 1) * query.page_size,
          },
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getProductionOrder(routeSelectedID, { signal: request.signal })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) return
      const listedOrders = data.production_orders
      const routeOrder = routeAggregate?.order || null
      const exactPage = resolveExactRecordPage({
        records: listedOrders,
        exactRecord: routeOrder,
        hasExactContext: routeSelectedID > 0,
        total: data.total,
      })
      setListResult({
        orders: exactPage.records,
        total: exactPage.total,
        query,
      })
      setStatusCounts(
        resolveBusinessStatusCounts(data, {
          hasExactContext: routeSelectedID > 0,
          exactRecord: routeOrder,
          statusField: 'status',
        })
      )
      if (routeSelectedID > 0) {
        setSelected(routeOrder)
        setAggregate(routeAggregate)
      }
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        showPageLoadError(error, '加载生产订单')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [
    beginLatestRequest,
    canRead,
    productionOrderListParams,
    query,
    routeProductionOrderID,
  ])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!formMode || !formValues) return
    applyBusinessFormReadback(form, formValues)
  }, [form, formMode, formValues])

  useEffect(() => {
    if (!reasonAction) return
    reasonForm.resetFields()
  }, [reasonAction, reasonForm])

  const loadHistoricalOptions = useCallback(
    async (items, { productionOrderID, ...options } = {}) => {
      const snapshotOptions = productionReferenceSnapshotOptions(items)
      if (options.mode === 'view') {
        setOptionsByType(snapshotOptions)
        return
      }
      const definitions = [
        ['product', 'product_id'],
        ['product_sku', 'product_sku_id'],
        ['unit', 'unit_id'],
        ['sales_order_item', 'sales_order_item_id'],
        ['active_bom', 'bom_header_id'],
      ].filter(([type]) => productionReferenceAccess[type] === true)
      if (definitions.length === 0) {
        setOptionsByType(snapshotOptions)
        return
      }
      const pairs = await Promise.all(
        definitions.map(async ([type, key]) => {
          const ids = optionIDs(items, key)
          if (ids.length === 0) return [type, []]
          const data = await listProductionOrderReferenceOptions(
            type,
            {
              selected_ids: ids,
              ...(type === 'sales_order_item' && productionOrderID
                ? { production_order_id: productionOrderID }
                : {}),
            },
            options
          )
          return [type, data.options]
        })
      )
      setOptionsByType({
        ...snapshotOptions,
        ...Object.fromEntries(pairs),
      })
    },
    [productionReferenceAccess]
  )

  const loadDetail = async (record, mode = 'view') => {
    setDetailLoading(true)
    try {
      const nextAggregate = await getProductionOrder(record.id)
      const detailAccess = resolveProductionOrderDetailAccess({
        requestedMode: mode,
        items: nextAggregate.items,
        referenceAccess: productionReferenceAccess,
      })
      if (detailAccess.mode !== mode) {
        message.info(
          `订单关联的${detailAccess.unreadableSources.join('、')}不在当前账号读取范围内，已按只读方式打开`
        )
      }
      await loadHistoricalOptions(nextAggregate.items, {
        mode: detailAccess.mode,
        productionOrderID:
          nextAggregate.order.status === PRODUCTION_ORDER_STATUS.DRAFT
            ? nextAggregate.order.id
            : null,
      })
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setFormValues(aggregateToForm(nextAggregate))
      setFormMode(detailAccess.mode)
    } catch (error) {
      showPageLoadError(error, '加载生产订单详情')
    } finally {
      setDetailLoading(false)
    }
  }

  useTaskBusinessEditor({
    record: selected,
    enabled:
      canUpdate &&
      selected?.status === PRODUCTION_ORDER_STATUS.DRAFT &&
      outletContext?.taskBusiness?.contract?.actionKeys.includes('edit'),
    open: (record) => loadDetail(record, 'edit'),
  })

  const selectRecord = async (record) => {
    const request = beginLatestRequest('production-order-selection')
    setSelected(record)
    setAggregate(null)
    try {
      const nextAggregate = await getProductionOrder(record.id, {
        signal: request.signal,
      })
      if (request.isCurrent() && nextAggregate.order.id === record.id) {
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
      }
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        showPageLoadError(error, '加载生产订单详情')
      }
    } finally {
      request.finish()
    }
  }

  const viewProductionFacts = (order = selected) => {
    if (!order?.id) return
    navigate(
      routeWithQuery(BUSINESS_ROUTE_PATHS.productionProgress, {
        source_type: 'PRODUCTION_ORDER',
        source_id: order.id,
      })
    )
  }

  const viewProductionProcess = (order = selected) => {
    if (!order?.id) return
    navigate(
      routeWithQuery(BUSINESS_ROUTE_PATHS.productionProgress, {
        source_type: 'PRODUCTION_ORDER',
        source_id: order.id,
        display: 'process',
      })
    )
  }

  const openProductionScheduling = (order = selected) => {
    if (!order?.id || !canOpenProductionScheduling) return
    navigate(
      routeWithQuery('/erp/task-board', {
        mode: 'todo',
        q: order.order_no,
        source: 'production-orders',
      })
    )
  }

  const refreshProductionSources = async (orderID) => {
    const request = beginLatestRequest('production-fact-sources-refresh')
    try {
      const [nextAggregate, factData] = await Promise.all([
        getProductionOrder(orderID, { signal: request.signal }),
        listAllProductionFacts(
          {
            source_type: 'PRODUCTION_ORDER',
            source_id: orderID,
          },
          { signal: request.signal }
        ),
      ])
      if (!request.isCurrent() || selectedIDRef.current !== orderID) {
        return null
      }
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      return { aggregate: nextAggregate, facts }
    } finally {
      request.finish()
    }
  }

  const openProductionOverIssue = (requirement) => {
    if (
      !canReadProductionPlan ||
      !canSubmitProductionException ||
      aggregate?.order?.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
      !requirement?.id
    ) {
      message.warning('当前物料需求不能发起超领申请')
      return
    }
    setOverIssueRequirement(requirement)
  }

  const beginCreate = () => {
    setAggregate(null)
    setOptionsByType({})
    setFormValues({
      order_no: '',
      planned_start_at: '',
      planned_end_at: '',
      note: '',
      items: [
        {
          line_no: 1,
          planned_quantity: '1',
          route_code: PRODUCTION_WIP_ROUTE_CODE,
          customer_inspection_required: false,
        },
      ],
    })
    setFormMode('create')
  }

  const refreshAfterSuccess = async () => {
    try {
      await loadOrders()
    } catch {
      message.warning('操作已成功，但列表刷新失败，请手动刷新当前页')
    }
  }

  const {
    closeProductionMaterialIssue,
    loadProductionMaterialIssueLots,
    materialIssueContext,
    materialIssueLoading,
    materialIssueLotsLoading,
    materialIssueOpen,
    openProductionMaterialIssue,
    submitProductionMaterialIssue,
  } = useProductionMaterialIssue({
    activeCustomerKey,
    aggregate,
    beginLatestRequest,
    canCreateMaterialIssue,
    canReadProductionFacts,
    refreshProductionSources,
    reportBusinessResult,
    selected,
    selectedIDRef,
    setAggregate,
    setFormMode,
    setFormValues,
    setSelected,
  })
  const {
    closeProductionCompletion,
    completionContext,
    completionLoading,
    completionOpen,
    openProductionCompletion,
    submitProductionCompletion,
  } = useProductionCompletion({
    activeCustomerKey,
    beginLatestRequest,
    canReadProductionWip,
    modal,
    refreshAfterSuccess,
    refreshProductionSources,
    reportBusinessResult,
    selected,
    selectedIDRef,
    setProductionRouteOpen,
  })

  const runMutation = async (scope, payload, execute, successText) => {
    if (inFlightRef.current) return false
    const attempt = attemptsRef.current.prepare(scope, payload)
    inFlightRef.current = true
    setMutationLoading(true)
    try {
      const result = await execute(attempt.params)
      attemptsRef.current.finish(scope, attempt)
      message.success(successText)
      setAggregate(result)
      setSelected(result.order)
      reportBusinessResult(successText, result.order)
      return result
    } catch (error) {
      if (!isProductionOrderResultUnknown(error)) {
        attemptsRef.current.finish(scope, attempt)
        message.error(
          getActionErrorMessage(error, successText.replace('成功', ''))
        )
      } else {
        message.warning(
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      }
      return false
    } finally {
      inFlightRef.current = false
      setMutationLoading(false)
    }
  }

  const submitDraft = async (values) => {
    const draft = draftParams(values)
    if (
      taskSource &&
      draft.items.some(
        (item) =>
          !taskSource.items.some(
            (source) => source.id === item.sales_order_item_id
          )
      )
    ) {
      message.warning('请使用当前任务关联的销售订单行，保留填写内容后重新核对')
      return
    }
    const isCreate = formMode === 'create'
    const payload = isCreate
      ? draft
      : {
          ...draft,
          production_order_id: aggregate.order.id,
          expected_version: aggregate.order.version,
        }
    const ok = await runMutation(
      isCreate ? 'create' : `save:${aggregate.order.id}`,
      payload,
      isCreate ? createProductionOrder : saveProductionOrder,
      isCreate ? '生产订单草稿创建成功' : '生产订单草稿保存成功'
    )
    if (!ok) return
    if (outletContext?.taskBusiness) {
      setFormValues(aggregateToForm(ok))
      setFormMode('edit')
      await refreshAfterSuccess()
      return
    }
    setFormMode(null)
    setFormValues(null)
    if (isCreate) {
      writeQuery({ page: 1 })
      return
    }
    await refreshAfterSuccess()
  }

  const runLifecycle = async (action, reason = null) => {
    if (!aggregate?.order) return
    const payload = {
      production_order_id: aggregate.order.id,
      expected_version: aggregate.order.version,
      ...(action === 'close' || action === 'cancel' ? { reason } : {}),
    }
    const operations = {
      release: [
        releaseProductionOrder,
        '生产订单已发布，排产确认已进入 PMC 待办',
      ],
      close: [closeProductionOrder, '生产订单关闭成功'],
      cancel: [cancelProductionOrder, '生产订单取消成功'],
    }
    const [execute, successText] = operations[action]
    const ok = await runMutation(
      `${action}:${aggregate.order.id}`,
      payload,
      execute,
      successText
    )
    if (!ok) return
    setReasonAction(null)
    setFormMode(null)
    setFormValues(null)
    await refreshAfterSuccess()
  }

  const renderReleaseAction = ({
    disabled = false,
    disabledReason = '',
  } = {}) =>
    canUpdate ? (
      <BusinessActionTooltip
        visible={!selected || selected.status === PRODUCTION_ORDER_STATUS.DRAFT}
        disabled={
          disabled ||
          !selected ||
          selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
          !aggregate ||
          mutationLoading
        }
        disabledReason={
          disabled
            ? disabledReason
            : !selected
              ? '请先选择一张生产订单'
              : selected.status !== PRODUCTION_ORDER_STATUS.DRAFT
                ? '只有生产订单草稿可以发布'
                : !aggregate
                  ? '生产订单资料加载完成后可发布'
                  : mutationLoading
                    ? '当前操作完成后可发布'
                    : ''
        }
      >
        <Button
          data-business-action-key="release"
          data-business-action-role="primary"
          type="primary"
          className="erp-business-module-status-action"
          disabled={
            disabled ||
            !selected ||
            selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
            !aggregate ||
            mutationLoading
          }
          onClick={() =>
            modal.confirm({
              maskClosable: true,
              title: '确认发布生产订单？',
              content: '发布后计划明细将不能直接修改。',
              okText: '确认发布',
              onOk: () => runLifecycle('release'),
            })
          }
        >
          发布
        </Button>
      </BusinessActionTooltip>
    ) : null

  const columns = useMemo(
    () => [
      {
        title: '生产单号',
        dataIndex: 'order_no',
        copyable: { label: '生产单号' },
        width: 180,
        widthGrow: 1,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (value) => (
          <Tag color={PRODUCTION_ORDER_STATUS_META[value]?.color}>
            {PRODUCTION_ORDER_STATUS_META[value]?.label || '待核对'}
          </Tag>
        ),
        exportValue: (record) =>
          PRODUCTION_ORDER_STATUS_META[record?.status]?.label || '待核对',
      },
      {
        title: '计划开始',
        dataIndex: 'planned_start_at',
        width: 150,
        render: displayTime,
        exportValue: (record) =>
          displayTime(record?.planned_start_at, { emptyText: '' }),
      },
      {
        title: '计划结束',
        dataIndex: 'planned_end_at',
        width: 150,
        render: displayTime,
        exportValue: (record) =>
          displayTime(record?.planned_end_at, { emptyText: '' }),
      },
      {
        align: 'left',
        title: '备注',
        dataIndex: 'note',
        width: 260,
        widthGrow: 2,
        render: (value) => value || '-',
      },
    ],
    []
  )
  const listColumns = useMemo(
    () => [
      ...documentProductGalleryColumn(
        DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER,
        adminProfile,
        { showIdentity: true }
      ),
      ...columns,
    ],
    [adminProfile, columns]
  )
  const {
    tableColumns,
    visibleColumns: taskDetailColumns,
    exportColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: 'production-orders',
    moduleTitle: '生产订单',
    columns: listColumns,
  })
  const canSortOrders = !taskSource && !routeProductionOrderID
  const sortedColumns = useMemo(
    () =>
      canSortOrders
        ? applyBusinessServerColumnSorters(
            tableColumns,
            PRODUCTION_SORT_FIELDS,
            displayedQuery
          )
        : tableColumns,
    [canSortOrders, displayedQuery, tableColumns]
  )
  const handleTableChange = (_pagination, _filters, sorter, { action }) => {
    if (action !== 'sort' || !canSortOrders) return
    const sort = readBusinessServerTableSort(sorter, PRODUCTION_SORT_FIELDS)
    setSelected(null)
    setAggregate(null)
    writeQuery({
      sort_by: sort?.sort_by || DEFAULT_QUERY.sort_by,
      sort_direction: sort?.sort_direction || DEFAULT_QUERY.sort_direction,
      page: 1,
    })
  }
  const loadExportOrders = useCallback(
    async ({ signal }) => {
      if (!canRead) return []
      const routeSelectedID = Number(routeProductionOrderID || 0)
      if (routeSelectedID > 0) {
        const routeAggregate = await getProductionOrder(routeSelectedID, {
          signal,
        })
        return routeAggregate?.order ? [routeAggregate.order] : []
      }
      const data = await listAllProductionOrders(productionOrderListParams, {
        signal,
      })
      return data?.production_orders
    },
    [canRead, productionOrderListParams, routeProductionOrderID]
  )
  useEffect(
    () => outletContext?.registerPageRefresh?.(loadOrders),
    [loadOrders, outletContext]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: 'production-orders-export',
    loadRows: loadExportOrders,
    filename: `生产订单-${currentBusinessDate()}.csv`,
    columns: exportColumns,
    recordLabel: '生产订单',
  })

  if (!canRead) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard title={getBusinessDocumentTitle('production_order')} />
        <Alert
          type="warning"
          showIcon
          message="当前账号没有查看生产订单的权限。"
        />
      </BusinessPageLayout>
    )
  }

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        helpKey="production-orders"
        title={getBusinessDocumentTitle('production_order')}
      />
      <BusinessOperationPanel
        showSelection
        filters={
          <>
            <SearchInput
              value={resolvedRouteKeyword || linkedKeyword || query.keyword}
              {...BUSINESS_SEARCH_SCOPES.production}
              onSearch={(value) => writeQuery({ keyword: value, page: 1 })}
            />
            <LifecycleScopeFilter
              value={query.scope}
              onChange={(value) =>
                writeQuery({
                  scope: value,
                  status: lifecycleScopeIncludesStatus(value, query.status, [
                    PRODUCTION_ORDER_STATUS.CLOSED,
                    PRODUCTION_ORDER_STATUS.CANCELLED,
                  ])
                    ? query.status
                    : '',
                  page: 1,
                })
              }
            />
            <BusinessStatusFilter
              inline
              aria-label="生产订单状态"
              value={query.status || ''}
              counts={statusCounts}
              loading={loading}
              exact={Boolean(routeProductionOrderID)}
              options={productionStatusOptions}
              onChange={(value) => writeQuery({ status: value || '', page: 1 })}
            />
            <DateRangeFilter
              options={PRODUCTION_DATE_FILTER_OPTIONS}
              value={query.date_field}
              startValue={query.date_from}
              endValue={query.date_to}
              onTypeChange={(value) =>
                writeQuery({ date_field: value, page: 1 })
              }
              onRangeChange={(from, to) =>
                writeQuery({ date_from: from, date_to: to, page: 1 })
              }
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportRows}
            exportDisabled={loading || exporting || total === 0}
            exportDisabledReason={
              exporting
                ? '正在准备导出，请稍候'
                : loading
                  ? '生产订单加载完成后可导出'
                  : total === 0
                    ? '当前筛选没有可导出的生产订单'
                    : ''
            }
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={beginCreate}
            >
              新建生产订单
            </Button>
          ) : null
        }
        onClearFilters={() => {
          const { scope } = DEFAULT_QUERY
          const status = lifecycleScopeIncludesStatus(scope, query.status, [
            PRODUCTION_ORDER_STATUS.CLOSED,
            PRODUCTION_ORDER_STATUS.CANCELLED,
          ])
            ? query.status
            : ''
          setQuery((current) => ({
            ...current,
            scope,
            status,
            date_field: DEFAULT_QUERY.date_field,
            date_from: '',
            date_to: '',
            page: 1,
          }))
          setSearchParams(
            (current) => {
              const next = withLifecycleScopeSearchParam(current, scope)
              for (const key of [
                'date_field',
                'date_from',
                'date_to',
                'page',
              ]) {
                next.delete(key)
              }
              if (status) {
                next.set('status', status)
              } else {
                next.delete('status')
              }
              return next
            },
            { replace: true }
          )
        }}
        activeFilterCount={
          [
            query.scope !== DEFAULT_QUERY.scope,
            query.date_from || query.date_to,
          ].filter(Boolean).length
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected ? `已选择 ${selected.order_no}` : ''}
        >
          <SelectionClearAction
            selectedCount={selected ? 1 : 0}
            selectionLabel="生产订单"
            onClear={() => {
              setSelected(null)
              setAggregate(null)
            }}
          />
          <BusinessActionTooltip
            disabled={!selected || detailLoading}
            disabledReason={
              detailLoading ? '生产订单资料加载中' : '请先选择一张生产订单'
            }
          >
            <Button
              data-business-action-key="view"
              data-business-action-role="view"
              disabled={!selected || detailLoading}
              icon={<EyeOutlined />}
              onClick={() => loadDetail(selected, 'view')}
            >
              查看
            </Button>
          </BusinessActionTooltip>
          {canUpdate ? (
            <BusinessActionTooltip
              visible={
                !selected || selected.status === PRODUCTION_ORDER_STATUS.DRAFT
              }
              disabled={
                !selected ||
                selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
                detailLoading
              }
              disabledReason={
                !selected
                  ? '请先选择一张生产订单'
                  : selected.status !== PRODUCTION_ORDER_STATUS.DRAFT
                    ? '只有生产订单草稿可以编辑'
                    : detailLoading
                      ? '生产订单资料加载完成后可编辑'
                      : ''
              }
            >
              <Button
                data-business-action-key="edit"
                data-business-action-role="edit"
                disabled={
                  !selected ||
                  selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
                  detailLoading
                }
                icon={<EditOutlined />}
                onClick={() => loadDetail(selected, 'edit')}
              >
                编辑
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canCreateCompletion ? (
            <BusinessActionTooltip
              visible={
                !selected ||
                [
                  PRODUCTION_ORDER_STATUS.DRAFT,
                  PRODUCTION_ORDER_STATUS.RELEASED,
                  PRODUCTION_ORDER_STATUS.CLOSED,
                ].includes(selected.status)
              }
              disabled={
                !selected ||
                ![
                  PRODUCTION_ORDER_STATUS.RELEASED,
                  PRODUCTION_ORDER_STATUS.CLOSED,
                ].includes(selected.status) ||
                detailLoading ||
                completionLoading
              }
              disabledReason={
                !selected
                  ? '请先选择一张生产订单'
                  : ![
                        PRODUCTION_ORDER_STATUS.RELEASED,
                        PRODUCTION_ORDER_STATUS.CLOSED,
                      ].includes(selected.status)
                    ? '生产订单发布后可登记成品收仓'
                    : detailLoading || completionLoading
                      ? '当前资料处理完成后可登记成品收仓'
                      : ''
              }
            >
              <Button
                data-business-action-key="completion"
                data-business-action-role="primary"
                type={
                  selected?.status === PRODUCTION_ORDER_STATUS.DRAFT
                    ? 'default'
                    : 'primary'
                }
                disabled={
                  !selected ||
                  ![
                    PRODUCTION_ORDER_STATUS.RELEASED,
                    PRODUCTION_ORDER_STATUS.CLOSED,
                  ].includes(selected.status) ||
                  detailLoading ||
                  completionLoading
                }
                onClick={() => openProductionCompletion()}
              >
                {selected?.status === PRODUCTION_ORDER_STATUS.CLOSED
                  ? '登记返工成品收仓'
                  : '登记成品收仓'}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {productionRouteActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={productionRouteActionAvailability.disabled}
              disabledReason={productionRouteActionAvailability.disabledReason}
            >
              <Button
                data-business-action-key="route-execution"
                data-business-action-role="action"
                data-business-action-group={
                  productionRouteReadOnly ? 'query' : 'business'
                }
                disabled={productionRouteActionAvailability.disabled}
                onClick={() => setProductionRouteOpen(true)}
              >
                {productionRouteReadOnly
                  ? '查看工序'
                  : selected?.status === PRODUCTION_ORDER_STATUS.CLOSED
                    ? '返工工序办理'
                    : '工序办理'}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {productionReworkProgressAvailability.visible ? (
            <BusinessActionTooltip
              disabled={productionReworkProgressAvailability.disabled}
              disabledReason={
                productionReworkProgressAvailability.disabledReason
              }
            >
              <Button
                data-business-action-key="rework-progress"
                data-business-action-role="related"
                disabled={productionReworkProgressAvailability.disabled}
                loading={reworkProgress.loading}
                onClick={reworkProgress.open}
              >
                查看返工进度
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canReadProductionFacts ? (
            <BusinessActionTooltip
              disabled={!selected || detailLoading}
              disabledReason={
                detailLoading ? '生产订单资料加载中' : '请先选择一张生产订单'
              }
            >
              <Button
                data-business-action-key="production-records"
                data-business-action-role="related"
                disabled={!selected || detailLoading}
                onClick={() => viewProductionFacts(selected)}
              >
                查看生产记录
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {productionSchedulingActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={productionSchedulingActionAvailability.disabled}
              disabledReason={
                productionSchedulingActionAvailability.disabledReason
              }
            >
              <Button
                data-business-action-key="production-scheduling"
                data-business-action-role="action"
                data-business-action-group="collaboration"
                disabled={productionSchedulingActionAvailability.disabled}
                onClick={() => openProductionScheduling(selected)}
              >
                排产确认
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {renderReleaseAction()}
          {canUpdate ? (
            <BusinessActionTooltip
              visible={
                !selected ||
                [
                  PRODUCTION_ORDER_STATUS.DRAFT,
                  PRODUCTION_ORDER_STATUS.RELEASED,
                ].includes(selected.status)
              }
              disabled={
                !selected ||
                selected.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
                !aggregate ||
                mutationLoading
              }
              disabledReason={
                !selected
                  ? '请先选择一张生产订单'
                  : selected.status !== PRODUCTION_ORDER_STATUS.RELEASED
                    ? '只有已发布生产订单可以关闭'
                    : !aggregate
                      ? '生产订单资料加载完成后可关闭'
                      : mutationLoading
                        ? '当前操作完成后可关闭'
                        : ''
              }
            >
              <Button
                data-business-action-key="close"
                data-business-action-role="secondary"
                data-business-action-group="lifecycle"
                className="erp-business-module-status-action"
                disabled={
                  !selected ||
                  selected.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
                  !aggregate ||
                  mutationLoading
                }
                onClick={() => setReasonAction('close')}
              >
                关闭
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate ? (
            <BusinessActionTooltip
              visible={
                !selected ||
                [
                  PRODUCTION_ORDER_STATUS.DRAFT,
                  PRODUCTION_ORDER_STATUS.RELEASED,
                ].includes(selected.status)
              }
              disabled={
                !selected ||
                ![
                  PRODUCTION_ORDER_STATUS.DRAFT,
                  PRODUCTION_ORDER_STATUS.RELEASED,
                ].includes(selected.status) ||
                !aggregate ||
                mutationLoading
              }
              disabledReason={
                !selected
                  ? '请先选择一张生产订单'
                  : ![
                        PRODUCTION_ORDER_STATUS.DRAFT,
                        PRODUCTION_ORDER_STATUS.RELEASED,
                      ].includes(selected.status)
                    ? '当前生产订单状态不能取消'
                    : !aggregate
                      ? '生产订单资料加载完成后可取消'
                      : mutationLoading
                        ? '当前操作完成后可取消'
                        : ''
              }
            >
              <Button
                data-business-action-key="cancel"
                data-business-action-role="danger"
                danger
                className="erp-business-module-status-action"
                disabled={
                  !selected ||
                  ![
                    PRODUCTION_ORDER_STATUS.DRAFT,
                    PRODUCTION_ORDER_STATUS.RELEASED,
                  ].includes(selected.status) ||
                  !aggregate ||
                  mutationLoading
                }
                onClick={() => setReasonAction('cancel')}
              >
                取消订单
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canReadProductionWip && canReadProductionFacts ? (
            <Button
              size="small"
              data-business-action-group="query"
              disabled={!selected}
              onClick={() => viewProductionProcess()}
            >
              查看生产执行
            </Button>
          ) : null}
          <BusinessTaskActions
            sourceType="production_order"
            record={selected}
            adminProfile={adminProfile}
            disabled={mutationLoading || detailLoading}
          />
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={sortedColumns}
        taskDetailColumns={taskDetailColumns}
        dataSource={orders}
        onChange={handleTableChange}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_, rows) => {
            if (rows[0]) selectRecord(rows[0])
            else {
              setSelected(null)
              setAggregate(null)
            }
          },
        }}
        onRow={(record) => ({
          onClick: () => selectRecord(record),
        })}
        onOpenRecord={(record) =>
          loadDetail(
            record,
            canUpdate && record.status === PRODUCTION_ORDER_STATUS.DRAFT
              ? 'edit'
              : 'view'
          )
        }
        pagination={createBusinessTablePagination({
          pagination: {
            current: displayedQuery.page,
            pageSize: displayedQuery.page_size,
          },
          total,
          onChange: (page, pageSize) =>
            writeQuery({ page, page_size: pageSize }),
        })}
        emptyDescription={
          canCreate ? '暂无生产订单，可新建生产计划单' : '暂无可查看的生产订单'
        }
      />
      {columnOrderModal}

      <ProductionOrderEditor
        form={form}
        open={Boolean(formMode)}
        mode={formMode}
        loading={mutationLoading}
        optionsByType={optionsByType}
        referenceAccess={productionReferenceAccess}
        order={aggregate?.order}
        materialRequirementsState={aggregate?.materialRequirementsState}
        materialRequirements={aggregate?.materialRequirements}
        canCreateMaterialIssue={
          canCreateMaterialIssue && canReadProductionFacts
        }
        canRequestOverIssue={
          canReadProductionPlan && canSubmitProductionException
        }
        materialIssueLoading={materialIssueLoading}
        onCreateMaterialIssue={openProductionMaterialIssue}
        onRequestOverIssue={openProductionOverIssue}
        onCancel={() => {
          setFormMode(null)
          setFormValues(null)
        }}
        onSubmit={submitDraft}
        savedRecordActions={
          outletContext?.taskBusiness &&
          !outletContext.taskBusiness.readOnly &&
          outletContext.taskBusiness.contract?.actionKeys.includes('release') &&
          selected?.status === PRODUCTION_ORDER_STATUS.DRAFT
            ? renderReleaseAction
            : undefined
        }
      />

      <ProductionCompletionModal
        open={completionOpen}
        initialValues={completionContext.initialValues}
        order={completionContext.order}
        items={completionContext.items}
        blockedItems={completionContext.blockedItems}
        facts={completionContext.facts}
        wipAggregate={completionContext.wipAggregate}
        warehouseOptions={completionContext.warehouseOptions}
        lots={completionContext.lots}
        loading={completionLoading}
        onCancel={closeProductionCompletion}
        onSubmit={submitProductionCompletion}
      />

      <ProductionReworkProgressModal
        open={Boolean(reworkProgress.context)}
        order={reworkProgress.context?.order}
        aggregate={reworkProgress.context?.aggregate}
        facts={reworkProgress.context?.facts}
        loading={reworkProgress.loading}
        onCancel={reworkProgress.close}
        onContinue={() => {
          reworkProgress.close()
          setProductionRouteOpen(true)
        }}
      />

      <ProductionRouteExecutionModal
        open={productionRouteOpen}
        productionOrder={selected}
        canWarehousePackaging={canWarehousePackaging}
        canIssueCutting={canIssueCutting}
        canAssign={canAssignProductionWip}
        canExecute={canExecuteProductionWip}
        canReceiveReturn={canReceiveProductionReturn}
        canCreateCompletion={canCreateCompletion && canReadProductionFacts}
        completionLoading={completionLoading}
        onCreateCompletion={openProductionCompletion}
        initialBatchID={linkedWipBatchID}
        initialItemID={linkedProductionItemID}
        initialAction={searchParams.get('wip_action') || ''}
        onReturnToExecution={
          canReturnToExecution
            ? () =>
                navigate(
                  {
                    pathname: BUSINESS_ROUTE_PATHS.productionProgress,
                    search: processReturn.search,
                    hash: processReturn.hash || '',
                  },
                  { replace: true }
                )
            : undefined
        }
        canConfirmPackaging={canConfirmPackagingMaterial}
        canReadOutsourcingContracts={canReadOutsourcingContracts}
        onCancel={() => setProductionRouteOpen(false)}
        onChanged={() => {
          if (selected) selectRecord(selected)
        }}
      />

      <ProductionMaterialIssueModal
        open={materialIssueOpen}
        order={materialIssueContext.order}
        orderItem={materialIssueContext.orderItem}
        requirement={materialIssueContext.requirement}
        warehouseOptions={materialIssueContext.warehouseOptions}
        lots={materialIssueContext.lots}
        loading={materialIssueLoading}
        lotsLoading={materialIssueLotsLoading}
        onWarehouseChange={loadProductionMaterialIssueLots}
        onCancel={closeProductionMaterialIssue}
        onSubmit={submitProductionMaterialIssue}
      />

      <ProductionOverIssueRequestModal
        open={Boolean(overIssueRequirement)}
        order={aggregate?.order}
        requirement={overIssueRequirement}
        customerKey={activeCustomerKey}
        onClose={() => setOverIssueRequirement(null)}
        onChanged={() => {
          if (selected) selectRecord(selected)
        }}
      />

      <BusinessModal
        size="confirm"
        open={Boolean(reasonAction)}
        title={reasonAction === 'close' ? '关闭生产订单' : '取消生产订单'}
        okText={reasonAction === 'close' ? '确认关闭' : '确认取消'}
        cancelText="返回"
        confirmLoading={mutationLoading}
        maskClosable={!mutationLoading}
        onCancel={() => setReasonAction(null)}
        onOk={() => reasonForm.submit()}
      >
        <BusinessForm
          form={reasonForm}
          layout="vertical"
          onFinish={({ reason }) =>
            runLifecycle(reasonAction, String(reason || '').trim() || null)
          }
        >
          <Text type="secondary">
            {reasonAction === 'close'
              ? '若生产数量尚未全部完成，请填写短关闭原因；系统会按实际完成情况复核。'
              : '取消后不能恢复；已有生效生产记录的订单不能直接取消。'}
          </Text>
          <Form.Item
            name="reason"
            label={
              reasonAction === 'close'
                ? '短关闭原因（未完成时必填）'
                : '取消原因'
            }
            rules={
              reasonAction === 'cancel'
                ? [
                    {
                      required: true,
                      whitespace: true,
                      message: '请填写取消原因',
                    },
                  ]
                : []
            }
          >
            <Input.TextArea autoFocus rows={4} maxLength={255} showCount />
          </Form.Item>
        </BusinessForm>
      </BusinessModal>
    </BusinessPageLayout>
  )
}
