import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Form, Input, Modal, Select, Tag, Typography } from 'antd'
import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import ProductionCompletionModal from '../components/production-orders/ProductionCompletionModal.jsx'
import ProductionMaterialIssueModal from '../components/production-orders/ProductionMaterialIssueModal.jsx'
import ProductionOrderFormModal from '../components/production-orders/ProductionOrderFormModal.jsx'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import { listWarehouses } from '../api/masterDataOrderApi.mjs'
import {
  createProductionCompletionFromOrder,
  createProductionMaterialIssueFromOrder,
  listProductionOrderMaterialRequirements,
  listProductionFacts,
} from '../api/operationalFactApi.mjs'
import {
  cancelProductionOrder,
  closeProductionOrder,
  createProductionOrder,
  getProductionOrder,
  listProductionOrderReferenceOptions,
  listProductionOrders,
  releaseProductionOrder,
  saveProductionOrder,
} from '../api/productionOrderApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  hasActionPermission,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  buildProductionCompletionPayload,
  findProductionCompletionResult,
  validateProductionCompletionResult,
} from '../utils/productionCompletionAction.mjs'
import {
  buildProductionMaterialIssuePayload,
  filterProductionMaterialIssueLots,
  findProductionMaterialIssueResult,
  isProductionMaterialIssueEligible,
  validateProductionMaterialIssueResult,
} from '../utils/productionMaterialIssueAction.mjs'
import {
  createProductionOrderAttemptStore,
  dateInputToUnix,
  isProductionOrderResultUnknown,
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
  PRODUCTION_ORDER_STATUS,
  PRODUCTION_ORDER_STATUS_META,
  unixToDateInput,
} from '../utils/productionOrderModel.mjs'
import {
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  routeWithQuery,
  searchParamPositiveIntText,
} from '../utils/routeQuery.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../utils/sourceBusinessAction.mjs'

const { Text } = Typography
const EMPTY_COMPLETION_CONTEXT = Object.freeze({
  order: null,
  items: [],
  facts: [],
  warehouseOptions: [],
  lots: [],
})
const EMPTY_MATERIAL_ISSUE_CONTEXT = Object.freeze({
  order: null,
  orderItem: null,
  requirement: null,
  materialRequirementsState: '',
  requirements: [],
  facts: [],
  warehouseOptions: [],
  lots: [],
})
const DEFAULT_QUERY = Object.freeze({
  keyword: '',
  status: '',
  date_field: 'planned_start_at',
  date_from: '',
  date_to: '',
  sort_by: 'updated_at',
  sort_direction: 'desc',
  page: 1,
  page_size: 20,
})

function positiveQuery(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function queryFromSearchParams(params) {
  return {
    keyword: params.get('keyword') || '',
    status: params.get('status') || '',
    date_field: params.get('date_field') || DEFAULT_QUERY.date_field,
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    sort_by: params.get('sort_by') || DEFAULT_QUERY.sort_by,
    sort_direction:
      params.get('sort_direction') || DEFAULT_QUERY.sort_direction,
    page: positiveQuery(params.get('page'), 1),
    page_size: Math.min(200, positiveQuery(params.get('page_size'), 20)),
  }
}

function displayTime(value) {
  if (!value) return '-'
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

function productionOptionLabel(options, value, fallback) {
  if (!value) return '-'
  const matched = (Array.isArray(options) ? options : []).find(
    (option) => Number(option?.value) === Number(value)
  )
  return matched?.label || `${fallback}已关联`
}

function productionSnapshotLabel(values, fallback) {
  return (
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ') || fallback
  )
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
      note: String(item.note || '').trim() || null,
    })),
  }
}

export default function V1ProductionOrdersPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeProductionOrderID = searchParamPositiveIntText(
    searchParams,
    'production_order_id'
  )
  const [form] = Form.useForm()
  const [reasonForm] = Form.useForm()
  const [query, setQuery] = useState(() => queryFromSearchParams(searchParams))
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mutationLoading, setMutationLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [aggregate, setAggregate] = useState(null)
  const [formMode, setFormMode] = useState(null)
  const [formValues, setFormValues] = useState(null)
  const [reasonAction, setReasonAction] = useState(null)
  const [optionsByType, setOptionsByType] = useState({})
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionContext, setCompletionContext] = useState(
    EMPTY_COMPLETION_CONTEXT
  )
  const [materialIssueOpen, setMaterialIssueOpen] = useState(false)
  const [materialIssueLoading, setMaterialIssueLoading] = useState(false)
  const [materialIssueLotsLoading, setMaterialIssueLotsLoading] =
    useState(false)
  const [materialIssueContext, setMaterialIssueContext] = useState(
    EMPTY_MATERIAL_ISSUE_CONTEXT
  )
  const attemptsRef = useRef(createProductionOrderAttemptStore())
  const completionAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const materialIssueAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const inFlightRef = useRef(false)
  const completionInFlightRef = useRef(false)
  const materialIssueInFlightRef = useRef(false)
  const completionContextRequestRef = useRef(0)
  const materialIssueContextRequestRef = useRef(0)
  const selectedIDRef = useRef(0)
  const beginLatestRequest = useLatestRequestCoordinator()

  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''

  const canRead = hasActionPermission(adminProfile, 'pmc.plan.read')
  const canCreate = hasActionPermission(adminProfile, 'pmc.plan.create')
  const canUpdate = hasActionPermission(adminProfile, 'pmc.plan.update')
  const canCreateCompletion = hasActionPermission(
    adminProfile,
    'production.completion.create'
  )
  const canReadProductionFacts = hasActionPermission(
    adminProfile,
    'production.fact.read'
  )
  const canCreateMaterialIssue = hasActionPermission(
    adminProfile,
    'production.material_issue.create'
  )

  useEffect(() => {
    selectedIDRef.current = Number(selected?.id || 0)
  }, [selected?.id])

  const writeQuery = useCallback(
    (patch) => {
      const next = { ...query, ...patch }
      setQuery(next)
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(next)) {
        if (value !== '' && value !== null && value !== undefined) {
          params.set(key, String(value))
        }
      }
      setSearchParams(params, { replace: true })
    },
    [query, setSearchParams]
  )

  const loadOrders = useCallback(async () => {
    if (!canRead) return
    const request = beginLatestRequest('production-orders')
    setLoading(true)
    try {
      const routeSelectedID = Number(routeProductionOrderID || 0)
      const [data, routeAggregate] = await Promise.all([
        listProductionOrders(
          {
            keyword: query.keyword,
            status: query.status,
            date_field: query.date_field,
            date_from: dateInputToUnix(query.date_from),
            date_to: dateInputToUnix(query.date_to),
            sort_by: query.sort_by,
            sort_direction: query.sort_direction,
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
      const nextOrders = routeOrder
        ? [
            routeOrder,
            ...listedOrders.filter((item) => item.id !== routeOrder.id),
          ]
        : listedOrders
      setOrders(nextOrders)
      setTotal(
        data.total +
          (routeOrder && !listedOrders.some((item) => item.id === routeOrder.id)
            ? 1
            : 0)
      )
      if (routeSelectedID > 0) {
        setSelected(routeOrder)
        setAggregate(routeAggregate)
      }
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        message.error(getActionErrorMessage(error, '加载生产订单'))
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginLatestRequest, canRead, query, routeProductionOrderID])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!formMode || !formValues) return
    form.resetFields()
    form.setFieldsValue(formValues)
  }, [form, formMode, formValues])

  useEffect(() => {
    if (!reasonAction) return
    reasonForm.resetFields()
  }, [reasonAction, reasonForm])

  const loadHistoricalOptions = useCallback(async (items, options = {}) => {
    const definitions = [
      ['product', 'product_id'],
      ['product_sku', 'product_sku_id'],
      ['unit', 'unit_id'],
      ['sales_order_item', 'sales_order_item_id'],
      ['active_bom', 'bom_header_id'],
    ]
    const pairs = await Promise.all(
      definitions.map(async ([type, key]) => {
        const ids = optionIDs(items, key)
        if (ids.length === 0) return [type, []]
        const data = await listProductionOrderReferenceOptions(
          type,
          { selected_ids: ids },
          options
        )
        return [type, data.options]
      })
    )
    setOptionsByType(Object.fromEntries(pairs))
  }, [])

  const productionItemsPreview = useBusinessRowItemsPreview({
    records: orders,
    getItemTotal: (record) => record?.item_count,
    rowExpandable: (record) =>
      canRead && Number.isSafeInteger(record?.id) && record.id > 0,
    getRecordLabel: (record) => record?.order_no || '当前生产订单',
    loadPreview: async (record, { signal }) => {
      const nextAggregate = await getProductionOrder(record.id, { signal })
      return {
        items: nextAggregate.items,
        total: nextAggregate.items.length,
      }
    },
    getItemKey: (item) => item?.id,
    getItemLabel: (item, { index }) =>
      item?.line_no ? `第 ${item.line_no} 行` : `明细 ${index + 1}`,
    getItemSummary: (item) => `计划数量 ${item?.planned_quantity || '-'}`,
    getItemFields: (item, { view }) => [
      {
        key: 'product',
        label: '产品',
        value: productionSnapshotLabel(
          [item?.product_code_snapshot, item?.product_name_snapshot],
          productionOptionLabel(optionsByType.product, item?.product_id, '产品')
        ),
        wide: true,
      },
      {
        key: 'product_sku',
        label: '规格',
        value: productionSnapshotLabel(
          [item?.sku_code_snapshot],
          productionOptionLabel(
            optionsByType.product_sku,
            item?.product_sku_id,
            '规格'
          )
        ),
      },
      {
        key: 'unit',
        label: '单位',
        value:
          item?.unit_name_snapshot ||
          productionOptionLabel(optionsByType.unit, item?.unit_id, '单位'),
      },
      {
        key: 'quantity',
        label: '计划数量',
        value: item?.planned_quantity || '-',
      },
      {
        key: 'sales_order_item',
        label: '销售订单行',
        value: productionOptionLabel(
          optionsByType.sales_order_item,
          item?.sales_order_item_id,
          '销售订单行'
        ),
        wide: true,
      },
      {
        key: 'bom',
        label: 'BOM 版本',
        value:
          item?.bom_version_snapshot ||
          productionOptionLabel(
            optionsByType.active_bom,
            item?.bom_header_id,
            'BOM 版本'
          ),
      },
      ...(view === 'modal'
        ? [
            {
              key: 'note',
              label: '备注',
              value: item?.note || '-',
              wide: true,
            },
          ]
        : []),
    ],
    modalTitle: '生产订单完整明细',
  })

  const loadDetail = async (record, mode = 'view') => {
    setDetailLoading(true)
    try {
      const nextAggregate = await getProductionOrder(record.id)
      await loadHistoricalOptions(nextAggregate.items)
      productionItemsPreview.prime(nextAggregate.order, {
        items: nextAggregate.items,
        total: nextAggregate.items.length,
      })
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setFormValues(aggregateToForm(nextAggregate))
      setFormMode(mode)
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载生产订单详情'))
    } finally {
      setDetailLoading(false)
    }
  }

  const selectRecord = async (record) => {
    const request = beginLatestRequest('production-order-selection')
    setSelected(record)
    setAggregate(null)
    try {
      const nextAggregate = await getProductionOrder(record.id, {
        signal: request.signal,
      })
      if (request.isCurrent() && nextAggregate.order.id === record.id) {
        productionItemsPreview.prime(nextAggregate.order, {
          items: nextAggregate.items,
          total: nextAggregate.items.length,
        })
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
      }
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        message.error(getActionErrorMessage(error, '加载生产订单详情'))
      }
    } finally {
      request.finish()
    }
  }

  const viewProductionFacts = (order = selected) => {
    if (!order?.id) return
    navigate(
      routeWithQuery(V1_ROUTE_PATHS.productionProgress, {
        source_type: 'PRODUCTION_ORDER',
        source_id: order.id,
      })
    )
  }

  const refreshProductionSources = async (orderID) => {
    const request = beginLatestRequest('production-material-issue-refresh')
    try {
      const [nextAggregate, factData] = await Promise.all([
        getProductionOrder(orderID, { signal: request.signal }),
        listProductionFacts(
          {
            source_type: 'PRODUCTION_ORDER',
            source_id: orderID,
            limit: 500,
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
      productionItemsPreview.prime(nextAggregate.order, {
        items: nextAggregate.items,
        total: nextAggregate.items.length,
      })
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setCompletionContext((current) =>
        Number(current?.order?.id || 0) === orderID
          ? { ...current, facts }
          : current
      )
      setMaterialIssueContext((current) =>
        Number(current?.order?.id || 0) === orderID
          ? {
              ...current,
              order: nextAggregate.order,
              requirements: nextAggregate.materialRequirements,
              materialRequirementsState:
                nextAggregate.materialRequirementsState,
              facts,
            }
          : current
      )
      return { aggregate: nextAggregate, facts }
    } finally {
      request.finish()
    }
  }

  const openProductionMaterialIssue = async (requirement) => {
    const orderID = Number(aggregate?.order?.id || selected?.id || 0)
    if (!canCreateMaterialIssue || !canReadProductionFacts) {
      message.warning('当前账号不能登记生产领料')
      return
    }
    if (
      !isProductionMaterialIssueEligible(
        aggregate?.order,
        aggregate?.materialRequirementsState,
        requirement
      )
    ) {
      message.warning('当前物料需求尚不能领料，请刷新后核对')
      return
    }

    const requestID = materialIssueContextRequestRef.current + 1
    materialIssueContextRequestRef.current = requestID
    const request = beginLatestRequest('production-material-issue-context')
    setMaterialIssueLoading(true)
    try {
      const [nextAggregate, requirements, factData, warehouseData] =
        await Promise.all([
          getProductionOrder(orderID, { signal: request.signal }),
          listProductionOrderMaterialRequirements(
            {
              customer_key: activeCustomerKey || undefined,
              production_order_id: orderID,
            },
            { signal: request.signal }
          ),
          listProductionFacts(
            {
              source_type: 'PRODUCTION_ORDER',
              source_id: orderID,
              limit: 500,
            },
            { signal: request.signal }
          ),
          listWarehouses(
            { active_only: true, limit: 500 },
            { signal: request.signal }
          ),
        ])
      if (
        !request.isCurrent() ||
        materialIssueContextRequestRef.current !== requestID ||
        selectedIDRef.current !== orderID
      ) {
        return
      }
      if (
        nextAggregate.materialRequirementsState ===
        PRODUCTION_MATERIAL_REQUIREMENTS_STATE.NEEDS_REVIEW
      ) {
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
        message.warning('物料需求需要计划人员复核，暂不能领料')
        return
      }
      const freshRequirement = requirements.find(
        (item) => Number(item.id) === Number(requirement?.id)
      )
      if (
        !isProductionMaterialIssueEligible(
          nextAggregate.order,
          nextAggregate.materialRequirementsState,
          freshRequirement
        )
      ) {
        message.warning('物料需求或订单状态已变化，请刷新后重试')
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
        return
      }
      const orderItem = nextAggregate.items.find(
        (item) =>
          Number(item.id) === Number(freshRequirement.production_order_item_id)
      )
      if (!orderItem) {
        message.warning('生产明细已变化，请刷新后重试')
        return
      }
      const warehouseOptions = uniqueReferenceOptions(
        warehouseData?.warehouses,
        warehouseOptionFromRecord
      )
      const firstWarehouseID = Number(warehouseOptions[0]?.value || 0)
      const lotData = firstWarehouseID
        ? await listInventoryLots(
            {
              subject_type: 'MATERIAL',
              subject_id: freshRequirement.material_id,
              warehouse_id: firstWarehouseID,
              status: 'ACTIVE',
              limit: 500,
            },
            { signal: request.signal }
          )
        : { inventory_lots: [] }
      if (
        !request.isCurrent() ||
        materialIssueContextRequestRef.current !== requestID ||
        selectedIDRef.current !== orderID
      ) {
        return
      }
      setMaterialIssueContext({
        order: nextAggregate.order,
        orderItem,
        requirement: freshRequirement,
        materialRequirementsState: nextAggregate.materialRequirementsState,
        requirements,
        facts: Array.isArray(factData?.production_facts)
          ? factData.production_facts
          : [],
        warehouseOptions,
        lots: filterProductionMaterialIssueLots(
          freshRequirement,
          lotData?.inventory_lots
        ),
      })
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setFormMode(null)
      setFormValues(null)
      setMaterialIssueOpen(true)
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        message.error(getActionErrorMessage(error, '加载生产领料详情'))
      }
    } finally {
      if (
        request.isCurrent() &&
        materialIssueContextRequestRef.current === requestID
      ) {
        setMaterialIssueLoading(false)
      }
      request.finish()
    }
  }

  const loadProductionMaterialIssueLots = async (warehouseID) => {
    const orderID = Number(materialIssueContext?.order?.id || 0)
    const requirement = materialIssueContext?.requirement
    const requestID = materialIssueContextRequestRef.current
    if (
      !orderID ||
      !positiveQuery(warehouseID, 0) ||
      !requirement?.material_id
    ) {
      setMaterialIssueContext((current) => ({ ...current, lots: [] }))
      return
    }
    const request = beginLatestRequest('production-material-issue-lots')
    setMaterialIssueLotsLoading(true)
    try {
      const lotData = await listInventoryLots(
        {
          subject_type: 'MATERIAL',
          subject_id: requirement.material_id,
          warehouse_id: Number(warehouseID),
          status: 'ACTIVE',
          limit: 500,
        },
        { signal: request.signal }
      )
      if (
        request.isCurrent() &&
        materialIssueContextRequestRef.current === requestID &&
        selectedIDRef.current === orderID
      ) {
        setMaterialIssueContext((current) => ({
          ...current,
          lots: filterProductionMaterialIssueLots(
            current.requirement,
            lotData?.inventory_lots
          ),
        }))
      }
    } catch (error) {
      if (request.isCurrent() && !isRpcAbortError(error)) {
        message.error(getActionErrorMessage(error, '加载可用材料批次'))
      }
    } finally {
      if (
        request.isCurrent() &&
        materialIssueContextRequestRef.current === requestID
      ) {
        setMaterialIssueLotsLoading(false)
      }
      request.finish()
    }
  }

  const closeProductionMaterialIssue = () => {
    if (materialIssueInFlightRef.current) return
    materialIssueContextRequestRef.current += 1
    for (const key of [
      'production-material-issue-context',
      'production-material-issue-lots',
    ]) {
      const invalidation = beginLatestRequest(key)
      invalidation.finish()
    }
    setMaterialIssueOpen(false)
    setMaterialIssueLoading(false)
    setMaterialIssueLotsLoading(false)
    setMaterialIssueContext(EMPTY_MATERIAL_ISSUE_CONTEXT)
  }

  const submitProductionMaterialIssue = async (values) => {
    if (
      materialIssueInFlightRef.current ||
      !canCreateMaterialIssue ||
      !canReadProductionFacts ||
      !materialIssueContext.order ||
      !materialIssueContext.requirement
    ) {
      return
    }
    const { order, requirement, materialRequirementsState } =
      materialIssueContext
    let scope
    let attempt
    let params
    try {
      const payload = {
        ...buildProductionMaterialIssuePayload(
          values,
          order,
          materialRequirementsState,
          requirement
        ),
        customer_key: activeCustomerKey || undefined,
      }
      scope = `production-material-issue:${order.id}:${requirement.id}`
      attempt = materialIssueAttemptsRef.current.prepare(scope, payload)
      params = {
        ...attempt.params,
        fact_no: sourceBusinessActionNo(
          'PROD-MI',
          order.order_no,
          attempt.params.idempotency_key
        ),
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备生产领料记录'))
      return
    }

    let confirmedByReread = false
    materialIssueInFlightRef.current = true
    setMaterialIssueLoading(true)
    try {
      let result
      try {
        result = await createProductionMaterialIssueFromOrder(params)
        validateProductionMaterialIssueResult(result, params, requirement)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          materialIssueAttemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成生产领料记录'))
          return
        }
        try {
          const factData = await listProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: order.id,
            limit: 500,
          })
          result = findProductionMaterialIssueResult(
            factData?.production_facts,
            params,
            requirement
          )
        } catch {
          result = null
        }
        if (!result) {
          materialIssueAttemptsRef.current.settle(scope, attempt, error)
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
          return
        }
        confirmedByReread = true
      }

      materialIssueAttemptsRef.current.settle(scope, attempt, null)
      try {
        await refreshProductionSources(order.id)
      } catch (error) {
        message.warning(getActionErrorMessage(error, '刷新生产领料结果'))
      }
      materialIssueContextRequestRef.current += 1
      setMaterialIssueOpen(false)
      setMaterialIssueContext(EMPTY_MATERIAL_ISSUE_CONTEXT)
      message.success(
        confirmedByReread
          ? '已重新读取并确认领料草稿，请到生产记录核对并过账'
          : '领料记录草稿已生成，请到生产记录核对并过账'
      )
    } finally {
      materialIssueInFlightRef.current = false
      setMaterialIssueLoading(false)
    }
  }

  const openProductionCompletion = async () => {
    const orderID = Number(selected?.id || 0)
    if (!orderID || selected?.status !== PRODUCTION_ORDER_STATUS.RELEASED) {
      message.warning('请先选择已发布的生产订单')
      return
    }
    const requestID = completionContextRequestRef.current + 1
    completionContextRequestRef.current = requestID
    setCompletionLoading(true)
    try {
      const nextAggregate = await getProductionOrder(orderID)
      if (
        completionContextRequestRef.current !== requestID ||
        selectedIDRef.current !== orderID
      ) {
        return
      }
      if (nextAggregate?.order?.status !== PRODUCTION_ORDER_STATUS.RELEASED) {
        message.warning('生产订单状态已变化，请刷新后重试')
        await refreshAfterSuccess()
        return
      }
      const [factData, warehouseData, lotData] = await Promise.all([
        listProductionFacts({
          source_type: 'PRODUCTION_ORDER',
          source_id: orderID,
          limit: 500,
        }),
        listWarehouses({ active_only: true, limit: 500 }),
        listInventoryLots({ status: 'ACTIVE', limit: 500 }),
      ])
      if (
        completionContextRequestRef.current !== requestID ||
        selectedIDRef.current !== orderID
      ) {
        return
      }
      setCompletionContext({
        order: nextAggregate.order,
        items: Array.isArray(nextAggregate.items) ? nextAggregate.items : [],
        facts: Array.isArray(factData?.production_facts)
          ? factData.production_facts
          : [],
        warehouseOptions: uniqueReferenceOptions(
          warehouseData?.warehouses,
          warehouseOptionFromRecord
        ),
        lots: Array.isArray(lotData?.inventory_lots)
          ? lotData.inventory_lots
          : [],
      })
      setCompletionOpen(true)
    } catch (error) {
      if (completionContextRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载完工入库详情'))
      }
    } finally {
      if (completionContextRequestRef.current === requestID) {
        setCompletionLoading(false)
      }
    }
  }

  const closeProductionCompletion = () => {
    if (completionInFlightRef.current) return
    completionContextRequestRef.current += 1
    setCompletionOpen(false)
    setCompletionLoading(false)
    setCompletionContext(EMPTY_COMPLETION_CONTEXT)
  }

  const submitProductionCompletion = async (values) => {
    if (completionInFlightRef.current || !completionContext.order) return
    let payload
    try {
      payload = {
        ...buildProductionCompletionPayload(values, completionContext.order),
        customer_key: activeCustomerKey || undefined,
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '办理完工入库'))
      return
    }
    const orderItem = completionContext.items.find(
      (item) => Number(item?.id || 0) === payload.production_order_item_id
    )
    if (!orderItem) {
      message.error('生产明细已变化，请关闭后重新办理')
      return
    }
    const scope = `production-completion:${completionContext.order.id}:${payload.production_order_item_id}`
    const attempt = completionAttemptsRef.current.prepare(scope, payload)
    const params = {
      ...attempt.params,
      fact_no: sourceBusinessActionNo(
        'PROD-FG',
        completionContext.order.order_no,
        attempt.params.idempotency_key
      ),
    }
    completionInFlightRef.current = true
    setCompletionLoading(true)
    try {
      let result
      let confirmedByReread = false
      try {
        result = await createProductionCompletionFromOrder(params)
        validateProductionCompletionResult(result, params, orderItem)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          completionAttemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成完工记录草稿'))
          return
        }
        try {
          const factData = await listProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: completionContext.order.id,
            limit: 500,
          })
          result = findProductionCompletionResult(
            factData?.production_facts,
            params,
            orderItem
          )
        } catch {
          result = null
        }
        if (!result) {
          completionAttemptsRef.current.settle(scope, attempt, error)
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
          return
        }
        confirmedByReread = true
      }
      completionAttemptsRef.current.settle(scope, attempt, null)
      try {
        await refreshProductionSources(completionContext.order.id)
      } catch (error) {
        message.warning(getActionErrorMessage(error, '刷新完工入库结果'))
      }
      completionContextRequestRef.current += 1
      setCompletionOpen(false)
      setCompletionContext(EMPTY_COMPLETION_CONTEXT)
      message.success(
        confirmedByReread
          ? '已重新读取并确认完工草稿，请到生产记录核对并过账'
          : '完工记录草稿已生成，请到生产记录核对并过账'
      )
    } finally {
      completionInFlightRef.current = false
      setCompletionLoading(false)
    }
  }

  const beginCreate = () => {
    setAggregate(null)
    setOptionsByType({})
    setFormValues({
      order_no: '',
      planned_start_at: '',
      planned_end_at: '',
      note: '',
      items: [{ line_no: 1, planned_quantity: '1' }],
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

  const runMutation = async (scope, payload, execute, successText) => {
    if (inFlightRef.current) return false
    const attempt = attemptsRef.current.prepare(scope, payload)
    inFlightRef.current = true
    setMutationLoading(true)
    try {
      const result = await execute(attempt.params)
      attemptsRef.current.finish(scope, attempt)
      message.success(successText)
      productionItemsPreview.prime(result.order, {
        items: result.items,
        total: result.items.length,
      })
      setAggregate(result)
      setSelected(result.order)
      return true
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
    setFormMode(null)
    setFormValues(null)
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
      release: [releaseProductionOrder, '生产订单发布成功'],
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

  const columns = useMemo(
    () => [
      { title: '生产单号', dataIndex: 'order_no', width: 180 },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (value) => (
          <Tag color={PRODUCTION_ORDER_STATUS_META[value]?.color}>
            {PRODUCTION_ORDER_STATUS_META[value]?.label || '待核对'}
          </Tag>
        ),
      },
      {
        title: '计划开始',
        dataIndex: 'planned_start_at',
        width: 150,
        render: displayTime,
      },
      {
        title: '计划结束',
        dataIndex: 'planned_end_at',
        width: 150,
        render: displayTime,
      },
      {
        title: '备注',
        dataIndex: 'note',
        width: 260,
        render: (value) => value || '-',
      },
    ],
    []
  )

  if (!canRead) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="生产订单"
          description="当前账号没有查看生产订单的权限。"
        />
      </BusinessPageLayout>
    )
  }

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        title="生产订单"
        description="维护生产计划单；已发布订单可按已确认需求登记领料或完工草稿，核对、过账及库存结果仍在生产记录中办理。"
        stats={[{ key: 'total', label: '符合条件', value: total }]}
      />
      <BusinessOperationPanel
        filters={
          <>
            <SearchInput
              value={query.keyword}
              placeholder="搜索生产单号或备注"
              onChange={(event) =>
                writeQuery({ keyword: event.target.value, page: 1 })
              }
            />
            <Select
              value={query.status || undefined}
              allowClear
              placeholder="全部状态"
              style={{ width: 150 }}
              options={Object.entries(PRODUCTION_ORDER_STATUS_META).map(
                ([value, meta]) => ({ value, label: meta.label })
              )}
              onChange={(value) => writeQuery({ status: value || '', page: 1 })}
            />
            <DateRangeFilter
              options={[
                { value: 'planned_start_at', label: '计划开始' },
                { value: 'planned_end_at', label: '计划结束' },
              ]}
              value={query.date_field}
              startValue={query.date_from}
              endValue={query.date_to}
              onTypeChange={(value) =>
                writeQuery({ date_field: value, page: 1 })
              }
              onStartChange={(value) =>
                writeQuery({ date_from: value, page: 1 })
              }
              onEndChange={(value) => writeQuery({ date_to: value, page: 1 })}
            />
          </>
        }
        actions={
          <Button icon={<ReloadOutlined />} onClick={loadOrders}>
            刷新当前页
          </Button>
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
          setQuery(DEFAULT_QUERY)
          setSearchParams(new URLSearchParams(), { replace: true })
        }}
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected ? `已选择 ${selected.order_no}` : ''}
        >
          <Button
            disabled={!selected || detailLoading}
            icon={<EyeOutlined />}
            onClick={() => loadDetail(selected, 'view')}
          >
            查看
          </Button>
          <Button
            disabled={
              !selected ||
              !canUpdate ||
              selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
              detailLoading
            }
            icon={<EditOutlined />}
            onClick={() => loadDetail(selected, 'edit')}
          >
            编辑
          </Button>
          {canCreateCompletion ? (
            <Button
              type="primary"
              disabled={
                !selected ||
                selected.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
                detailLoading ||
                completionLoading
              }
              onClick={openProductionCompletion}
            >
              登记完工入库
            </Button>
          ) : null}
          {canReadProductionFacts ? (
            <Button
              disabled={!selected || detailLoading}
              onClick={() => viewProductionFacts(selected)}
            >
              查看生产记录
            </Button>
          ) : null}
          <Button
            disabled={
              !aggregate ||
              !canUpdate ||
              aggregate.order.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
              mutationLoading
            }
            onClick={() =>
              modal.confirm({
                title: '确认发布生产订单？',
                content: '发布后计划明细将不能直接修改。',
                okText: '确认发布',
                onOk: () => runLifecycle('release'),
              })
            }
          >
            发布
          </Button>
          <Button
            disabled={
              !aggregate ||
              !canUpdate ||
              aggregate.order.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
              mutationLoading
            }
            onClick={() => setReasonAction('close')}
          >
            关闭
          </Button>
          <Button
            danger
            disabled={
              !aggregate ||
              !canUpdate ||
              ![
                PRODUCTION_ORDER_STATUS.DRAFT,
                PRODUCTION_ORDER_STATUS.RELEASED,
              ].includes(aggregate.order.status) ||
              mutationLoading
            }
            onClick={() => setReasonAction('cancel')}
          >
            取消订单
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={orders}
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
          onDoubleClick: () =>
            loadDetail(
              record,
              canUpdate && record.status === PRODUCTION_ORDER_STATUS.DRAFT
                ? 'edit'
                : 'view'
            ),
        })}
        pagination={{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          onChange: (page, pageSize) =>
            writeQuery({ page, page_size: pageSize }),
        }}
        expandable={productionItemsPreview.expandable}
        emptyDescription={
          canCreate ? '暂无生产订单，可新建生产计划单' : '暂无可查看的生产订单'
        }
      />
      {productionItemsPreview.modal}

      <ProductionOrderFormModal
        form={form}
        open={Boolean(formMode)}
        mode={formMode}
        loading={mutationLoading}
        optionsByType={optionsByType}
        order={aggregate?.order}
        materialRequirementsState={aggregate?.materialRequirementsState}
        materialRequirements={aggregate?.materialRequirements}
        canCreateMaterialIssue={
          canCreateMaterialIssue && canReadProductionFacts
        }
        materialIssueLoading={materialIssueLoading}
        onCreateMaterialIssue={openProductionMaterialIssue}
        onCancel={() => {
          setFormMode(null)
          setFormValues(null)
        }}
        onSubmit={submitDraft}
      />

      <ProductionCompletionModal
        open={completionOpen}
        order={completionContext.order}
        items={completionContext.items}
        facts={completionContext.facts}
        warehouseOptions={completionContext.warehouseOptions}
        lots={completionContext.lots}
        loading={completionLoading}
        onCancel={closeProductionCompletion}
        onSubmit={submitProductionCompletion}
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

      <Modal
        open={Boolean(reasonAction)}
        title={reasonAction === 'close' ? '关闭生产订单' : '取消生产订单'}
        okText={reasonAction === 'close' ? '确认关闭' : '确认取消'}
        cancelText="返回"
        confirmLoading={mutationLoading}
        onCancel={() => setReasonAction(null)}
        onOk={() => reasonForm.submit()}
      >
        <Form
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
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
