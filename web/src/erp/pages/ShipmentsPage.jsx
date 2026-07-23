import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Popconfirm, Tag, Typography } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  cancelShipment,
  createInvoiceFromShipment,
  createReceivableFromShipment,
  createShipmentWithItems,
  getShipment,
  listShipmentSourceCandidates,
  listShipments,
  shipShipment,
} from '../api/operationalFactApi.mjs'
import { submitShipmentFinanceApprovalProcess } from '../api/customerConfigApi.mjs'
import {
  listAllCustomers,
  listAllSalesOrders,
  listAllUnits,
  listProductSKUs,
  listProducts,
} from '../api/masterDataOrderApi.mjs'
import { listAllInventoryLots } from '../api/inventoryApi.mjs'
import {
  createFinishedGoodsQualityInspectionDraft,
  listAllFinishedGoodsQualityInspections,
} from '../api/qualityApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import ShipmentBusinessModal, {
  salesOrderCustomerText,
  sourceLineProductText,
} from '../components/shipments/ShipmentBusinessModal.jsx'
import ShipmentFinanceSourceModal from '../components/shipments/ShipmentFinanceSourceModal.jsx'
import ShipmentQualityInspectionModal from '../components/quality-inspections/ShipmentQualityInspectionModal.jsx'
import {
  buildShipmentColumns,
  SHIPMENT_DATE_FILTER_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
  SHIPMENTS_MODULE_KEY,
} from '../components/shipments/shipmentColumns.jsx'
import {
  compactParams,
  buildSequentialDraftCode,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  buildShipmentItemParams,
  createBlankShipmentItem,
  createShipmentItemFromSalesOrderItem,
  formatQuantity,
  isBlankShipmentItem,
  positiveInt,
} from '../utils/businessLineItems.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
  resolveExactRecordPage,
} from '../utils/businessPagination.mjs'
import {
  customerOption,
  inventoryLotOption,
  productOption,
  productSKUOption,
  referenceLabel,
  salesOrderItemOption,
  salesOrderOption,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import { canConfirmFinanceFact } from '../utils/financeFactPermissions.mjs'
import {
  searchParamPositiveInt,
  searchParamText,
} from '../utils/routeQuery.mjs'
import { businessRecordInventoryRouteFor } from '../utils/businessSourceNavigation.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  calculateShipmentLineNetWeightG,
  hasFinalShipmentWeight,
  listAllShipmentWeightReferenceRecords,
  normalizeShipmentQuantity,
  resolveShipmentSubmittedTotalNetWeight,
  resolveShipmentWeightPreview,
  shipmentWeightReferenceOption,
} from '../utils/shipmentWeight.mjs'
import {
  buildShipmentFinanceSourcePayload,
  shipmentFinanceSourceActionConfig,
} from '../utils/shipmentFinanceSourceAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../utils/sourceBusinessAction.mjs'
import {
  buildShipmentQualityInspectionPayload,
  buildShipmentQualityInspectionSources,
  requireMatchingShipmentQualityInspectionDraft,
} from '../utils/shipmentQualityInspectionSource.mjs'
import {
  SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE,
  normalizeShipmentSourceCandidate,
  shipmentSourceCandidateListParams,
  shipmentSourceOrderFromCandidate,
} from '../utils/shipmentSourceCandidate.mjs'

const { Text } = Typography

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}`
}

function buildShipmentParams(
  values = {},
  { products = [], productSKUs = [] } = {}
) {
  const items = Array.isArray(values.items) ? values.items : []
  const weightPreview = resolveShipmentWeightPreview({
    items,
    products,
    productSKUs,
  })
  return compactParams({
    shipment_no: trimOptional(values.shipment_no),
    sales_order_id: positiveInt(values.sales_order_id),
    customer_id: positiveInt(values.customer_id),
    customer_snapshot: trimOptional(values.customer_snapshot),
    idempotency_key: trimOptional(values.idempotency_key),
    planned_ship_at: trimOptional(values.planned_ship_at),
    total_net_weight_g: resolveShipmentSubmittedTotalNetWeight({
      preview: weightPreview,
      manualValue: values.total_net_weight_g,
      manualItemsSignature: values.total_net_weight_items_signature,
      items,
    }),
    note: trimOptional(values.note),
  })
}

function buildShipmentWithItemsParams(values = {}, references = {}) {
  return {
    ...buildShipmentParams(values, references),
    items: (values.items || []).map((item) => ({
      ...buildShipmentItemParams(item),
      quantity: normalizeShipmentQuantity(item?.quantity),
    })),
  }
}

function shipmentFormValues(shipment = {}) {
  const plannedShipAt = Number(shipment.planned_ship_at || 0)
  return {
    shipment_no: shipment.shipment_no || '',
    sales_order_id: shipment.sales_order_id,
    customer_id: shipment.customer_id,
    customer_snapshot: shipment.customer_snapshot || '',
    idempotency_key: shipment.idempotency_key || '',
    planned_ship_at:
      plannedShipAt > 0
        ? new Date(plannedShipAt * 1000).toISOString().slice(0, 10)
        : '',
    total_net_weight_g: shipment.total_net_weight_g,
    note: shipment.note || '',
  }
}

export default function ShipmentsPage() {
  const navigate = useNavigate()
  const outletContext = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('planned_ship_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [financeSourceAction, setFinanceSourceAction] = useState(null)
  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)
  const [qualitySourceContext, setQualitySourceContext] = useState(null)
  const [qualitySourceLoading, setQualitySourceLoading] = useState(false)
  const [shipmentModal, setShipmentModal] = useState(null)
  const [salesOrderSources, setSalesOrderSources] = useState([])
  const [salesOrderSourceItems, setSalesOrderSourceItems] = useState([])
  const [shipmentSourceRows, setShipmentSourceRows] = useState([])
  const [salesOrderSourceTotal, setSalesOrderSourceTotal] = useState(0)
  const [salesOrderSourceCurrent, setSalesOrderSourceCurrent] = useState(1)
  const [salesOrderSourceLoadFailed, setSalesOrderSourceLoadFailed] =
    useState(false)
  const [customers, setCustomers] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [salesOrderItems, setSalesOrderItems] = useState([])
  const [salesOrders, setSalesOrders] = useState([])
  const [units, setUnits] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [salesOrderImportOpen, setSalesOrderImportOpen] = useState(false)
  const [shipmentForm] = Form.useForm()
  const shipmentAttachmentRef = useRef(null)
  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const financeSourceInFlightRef = useRef(false)
  const qualitySourceInFlightRef = useRef(false)
  const salesOrderSourceQueryRef = useRef({ keyword: '', page: 1 })
  const selectedSalesOrderID = Form.useWatch('sales_order_id', shipmentForm)
  const routeSalesOrderID = searchParamPositiveInt(
    searchParams,
    'sales_order_id'
  )
  const routeShipmentID =
    searchParamPositiveInt(searchParams, 'shipment_id') ||
    (searchParamText(searchParams, 'source_type').toUpperCase() === 'SHIPMENT'
      ? searchParamPositiveInt(searchParams, 'source_id')
      : '')
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const resolvedRouteKeyword =
    routeShipmentID && Number(selectedRow?.id || 0) === Number(routeShipmentID)
      ? String(selectedRow?.shipment_no || '').trim()
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

  const beginLatestRequest = useLatestRequestCoordinator()

  const canRead = hasActionPermission(adminProfile, 'shipment.read')
  const canCreate = hasActionPermission(adminProfile, 'shipment.create')
  const canSubmitShipmentRelease = canRead && canCreate
  const canShip = hasActionPermission(adminProfile, 'shipment.ship')
  const canCancel = hasActionPermission(adminProfile, 'shipment.cancel')
  const canCreateReceivable = canConfirmFinanceFact(adminProfile, 'RECEIVABLE')
  const canCreateInvoice = canConfirmFinanceFact(adminProfile, 'INVOICE')
  const canViewQualityInspections = hasActionPermission(
    adminProfile,
    'quality.inspection.read'
  )
  const canCreateFinishedGoodsQualityInspection =
    canRead &&
    canViewQualityInspections &&
    hasActionPermission(adminProfile, 'quality.inspection.create')
  const canViewSalesOrders = hasActionPermission(
    adminProfile,
    'sales_order.read'
  )
  const canViewSalesOrderItems = hasActionPermission(
    adminProfile,
    'sales_order_item.read'
  )
  const canImportSalesOrderSource =
    canCreate && canViewSalesOrders && canViewSalesOrderItems
  const canViewInventory = hasActionPermission(
    adminProfile,
    'warehouse.inventory.read'
  )
  const canViewReceivables = hasActionPermission(
    adminProfile,
    'finance.receivable.read'
  )
  const canViewInvoices = hasActionPermission(
    adminProfile,
    'finance.invoice.read'
  )
  const relatedMenuItems = useMemo(() => {
    if (!selectedRow?.id) return []
    const items = []
    if (
      canViewSalesOrders &&
      selectedRow.sales_order_id &&
      canOpenRelatedPath(V1_ROUTE_PATHS.salesOrders)
    ) {
      items.push({ key: 'sales-order', label: '来源销售订单' })
    }
    if (canViewInventory && canOpenRelatedPath(V1_ROUTE_PATHS.inventory)) {
      items.push({ key: 'inventory', label: '库存记录' })
    }
    if (canViewReceivables && canOpenRelatedPath(V1_ROUTE_PATHS.receivables)) {
      items.push({ key: 'receivables', label: '应收记录' })
    }
    if (canViewInvoices && canOpenRelatedPath(V1_ROUTE_PATHS.invoices)) {
      items.push({ key: 'invoices', label: '开票记录' })
    }
    if (
      canViewQualityInspections &&
      canOpenRelatedPath(V1_ROUTE_PATHS.qualityInspections)
    ) {
      items.push({ key: 'quality-inspections', label: '出货前检验' })
    }
    return items
  }, [
    canViewInventory,
    canViewInvoices,
    canViewQualityInspections,
    canViewReceivables,
    canViewSalesOrders,
    canOpenRelatedPath,
    selectedRow,
  ])
  const openRelatedRecord = useCallback(
    ({ key }) => {
      if (!selectedRow?.id) return
      const paths = {
        'sales-order': relatedDocumentRoute(
          V1_ROUTE_PATHS.salesOrders,
          { sales_order_id: selectedRow.sales_order_id },
          {
            keyword: selectedRow.sales_order_no,
            source: 'shipment',
            fields: ['sales_order_no'],
          }
        ),
        inventory: businessRecordInventoryRouteFor(
          'shipments',
          selectedRow.id,
          { keyword: selectedRow.shipment_no, source: 'shipment' }
        ),
        receivables: relatedDocumentRoute(
          V1_ROUTE_PATHS.receivables,
          { source_type: 'SHIPMENT', source_id: selectedRow.id },
          {
            keyword: selectedRow.shipment_no,
            source: 'shipment',
            fields: ['source_no'],
          }
        ),
        invoices: relatedDocumentRoute(
          V1_ROUTE_PATHS.invoices,
          { source_type: 'SHIPMENT', source_id: selectedRow.id },
          {
            keyword: selectedRow.shipment_no,
            source: 'shipment',
            fields: ['source_no'],
          }
        ),
        'quality-inspections': relatedDocumentRoute(
          V1_ROUTE_PATHS.qualityInspections,
          {
            source_type: 'SHIPMENT',
            source_id: selectedRow.id,
          },
          {
            keyword: selectedRow.shipment_no,
            source: 'shipment',
            fields: ['source_no'],
          }
        ),
      }
      if (paths[key]) navigate(paths[key])
    },
    [navigate, selectedRow]
  )
  const customerOptions = useMemo(
    () => uniqueReferenceOptions(customers, customerOption),
    [customers]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const qualitySourceInventoryLots = useMemo(() => {
    const byID = new Map(
      [...inventoryLots, ...(qualitySourceContext?.inventoryLots || [])]
        .map((lot) => [Number(lot?.id || 0), lot])
        .filter(([lotID]) => Number.isSafeInteger(lotID) && lotID > 0)
    )
    return [...byID.values()]
  }, [inventoryLots, qualitySourceContext?.inventoryLots])
  const qualitySourceInventoryLotOptions = useMemo(
    () =>
      uniqueReferenceOptions(qualitySourceInventoryLots, inventoryLotOption),
    [qualitySourceInventoryLots]
  )
  const qualityInspectionSources = useMemo(
    () =>
      buildShipmentQualityInspectionSources({
        shipment: qualitySourceContext?.shipment,
        inventoryLots: qualitySourceInventoryLots,
        qualityInspections: qualitySourceContext?.qualityInspections,
      }),
    [
      qualitySourceContext?.qualityInspections,
      qualitySourceContext?.shipment,
      qualitySourceInventoryLots,
    ]
  )
  const productOptions = useMemo(
    () =>
      uniqueReferenceOptions(products, (product) =>
        shipmentWeightReferenceOption(product, productOption)
      ),
    [products]
  )
  const productSKUOptions = useMemo(
    () =>
      uniqueReferenceOptions(productSKUs, (sku) =>
        shipmentWeightReferenceOption(sku, productSKUOption)
      ),
    [productSKUs]
  )
  const salesOrderOptions = useMemo(
    () => uniqueReferenceOptions(salesOrders, salesOrderOption),
    [salesOrders]
  )
  const salesOrdersByID = useMemo(
    () =>
      new Map(
        salesOrders
          .map((order) => [Number(order?.id || 0), order])
          .filter(([orderID]) => Number.isFinite(orderID) && orderID > 0)
      ),
    [salesOrders]
  )
  const salesOrderItemOptions = useMemo(
    () => uniqueReferenceOptions(salesOrderItems, salesOrderItemOption),
    [salesOrderItems]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const warehouseOptions = useMemo(
    () =>
      uniqueReferenceOptions(
        [
          ...inventoryLots,
          ...rows.flatMap((shipment) =>
            Array.isArray(shipment?.items) ? shipment.items : []
          ),
        ],
        warehouseOptionFromRecord
      ),
    [inventoryLots, rows]
  )
  const shipmentItemsPreview = useBusinessRowItemsPreview({
    records: rows,
    getEmbeddedItems: (record) => record?.items,
    getItemTotal: (record) =>
      Array.isArray(record?.items) ? record.items.length : undefined,
    rowExpandable: (record) =>
      canRead && Number.isSafeInteger(record?.id) && record.id > 0,
    getRecordLabel: (record) => record?.shipment_no || '当前出货单',
    getItemKey: (item) => item?.id,
    getItemLabel: (_item, { index }) => `明细 ${index + 1}`,
    getItemSummary: (item) => `数量 ${formatQuantity(item?.quantity)}`,
    getItemFields: (item, { record, view }) => [
      {
        key: 'sales_order_item',
        label: '销售订单行',
        value: referenceLabel(
          salesOrderItemOptions,
          item?.sales_order_item_id,
          '销售订单行'
        ),
        wide: true,
      },
      {
        key: 'product',
        label: '产品',
        value: referenceLabel(productOptions, item?.product_id, '产品'),
      },
      {
        key: 'product_sku',
        label: 'SKU',
        value: referenceLabel(productSKUOptions, item?.product_sku_id, 'SKU'),
      },
      {
        key: 'warehouse',
        label: '仓库',
        value: referenceLabel(warehouseOptions, item?.warehouse_id, '仓库'),
      },
      {
        key: 'lot',
        label: '批次',
        value: referenceLabel(inventoryLotOptions, item?.lot_id, '批次'),
      },
      {
        key: 'unit',
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      { key: 'quantity', label: '数量', value: formatQuantity(item?.quantity) },
      ...(hasFinalShipmentWeight(record?.status)
        ? [
            {
              key: 'confirmed_unit_net_weight',
              label: '确认出货单重（克）',
              value: item?.unit_net_weight_g_snapshot
                ? `${item.unit_net_weight_g_snapshot} 克`
                : '-',
            },
            {
              key: 'line_net_weight',
              label: '行净重（克）',
              value:
                calculateShipmentLineNetWeightG(
                  item?.quantity,
                  item?.unit_net_weight_g_snapshot
                ) || '-',
            },
          ]
        : []),
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
    modalTitle: '出货单完整明细',
  })

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    setLoading(true)
    try {
      const routeSelectedID = Number(routeShipmentID || 0)
      const [data, routeShipment] = await Promise.all([
        listShipments(
          compactParams({
            status: statusFilter,
            keyword: trimOptional(
              linkedDocumentRequestKeyword({
                localKeyword: keyword,
                linkedKeyword,
                hasExactContext: Boolean(routeShipmentID || routeSalesOrderID),
              })
            ),
            customer_id: customerFilter || undefined,
            product_id: productFilter || undefined,
            warehouse_id: warehouseFilter || undefined,
            source_id: routeSalesOrderID || undefined,
            date_field: dateFilterField,
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
            ...getBusinessPaginationParams(pagination),
          }),
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getShipment({ id: routeSelectedID }, { signal: request.signal })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return
      }
      const listedRows = Array.isArray(data?.shipments) ? data.shipments : []
      const exactPage = resolveExactRecordPage({
        records: listedRows,
        exactRecord: routeShipment,
        hasExactContext: routeSelectedID > 0,
        total: Number(data?.total || 0),
      })
      const nextRows = exactPage.records
      setRows(nextRows)
      setSelectedRow((current) => {
        if (routeSelectedID > 0) {
          return routeShipment
        }
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(exactPage.total)
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载出货单'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    customerFilter,
    keyword,
    linkedKeyword,
    pagination,
    productFilter,
    routeSalesOrderID,
    routeShipmentID,
    statusFilter,
    warehouseFilter,
  ])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['sales_order_id', 'shipment_id', 'source_type', 'source_id']
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [
        customerResult,
        lotResult,
        nextProducts,
        nextProductSKUs,
        salesOrderResult,
        unitResult,
      ] = await Promise.all([
        listAllCustomers({ active_only: true }),
        listAllInventoryLots(),
        listAllShipmentWeightReferenceRecords(listProducts, 'products'),
        listAllShipmentWeightReferenceRecords(listProductSKUs, 'product_skus'),
        listAllSalesOrders(),
        listAllUnits(),
      ])
      setCustomers(
        Array.isArray(customerResult?.customers) ? customerResult.customers : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
      setProducts(nextProducts)
      setProductSKUs(nextProductSKUs)
      setSalesOrders(
        Array.isArray(salesOrderResult?.sales_orders)
          ? salesOrderResult.sales_orders
          : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载出货相关资料'))
      setCustomers([])
      setInventoryLots([])
      setProducts([])
      setProductSKUs([])
      setSalesOrders([])
      setUnits([])
    }
  }, [])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  const modalSelectedShipment = useMemo(() => {
    const shipment = shipmentModal?.shipment
    if (!shipment?.id) return null
    return rows.find((item) => item.id === shipment.id) || shipment
  }, [rows, shipmentModal?.shipment])

  const shipmentModalMode = shipmentModal?.mode || ''
  const isCreateModal = shipmentModalMode === 'create'
  const isViewModal = shipmentModalMode === 'view'
  const selectedSalesOrder = useMemo(
    () => salesOrdersByID.get(Number(selectedSalesOrderID || 0)) || null,
    [salesOrdersByID, selectedSalesOrderID]
  )
  const salesOrderImportColumns = useMemo(
    () => [
      {
        title: '销售订单号',
        width: 160,
        render: (_, item) => item.order_no || '-',
      },
      {
        title: '来源行',
        dataIndex: 'line_no',
        width: 88,
        render: (value) => (value ? `第 ${value} 行` : '-'),
      },
      {
        title: '客户',
        width: 160,
        render: (_, item) => salesOrderCustomerText(item) || '-',
      },
      {
        title: '产品 / SKU',
        width: 220,
        render: (_, item) =>
          sourceLineProductText(item, productOptions, productSKUOptions),
      },
      {
        title: '订单数量',
        dataIndex: 'orderedQuantity',
        width: 100,
        render: formatQuantity,
      },
      {
        title: '已生成出货',
        dataIndex: 'shippedQuantity',
        width: 100,
        render: formatQuantity,
      },
      {
        title: '剩余可出货',
        dataIndex: 'remainingQuantity',
        width: 120,
        render: (value) =>
          isPositiveNumeric20Scale6Units(numeric20Scale6Units(value)) ? (
            <Text strong>{formatQuantity(value)}</Text>
          ) : (
            <Text type="secondary">0</Text>
          ),
      },
      {
        title: '状态',
        dataIndex: 'line_status',
        width: 100,
      },
    ],
    [productOptions, productSKUOptions]
  )

  const loadSalesOrderSources = useCallback(
    async ({ keyword = '', page = 1 } = {}) => {
      const normalizedKeyword = String(keyword || '').trim()
      const normalizedPage = Number(page) || 1
      const request = beginLatestRequest('shipment-source-candidates')
      salesOrderSourceQueryRef.current = {
        keyword: normalizedKeyword,
        page: normalizedPage,
      }
      setSalesOrderSourceCurrent(normalizedPage)
      setSalesOrderSourceLoadFailed(false)
      setSourceLoading(true)
      try {
        const params = shipmentSourceCandidateListParams({
          keyword: normalizedKeyword,
          page: normalizedPage,
          pageSize: SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE,
          salesOrderID: shipmentForm.getFieldValue('sales_order_id'),
        })
        const data = await listShipmentSourceCandidates(params, {
          signal: request.signal,
        })
        if (!request.isCurrent()) return
        const nextSourceRows = data.shipment_source_candidates.map(
          normalizeShipmentSourceCandidate
        )
        const nextOrders = nextSourceRows.map(shipmentSourceOrderFromCandidate)
        setSalesOrderSources(nextSourceRows)
        setSalesOrderSourceTotal(data.total)
        setSalesOrderSourceItems((currentItems) => {
          const byID = new Map(
            currentItems.map((item) => [Number(item?.id || 0), item])
          )
          nextSourceRows.forEach((item) => byID.set(Number(item.id), item))
          return [...byID.values()]
        })
        setShipmentSourceRows((currentRows) => {
          const byID = new Map(
            currentRows.map((item) => [Number(item?.id || 0), item])
          )
          nextSourceRows.forEach((item) => byID.set(Number(item.id), item))
          return [...byID.values()]
        })
        setSalesOrders((currentOrders) => {
          const byID = new Map(
            currentOrders
              .map((order) => [Number(order?.id || 0), order])
              .filter(
                ([orderID]) => Number.isSafeInteger(orderID) && orderID > 0
              )
          )
          nextOrders.forEach((order) => byID.set(Number(order.id), order))
          return [...byID.values()]
        })
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) return
        setSalesOrderSources([])
        setSalesOrderSourceTotal(0)
        setSalesOrderSourceLoadFailed(true)
        message.error(getActionErrorMessage(error, '加载销售订单来源'))
      } finally {
        if (request.isCurrent()) {
          setSourceLoading(false)
          request.finish()
        }
      }
    },
    [beginLatestRequest, shipmentForm]
  )

  const handleSalesOrderSourceSearch = useCallback(
    (keyword) => {
      const normalizedKeyword = String(keyword || '').trim()
      const currentQuery = salesOrderSourceQueryRef.current
      if (
        currentQuery.keyword === normalizedKeyword &&
        currentQuery.page === 1
      ) {
        return
      }
      loadSalesOrderSources({ keyword: normalizedKeyword, page: 1 })
    },
    [loadSalesOrderSources]
  )

  const handleSalesOrderSourcePageChange = useCallback(
    (page, _pageSize, keyword) => {
      loadSalesOrderSources({ keyword, page })
    },
    [loadSalesOrderSources]
  )

  const handleSalesOrderSourceReload = useCallback(
    (keyword, page) => {
      loadSalesOrderSources({ keyword, page })
    },
    [loadSalesOrderSources]
  )

  const openSalesOrderImport = () => {
    if (!canImportSalesOrderSource) {
      message.warning('当前账号不能读取销售订单来源行')
      return
    }
    setSalesOrderSources([])
    setSalesOrderSourceItems([])
    setShipmentSourceRows([])
    setSalesOrderSourceTotal(0)
    setSalesOrderSourceCurrent(1)
    setSalesOrderSourceLoadFailed(false)
    salesOrderSourceQueryRef.current = { keyword: '', page: 1 }
    setSalesOrderImportOpen(true)
    loadSalesOrderSources({ keyword: '', page: 1 })
  }

  const importSalesOrderToShipment = async (sourceItems = []) => {
    const importableItems = sourceItems.filter(
      (item) =>
        item.selectable === true &&
        !item.disabledReason &&
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(item.remainingQuantity)
        )
    )
    if (importableItems.length === 0) {
      message.warning('请选择仍有剩余可出货数量的销售订单行')
      return
    }
    const sourceOrderIDs = new Set(
      importableItems.map((item) => Number(item.sales_order_id || 0))
    )
    if (sourceOrderIDs.size !== 1) {
      message.warning('一次出货草稿只能导入同一张销售订单的来源行')
      return
    }
    const sourceOrderID = [...sourceOrderIDs][0]
    const currentSourceOrderID = positiveInt(
      shipmentForm.getFieldValue('sales_order_id')
    )
    if (currentSourceOrderID && currentSourceOrderID !== sourceOrderID) {
      message.warning('当前出货草稿只能继续导入同一张销售订单的来源行')
      return
    }
    const sourceOrder = salesOrdersByID.get(sourceOrderID)
    if (!sourceOrder?.id) return
    try {
      setSourceLoading(true)
      const sameOrderItems = salesOrderSourceItems.filter(
        (item) => Number(item.sales_order_id || 0) === sourceOrderID
      )
      setSalesOrderItems(sameOrderItems)
      shipmentForm.setFieldsValue({
        sales_order_id: sourceOrder.id,
        customer_id: sourceOrder.customer_id,
        customer_snapshot: salesOrderCustomerText(sourceOrder),
      })
      const currentItems = (shipmentForm.getFieldValue('items') || []).filter(
        (item) => !isBlankShipmentItem(item)
      )
      const currentSourceItemIDs = new Set(
        currentItems
          .map((item) => positiveInt(item?.sales_order_item_id))
          .filter(Boolean)
      )
      const newSourceItems = importableItems.filter(
        (item) => !currentSourceItemIDs.has(positiveInt(item.id))
      )
      if (newSourceItems.length === 0) {
        message.warning('所选销售订单来源行已在当前出货明细中')
        return
      }
      shipmentForm.setFieldsValue({
        items: [
          ...currentItems,
          ...newSourceItems.map((item) =>
            createShipmentItemFromSalesOrderItem(item, {
              quantity: item.remainingQuantity,
            })
          ),
        ],
      })
      message.success('已导入销售订单来源行和剩余可出货数量')
      setSalesOrderImportOpen(false)
    } catch (error) {
      message.error(getActionErrorMessage(error, '导入销售订单来源'))
    } finally {
      setSourceLoading(false)
    }
  }

  const resetShipmentSourceSelectionState = () => {
    setSalesOrderItems([])
    setSalesOrderSources([])
    setSalesOrderSourceItems([])
    setShipmentSourceRows([])
    setSalesOrderSourceTotal(0)
    setSalesOrderSourceCurrent(1)
    setSalesOrderSourceLoadFailed(false)
    setSalesOrderImportOpen(false)
    salesOrderSourceQueryRef.current = { keyword: '', page: 1 }
  }

  const openCreate = () => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    resetShipmentSourceSelectionState()
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      shipment_no: buildSequentialDraftCode(rows, {
        prefix: 'SHIP',
        field: 'shipment_no',
      }),
      sales_order_id: undefined,
      customer_id: undefined,
      customer_snapshot: '',
      idempotency_key: idempotencyKey('shipment'),
      planned_ship_at: new Date().toISOString().slice(0, 10),
      items: [createBlankShipmentItem()],
    })
    setShipmentModal({ mode: 'create', shipment: null })
  }

  const openShipmentDetails = (shipment) => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      ...shipmentFormValues(shipment),
      items: Array.isArray(shipment?.items) ? shipment.items : [],
    })
    setShipmentModal({ mode: 'view', shipment })
  }

  const closeShipmentModal = () => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    resetShipmentSourceSelectionState()
    setShipmentModal(null)
    shipmentForm.resetFields()
  }

  const submitShipmentModal = async () => {
    try {
      const values = await shipmentForm.validateFields()
      setSaving(true)
      const savedShipment = await createShipmentWithItems(
        buildShipmentWithItemsParams(values, { products, productSKUs })
      )
      const attachmentSaved =
        (await shipmentAttachmentRef.current?.flushPendingAttachments(
          savedShipment?.id
        )) !== false
      message.success(
        attachmentSaved
          ? '出货单草稿和明细已保存'
          : '出货单已保存，未上传的附件请重新选择'
      )
      closeShipmentModal()
      resetBusinessPaginationCurrent(setPagination)
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '保存出货单'))
    } finally {
      setSaving(false)
    }
  }

  const runShipmentAction = async (shipment, action, actionLabel) => {
    if (!shipment?.id) {
      return
    }
    try {
      setSaving(true)
      await action({ id: shipment.id })
      message.success(`${actionLabel}已完成`)
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
    } finally {
      setSaving(false)
    }
  }

  const submitSelectedShipmentRelease = async () => {
    if (
      !canSubmitShipmentRelease ||
      !selectedRow?.id ||
      selectedRow.status !== 'DRAFT'
    ) {
      message.warning('请先选择待出货草稿，并确认当前岗位有提交放行权限')
      return
    }
    try {
      setSaving(true)
      const result = await submitShipmentFinanceApprovalProcess({
        id: selectedRow.id,
        shipment_no: selectedRow.shipment_no,
      })
      message.success(
        result.process_instance?.id
          ? '出货流程已提交，质量关口通过后进入财务审批'
          : '出货流程已存在，本次未重复启动'
      )
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '提交出货放行'))
    } finally {
      setSaving(false)
    }
  }

  const openShipmentQualitySource = async () => {
    if (
      !canCreateFinishedGoodsQualityInspection ||
      !selectedRow?.id ||
      selectedRow.status !== 'DRAFT'
    ) {
      message.warning('请先选择待出货草稿，并确认当前岗位有出货前检验权限')
      return
    }
    const shipment = selectedRow
    const request = beginLatestRequest('shipment-quality-source')
    const lotIDs = [
      ...new Set(
        (Array.isArray(shipment.items) ? shipment.items : [])
          .map((item) => Number(item?.lot_id || 0))
          .filter((lotID) => Number.isSafeInteger(lotID) && lotID > 0)
      ),
    ]
    setQualitySourceLoading(true)
    try {
      const [inspectionData, ...lotResults] = await Promise.all([
        listAllFinishedGoodsQualityInspections(
          { shipment_id: shipment.id },
          { signal: request.signal }
        ),
        ...lotIDs.map((lotID) =>
          listAllInventoryLots(
            { keyword: String(lotID) },
            { signal: request.signal }
          )
        ),
      ])
      if (!request.isCurrent()) return
      const lotIDSet = new Set(lotIDs)
      const exactLots = lotResults
        .flatMap((result) =>
          Array.isArray(result?.inventory_lots) ? result.inventory_lots : []
        )
        .filter((lot) => lotIDSet.has(Number(lot?.id || 0)))
      setQualitySourceContext({
        shipment,
        inventoryLots: exactLots,
        qualityInspections: Array.isArray(inspectionData?.quality_inspections)
          ? inspectionData.quality_inspections
          : [],
      })
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return
      message.error(getActionErrorMessage(error, '加载出货前检验来源'))
    } finally {
      if (request.isCurrent()) {
        setQualitySourceLoading(false)
        request.finish()
      }
    }
  }

  const submitShipmentQualitySource = async (values, source) => {
    const shipment = qualitySourceContext?.shipment
    if (qualitySourceInFlightRef.current || !shipment?.id) return

    let payload
    try {
      payload = buildShipmentQualityInspectionPayload(
        values,
        shipment,
        source,
        activeCustomerKey
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备出货前成品检验'))
      return
    }

    qualitySourceInFlightRef.current = true
    setQualitySourceLoading(true)
    try {
      const result = await createFinishedGoodsQualityInspectionDraft(payload)
      try {
        requireMatchingShipmentQualityInspectionDraft(
          result,
          shipment,
          source,
          payload.inspection_no
        )
      } catch (error) {
        error.isInvalidResponse = true
        throw error
      }
      setQualitySourceContext(null)
      message.success('已生成出货前成品检验草稿')
      navigate(
        relatedDocumentRoute(
          V1_ROUTE_PATHS.qualityInspections,
          { quality_inspection_id: result.id },
          {
            keyword: result.inspection_no,
            source: 'shipment',
            fields: ['inspection_no'],
          }
        )
      )
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        message.warning(
          '暂时无法确认是否生成成功，当前检验单号和送检批次已保留，请原样重试'
        )
      } else {
        message.error(getActionErrorMessage(error, '生成出货前成品检验'))
      }
    } finally {
      qualitySourceInFlightRef.current = false
      setQualitySourceLoading(false)
    }
  }

  const openShipmentFinanceSource = (action) => {
    const allowed =
      action === 'receivable' ? canCreateReceivable : canCreateInvoice
    if (!allowed || !selectedRow || selectedRow.status !== 'SHIPPED') {
      message.warning('请先选择已确认出货的出货单')
      return
    }
    setFinanceSourceAction(action)
  }

  const submitShipmentFinanceSource = async (values) => {
    if (
      financeSourceInFlightRef.current ||
      !financeSourceAction ||
      !selectedRow
    ) {
      return
    }

    let config
    let scope
    let attempt
    let params
    try {
      config = shipmentFinanceSourceActionConfig(financeSourceAction)
      const payload = {
        ...buildShipmentFinanceSourcePayload(values, selectedRow, config.key),
        customer_key: activeCustomerKey || undefined,
      }
      scope = `shipment-finance:${config.key}:${selectedRow.id}`
      attempt = financeSourceAttemptsRef.current.prepare(scope, payload)
      params = {
        ...attempt.params,
        fact_no: sourceBusinessActionNo(
          config.factNoPrefix,
          selectedRow.shipment_no,
          attempt.params.idempotency_key
        ),
      }
    } catch (error) {
      if (scope && attempt) {
        financeSourceAttemptsRef.current.settle(scope, attempt, error)
      }
      message.error(getActionErrorMessage(error, '准备财务记录'))
      return
    }

    const execute =
      config.key === 'receivable'
        ? createReceivableFromShipment
        : createInvoiceFromShipment
    financeSourceInFlightRef.current = true
    setFinanceSourceLoading(true)
    try {
      const result = await execute(params)
      if (
        !result ||
        result.status !== 'DRAFT' ||
        result.fact_type !== config.factType
      ) {
        const error = new Error('财务记录返回结果无法确认')
        error.isInvalidResponse = true
        throw error
      }
      financeSourceAttemptsRef.current.settle(scope, attempt, null)
      setFinanceSourceAction(null)
      message.success(config.successMessage)
      await loadRows()
    } catch (error) {
      const retained = financeSourceAttemptsRef.current.settle(
        scope,
        attempt,
        error
      )
      if (retained) {
        message.warning(
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      } else {
        message.error(getActionErrorMessage(error, config.title))
      }
    } finally {
      financeSourceInFlightRef.current = false
      setFinanceSourceLoading(false)
    }
  }

  const columns = useMemo(
    () => buildShipmentColumns({ salesOrdersByID }),
    [salesOrdersByID]
  )
  const { tableColumns, exportColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: SHIPMENTS_MODULE_KEY,
      moduleTitle: '出货单',
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `出货单-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: exportColumns,
      rows,
    })
  }, [exportColumns, rows])
  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      customerFilter ||
      productFilter ||
      warehouseFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routeSalesOrderID ||
      routeShipmentID ||
      linkedKeyword
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setCustomerFilter('')
    setProductFilter('')
    setWarehouseFilter('')
    setDateFilterField('planned_ship_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])
  const selectedRowLabel = selectedRow
    ? `${selectedRow.shipment_no || '已登记出货单'} / ${
        selectedRow.customer_snapshot ||
        (selectedRow.customer_id ? '客户已关联' : '未指定客户')
      }`
    : '请先选择一张出货单'

  return (
    <BusinessPageLayout className="erp-v1-shipments-page">
      <PageHeaderCard
        compact
        title="出货单"
        description="出货单维护出货信息和明细；草稿先提交仓库放行协同，放行完成后仍需确认出货才会记录实际出货并更新库存。"
        tags={[
          <Tag color="gold" key="release">
            出货放行：仓库协同
          </Tag>,
          <Tag color="blue" key="shipment">
            出货单：实际出货记录
          </Tag>,
          <Tag color="green" key="inventory">
            出库管理：库存出库记录
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总出货单', value: total },
          { key: 'current', label: '本页显示', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={resolvedRouteKeyword || linkedKeyword || keyword}
              placeholder="搜索出货"
              searchHint="可搜索：出货单号、客户、销售订单"
              onChange={(event) => {
                if (linkedKeyword || routeSalesOrderID || routeShipmentID) {
                  clearRouteContext()
                }
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={SHIPMENT_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={customerFilter}
              options={[{ label: '全部客户', value: '' }, ...customerOptions]}
              placeholder="全部客户"
              showSearch
              optionFilterProp="label"
              onChange={(nextCustomer) => {
                setCustomerFilter(nextCustomer || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={productFilter}
              options={[{ label: '全部产品', value: '' }, ...productOptions]}
              placeholder="全部产品"
              showSearch
              optionFilterProp="label"
              onChange={(nextProduct) => {
                setProductFilter(nextProduct || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseFilter}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
              showSearch
              optionFilterProp="label"
              onChange={(nextWarehouse) => {
                setWarehouseFilter(nextWarehouse || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={SHIPMENT_DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(value) => {
                setDateFilterField(value || 'planned_ship_at')
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
            {routeSalesOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['sales_order_id'])}
              >
                已按销售订单筛选
              </Tag>
            ) : null}
            {routeShipmentID ? (
              <Tag
                closable
                color="blue"
                onClose={() =>
                  clearRouteContext(['shipment_id', 'source_type', 'source_id'])
                }
              >
                已按出货单筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle="出货单"
            onExport={exportRows}
            exportDisabled={rows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          canCreate ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              新建草稿
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <BusinessActionTooltip
            disabled={!selectedRow || saving}
            disabledReason={
              saving ? '当前操作完成后可查看明细' : '请先选择一张出货单'
            }
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedRow || saving}
              onClick={() => openShipmentDetails(selectedRow)}
            >
              查看明细
            </Button>
          </BusinessActionTooltip>
          {relatedMenuItems.length > 0 ? (
            <Dropdown
              trigger={['click']}
              destroyOnHidden
              menu={{ items: relatedMenuItems, onClick: openRelatedRecord }}
            >
              <Button size="small" icon={<LinkOutlined />}>
                相关单据 <DownOutlined />
              </Button>
            </Dropdown>
          ) : null}
          {selectedRow?.status === 'DRAFT' &&
          canCreateFinishedGoodsQualityInspection ? (
            <Button
              size="small"
              loading={qualitySourceLoading && !qualitySourceContext}
              disabled={qualitySourceLoading || saving}
              onClick={openShipmentQualitySource}
            >
              发起出货前检验
            </Button>
          ) : null}
          {canSubmitShipmentRelease &&
          (!selectedRow || selectedRow.status === 'DRAFT') ? (
            <BusinessActionTooltip
              disabled={!selectedRow || saving}
              disabledReason={
                saving ? '当前操作完成后可提交' : '请先选择一张出货草稿'
              }
            >
              <Popconfirm
                title="提交后将启动版本化出货流程；质量关口通过后进入财务审批，审批前不能确认出货。是否继续？"
                onConfirm={submitSelectedShipmentRelease}
                okText="提交放行"
                cancelText="取消"
              >
                <Button size="small" disabled={!selectedRow || saving}>
                  提交出货审批
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canShip && (!selectedRow || selectedRow.status === 'DRAFT') ? (
            <BusinessActionTooltip
              disabled={!selectedRow || saving}
              disabledReason={
                saving ? '当前操作完成后可确认出货' : '请先选择一张出货草稿'
              }
            >
              <Popconfirm
                title="确认出货并扣减相应库存？"
                onConfirm={() =>
                  runShipmentAction(selectedRow, shipShipment, '确认出货')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!selectedRow || saving}
                >
                  确认出货
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canCancel &&
          (!selectedRow ||
            ['DRAFT', 'SHIPPED'].includes(selectedRow.status)) ? (
              <BusinessActionTooltip
                disabled={!selectedRow || saving}
                disabledReason={
                saving ? '当前操作完成后可继续' : '请先选择一张出货单'
              }
              >
                <Popconfirm
                  title={
                  selectedRow?.status === 'DRAFT'
                    ? '确认作废这张出货草稿？草稿作废不会扣减或恢复库存；如已提交放行，需先完成或退回放行待办。'
                    : '确认撤销已出货并恢复相应库存？'
                }
                  onConfirm={() =>
                  runShipmentAction(
                    selectedRow,
                    cancelShipment,
                    selectedRow?.status === 'DRAFT'
                      ? '作废出货草稿'
                      : '撤销已出货'
                  )
                }
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    disabled={!selectedRow || saving}
                  >
                    {selectedRow?.status === 'DRAFT'
                    ? '作废草稿'
                    : '撤销已出货'}
                  </Button>
                </Popconfirm>
              </BusinessActionTooltip>
          ) : null}
          {selectedRow?.status === 'SHIPPED' &&
          (canCreateReceivable || canCreateInvoice) ? (
            <>
              {canCreateReceivable ? (
                <Button
                  size="small"
                  disabled={saving || financeSourceLoading}
                  onClick={() => openShipmentFinanceSource('receivable')}
                >
                  生成应收
                </Button>
              ) : null}
              {canCreateInvoice ? (
                <Button
                  size="small"
                  disabled={saving || financeSourceLoading}
                  onClick={() => openShipmentFinanceSource('invoice')}
                >
                  生成开票记录
                </Button>
              ) : null}
            </>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={tableColumns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无出货单"
        scroll={{ x: 1510 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRow(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
        }
        expandable={shipmentItemsPreview.expandable}
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
        })}
        onOpenRecord={openShipmentDetails}
      />
      {shipmentItemsPreview.modal}
      {columnOrderModal}

      <ShipmentBusinessModal
        canCreate={canCreate}
        canImportSalesOrderSource={canImportSalesOrderSource}
        customerOptions={customerOptions}
        form={shipmentForm}
        importSalesOrderToShipment={importSalesOrderToShipment}
        inventoryLots={inventoryLots}
        inventoryLotOptions={inventoryLotOptions}
        isCreateModal={isCreateModal}
        isViewModal={isViewModal}
        modalSelectedShipment={modalSelectedShipment}
        onCancel={closeShipmentModal}
        onOk={submitShipmentModal}
        onOpenSalesOrderImport={openSalesOrderImport}
        products={products}
        productOptions={productOptions}
        productSKUs={productSKUs}
        productSKUOptions={productSKUOptions}
        salesOrderImportColumns={salesOrderImportColumns}
        salesOrderImportOpen={salesOrderImportOpen}
        salesOrderItems={salesOrderItems}
        salesOrderItemOptions={salesOrderItemOptions}
        salesOrderOptions={salesOrderOptions}
        salesOrderSourceCurrent={salesOrderSourceCurrent}
        salesOrderSourceEmptyDescription={
          salesOrderSourceLoadFailed
            ? '加载失败，请重新搜索或关闭后重试'
            : '暂无可导入销售订单行'
        }
        salesOrderSourceImportDisabled={salesOrderSourceLoadFailed}
        salesOrderSourcePageSize={SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE}
        salesOrderSourceTotal={salesOrderSourceTotal}
        salesOrderSources={salesOrderSources}
        saving={saving}
        selectedSalesOrder={selectedSalesOrder}
        setSalesOrderImportOpen={setSalesOrderImportOpen}
        shipmentAttachmentRef={shipmentAttachmentRef}
        shipmentSourceRows={shipmentSourceRows}
        sourceLoading={sourceLoading}
        onSalesOrderSourcePageChange={handleSalesOrderSourcePageChange}
        onSalesOrderSourceReload={handleSalesOrderSourceReload}
        onSalesOrderSourceSearchChange={handleSalesOrderSourceSearch}
        unitOptions={unitOptions}
        warehouseOptions={warehouseOptions}
      />

      <ShipmentFinanceSourceModal
        action={financeSourceAction}
        open={Boolean(financeSourceAction)}
        shipment={selectedRow}
        loading={financeSourceLoading}
        onCancel={() => {
          if (!financeSourceInFlightRef.current) setFinanceSourceAction(null)
        }}
        onSubmit={submitShipmentFinanceSource}
      />

      <ShipmentQualityInspectionModal
        open={Boolean(qualitySourceContext)}
        shipment={qualitySourceContext?.shipment}
        sources={qualityInspectionSources}
        productOptions={productOptions}
        productSKUOptions={productSKUOptions}
        warehouseOptions={warehouseOptions}
        inventoryLotOptions={qualitySourceInventoryLotOptions}
        loading={qualitySourceLoading}
        onCancel={() => {
          if (!qualitySourceInFlightRef.current) setQualitySourceContext(null)
        }}
        onSubmit={submitShipmentQualitySource}
      />
    </BusinessPageLayout>
  )
}
