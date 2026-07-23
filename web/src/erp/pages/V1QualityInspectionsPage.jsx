import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileDoneOutlined,
  LinkOutlined,
  PlusOutlined,
  RollbackOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Dropdown,
  Form,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'
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
  cancelQualityInspection,
  createQualityInspectionDraft,
  getQualityInspection,
  listFinishedGoodsQualityInspections,
  listOutsourcingReturnQualityInspections,
  listProductionStageQualityInspections,
  listQualityInspections,
  passQualityInspection,
  rejectQualityInspection,
  submitQualityInspection,
} from '../api/qualityApi.mjs'
import {
  createPurchaseReturnFromQualityInspection,
  getPurchaseReceipt,
  listAllPurchaseReceipts,
  listAllPurchaseReturns,
} from '../api/purchaseApi.mjs'
import { listAllInventoryLots } from '../api/inventoryApi.mjs'
import {
  listAllMaterials,
  listAllProducts,
  listAllWarehouses,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
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
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import QualityInspectionPurchaseReturnModal from '../components/quality-inspections/QualityInspectionPurchaseReturnModal.jsx'
import PurchaseRejectionDispositionModal from '../components/quality-inspections/PurchaseRejectionDispositionModal.jsx'
import OutsourcingReturnDispositionModal from '../components/quality-inspections/OutsourcingReturnDispositionModal.jsx'
import ProductionExceptionRequestModal from '../components/quality-inspections/ProductionExceptionRequestModal.jsx'
import {
  QualityInspectionCreateForm,
  QualityInspectionDecisionForm,
  buildDecisionParams,
  buildInspectionParams,
  positiveInt,
  todayInputValue,
} from '../components/quality-inspections/QualityInspectionForms.jsx'
import {
  buildQualityInspectionDataColumns,
  buildQualityInspectionExportColumns,
  isProductionStageQualityInspection,
  productionQualityGateLabel,
  QUALITY_DATE_FILTER_OPTIONS,
  QUALITY_INSPECTION_TYPE_LABELS,
  QUALITY_INSPECTION_TYPE_FILTER_OPTIONS,
  QUALITY_INSPECTIONS_MODULE_KEY,
  QUALITY_RESULT_FILTER_OPTIONS,
  QUALITY_STATUS_OPTIONS,
} from '../components/quality-inspections/qualityInspectionColumns.jsx'
import { formatQuantity } from '../utils/businessLineItems.mjs'
import {
  compactParams,
  buildSequentialDraftCode,
  hasActionPermission,
  statusText,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
  resolveExactRecordPage,
} from '../utils/businessPagination.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { applyEffectiveFieldPolicyFlags } from '../utils/adminProfileSync.mjs'
import {
  inventoryLotOption,
  materialOption,
  productOption,
  purchaseReceiptItemOption,
  purchaseReceiptOption,
  referenceLabel,
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  searchParamPositiveInt,
  searchParamText,
} from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  buildPurchaseReturnFromQualityInspectionPayload,
  canCreatePurchaseReturnFromRejectedInspection,
  isQualityInspectionRouteSourceCompatible,
  isRejectedIncomingInspection,
  qualityInspectionRouteSourceParams,
} from '../utils/qualityInspectionSourceAction.mjs'
import { createSourceBusinessActionAttemptStore } from '../utils/sourceBusinessAction.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const EMPTY_ADMIN_PROFILE = Object.freeze({})
const PURCHASE_RECEIPT_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})
const { Text } = Typography

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
  applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns })
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

function findByPositiveID(id, records = []) {
  const targetID = positiveInt(id)
  if (!targetID) return null
  return (Array.isArray(records) ? records : []).find(
    (record) => Number(record?.id || record?.lot_id || 0) === targetID
  )
}

function buildDecisionSourceSummary({
  inspection,
  allPurchaseReceiptItemOptions,
  inventoryLotOptions,
  materialOptions,
  productOptions,
  purchaseReceiptOptions,
}) {
  const sourceType = String(inspection?.source_type || '').toUpperCase()
  const subjectType = String(inspection?.subject_type || '').toUpperCase()
  const inspectionType =
    QUALITY_INSPECTION_TYPE_LABELS[
      String(inspection?.inspection_type || '').toUpperCase()
    ] || '质量检验'
  const visibleWipText = (value) => String(value ?? '').trim() || '—'

  if (isProductionStageQualityInspection(inspection)) {
    return {
      sourceNo: visibleWipText(inspection?.production_order_no),
      primary: [
        `检验类型：${inspectionType}`,
        `质量关口：${productionQualityGateLabel(inspection?.gate_code)}`,
      ].join('；'),
      secondary: [
        `产品：${visibleWipText(
          inspection?.product_code
        )} / ${visibleWipText(inspection?.product_name)}`,
        `生产工序：${visibleWipText(inspection?.operation_name)}`,
        `在制批次：${visibleWipText(inspection?.wip_batch_no)}`,
        `批次数量：${visibleWipText(inspection?.batch_quantity)}`,
      ].join('；'),
    }
  }

  const recordedSourceNo = trimOptional(inspection?.source_no)
  let sourceNo = recordedSourceNo
  if (!sourceNo && sourceType === 'PURCHASE_RECEIPT') {
    sourceNo = referenceLabel(
      purchaseReceiptOptions,
      inspection?.purchase_receipt_id,
      '采购入库已关联'
    )
  }
  if (!sourceNo && sourceType === 'OUTSOURCING_FACT') {
    sourceNo = '委外回货单已关联'
  }
  if (!sourceNo && sourceType === 'SHIPMENT') {
    sourceNo = '出货单已关联'
  }

  const sourceLine =
    sourceType === 'PURCHASE_RECEIPT' && inspection?.purchase_receipt_item_id
      ? referenceLabel(
          allPurchaseReceiptItemOptions,
          inspection.purchase_receipt_item_id,
          '入库行已关联'
        )
      : ''
  const subject =
    subjectType === 'PRODUCT'
      ? referenceLabel(productOptions, inspection?.subject_id, '产品已关联')
      : referenceLabel(
          materialOptions,
          inspection?.material_id || inspection?.subject_id,
          '材料已关联'
        )
  const lot = inspection?.inventory_lot_id
    ? referenceLabel(
        inventoryLotOptions,
        inspection.inventory_lot_id,
        '批次已关联'
      )
    : ''

  return {
    sourceNo: sourceNo || '来源单据已关联',
    primary: [
      `检验类型：${inspectionType}`,
      sourceLine ? `来源行：${sourceLine}` : '',
    ]
      .filter(Boolean)
      .join('；'),
    secondary: [
      subject ? `产品或材料：${subject}` : '',
      lot ? `批次：${lot}` : '',
    ]
      .filter(Boolean)
      .join('；'),
  }
}

export default function V1QualityInspectionsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || EMPTY_ADMIN_PROFILE,
    [outletContext?.adminProfile]
  )
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('inspected_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [purchaseReceiptFilter, setPurchaseReceiptFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [inspectionModal, setInspectionModal] = useState(null)
  const [detailInspection, setDetailInspection] = useState(null)
  const [purchaseReturnModal, setPurchaseReturnModal] = useState(null)
  const [rejectionDispositionOpen, setRejectionDispositionOpen] =
    useState(false)
  const [outsourcingDispositionOpen, setOutsourcingDispositionOpen] = useState(false)
  const [productionExceptionOpen, setProductionExceptionOpen] = useState(false)
  const [purchaseReturnLoading, setPurchaseReturnLoading] = useState(false)
  const [selectedRowPurchaseReceipt, setSelectedRowPurchaseReceipt] =
    useState(null)
  const [
    selectedRowPurchaseReceiptLoading,
    setSelectedRowPurchaseReceiptLoading,
  ] = useState(false)
  const [returnedInspectionIDs, setReturnedInspectionIDs] = useState(
    () => new Set()
  )
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [purchaseReceipts, setPurchaseReceipts] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [referenceDataState, setReferenceDataState] = useState('loading')
  const [inspectionForm] = Form.useForm()
  const [decisionForm] = Form.useForm()
  const inspectionAttachmentRef = useRef(null)
  const purchaseReturnInFlightRef = useRef(false)
  const purchaseReturnAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const detailRequestRef = useRef(0)
  const selectedRowPurchaseReceiptRequestRef = useRef(0)
  useEffect(
    () => () => {
      detailRequestRef.current += 1
    },
    []
  )
  const routePurchaseOrderID = searchParamPositiveInt(
    searchParams,
    'purchase_order_id'
  )
  const routePurchaseReceiptID = searchParamPositiveInt(
    searchParams,
    'purchase_receipt_id'
  )
  const routeQualityInspectionID = searchParamPositiveInt(
    searchParams,
    'quality_inspection_id'
  )
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const resolvedRouteKeyword =
    routeQualityInspectionID &&
    Number(selectedRow?.id || 0) === Number(routeQualityInspectionID)
      ? String(selectedRow?.inspection_no || '').trim()
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
  const selectedPurchaseReceiptID = Form.useWatch(
    'purchase_receipt_id',
    inspectionForm
  )
  const selectedPurchaseReceiptItemID = Form.useWatch(
    'purchase_receipt_item_id',
    inspectionForm
  )

  const canCreate = hasActionPermission(
    adminProfile,
    'quality.inspection.create'
  )
  const canUpdate = hasActionPermission(
    adminProfile,
    'quality.inspection.update'
  )
  const canCreatePurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.create'
  )
  const canReadPurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.read'
  )
  const canPostPurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.post'
  )
  const canCancelPurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.cancel'
  )
  const canPostOutsourcingDisposition = hasActionPermission(adminProfile, 'outsourcing.fact.post')
  const canCancelOutsourcingDisposition = hasActionPermission(adminProfile, 'outsourcing.fact.cancel')
  const canReadOutsourcingDisposition = hasActionPermission(
    adminProfile,
    'outsourcing.fact.read'
  )
  const canHandleQualityException = hasActionPermission(adminProfile, 'quality.exception.handle')
  const canReadPurchaseReceipt = hasActionPermission(
    adminProfile,
    'purchase.receipt.read'
  )
  const canReadInventory = hasActionPermission(
    adminProfile,
    'warehouse.inventory.read'
  )
  const canReadShipment = hasActionPermission(adminProfile, 'shipment.read')
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const selectedSourceType = String(
    selectedRow?.source_type || ''
  ).toUpperCase()
  const relatedMenuItems = useMemo(() => {
    const canOpenInventory =
      canReadInventory && canOpenRelatedPath(V1_ROUTE_PATHS.inventory)
    if (selectedSourceType === 'PURCHASE_RECEIPT') {
      return [
        canReadPurchaseReceipt &&
        canOpenRelatedPath(V1_ROUTE_PATHS.purchaseReceipts)
          ? { key: 'purchase-receipts', label: '采购入库' }
          : null,
        canOpenInventory ? { key: 'inventory', label: '库存台账' } : null,
      ].filter(Boolean)
    }
    if (selectedSourceType === 'SHIPMENT') {
      return [
        canReadShipment && canOpenRelatedPath(V1_ROUTE_PATHS.shipments)
          ? { key: 'shipments', label: '出货单' }
          : null,
        canOpenInventory ? { key: 'inventory', label: '库存台账' } : null,
      ].filter(Boolean)
    }
    if (selectedSourceType === 'PRODUCTION_WIP') return []
    return canOpenInventory ? [{ key: 'inventory', label: '库存台账' }] : []
  }, [
    canOpenRelatedPath,
    canReadInventory,
    canReadPurchaseReceipt,
    canReadShipment,
    selectedSourceType,
  ])
  const purchaseReceiptOptions = useMemo(
    () => uniqueReferenceOptions(purchaseReceipts, purchaseReceiptOption),
    [purchaseReceipts]
  )
  const purchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(
        purchaseReceipts
          .filter((receipt) => {
            const selectedReceiptID = positiveInt(selectedPurchaseReceiptID)
            return (
              !selectedReceiptID ||
              Number(receipt.id || 0) === selectedReceiptID
            )
          })
          .flatMap((receipt) =>
            Array.isArray(receipt?.items) ? receipt.items : []
          ),
        purchaseReceiptItemOption
      ),
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const purchaseReceiptItems = useMemo(
    () =>
      purchaseReceipts.flatMap((receipt) =>
        Array.isArray(receipt?.items) ? receipt.items : []
      ),
    [purchaseReceipts]
  )
  const allPurchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(purchaseReceiptItems, purchaseReceiptItemOption),
    [purchaseReceiptItems]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const selectedPurchaseReceipt = useMemo(
    () => findByPositiveID(selectedPurchaseReceiptID, purchaseReceipts) || null,
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const selectedRowCanCreatePurchaseReturn =
    canCreatePurchaseReturnFromRejectedInspection(
      selectedRow,
      selectedRowPurchaseReceipt
    )
  const selectedRowCanCreateRejectionDisposition = Boolean(
    isRejectedIncomingInspection(selectedRow) &&
      String(selectedRowPurchaseReceipt?.status || '').toUpperCase() === 'DRAFT'
  )
  const selectedPurchaseReceiptItem = useMemo(
    () =>
      findByPositiveID(selectedPurchaseReceiptItemID, purchaseReceiptItems) ||
      null,
    [purchaseReceiptItems, selectedPurchaseReceiptItemID]
  )
  const purchaseReturnSourceSummary = useMemo(() => {
    const inspection = purchaseReturnModal?.inspection
    const receipt =
      findByPositiveID(inspection?.purchase_receipt_id, purchaseReceipts) ||
      (positiveInt(selectedRowPurchaseReceipt?.id) ===
      positiveInt(inspection?.purchase_receipt_id)
        ? selectedRowPurchaseReceipt
        : null)
    const item =
      findByPositiveID(
        inspection?.purchase_receipt_item_id,
        purchaseReceiptItems
      ) ||
      findByPositiveID(
        inspection?.purchase_receipt_item_id,
        Array.isArray(receipt?.items) ? receipt.items : []
      )
    return {
      receipt: receipt?.receipt_no || '采购入库已关联',
      supplier: receipt?.supplier_name || '供应商已关联',
      material: referenceLabel(
        materialOptions,
        item?.material_id || inspection?.material_id,
        '材料'
      ),
      warehouse: referenceLabel(
        warehouseOptions,
        item?.warehouse_id || inspection?.warehouse_id,
        '仓库'
      ),
      lot: referenceLabel(
        inventoryLotOptions,
        item?.lot_id || inspection?.inventory_lot_id,
        '批次'
      ),
    }
  }, [
    inventoryLotOptions,
    materialOptions,
    purchaseReceiptItems,
    purchaseReceipts,
    purchaseReturnModal?.inspection,
    selectedRowPurchaseReceipt,
    warehouseOptions,
  ])

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(QUALITY_INSPECTIONS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: QUALITY_INSPECTIONS_MODULE_KEY,
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

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-receipts': relatedDocumentRoute(
        V1_ROUTE_PATHS.purchaseReceipts,
        { receipt_id: selectedRow.purchase_receipt_id },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['receipt_no'],
        }
      ),
      shipments: relatedDocumentRoute(
        V1_ROUTE_PATHS.shipments,
        { shipment_id: selectedRow.source_id },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['shipment_no'],
        }
      ),
      inventory: relatedDocumentRoute(
        V1_ROUTE_PATHS.inventory,
        {
          source_type: selectedRow.source_type,
          source_id: selectedRow.source_id,
          lot_id: selectedRow.inventory_lot_id,
          view: 'txns',
        },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['source_no'],
        }
      ),
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    setLoading(true)
    try {
      const routeSelectedID = Number(routeQualityInspectionID || 0)
      const baseParams = compactParams({
        status: statusFilter,
        result: resultFilter,
        keyword: trimOptional(
          linkedDocumentRequestKeyword({
            localKeyword: keyword,
            linkedKeyword,
            hasExactContext: Boolean(
              routeQualityInspectionID ||
                routePurchaseOrderID ||
                routePurchaseReceiptID ||
                (routeSourceType && routeSourceID)
            ),
          })
        ),
        date_from: dateFilterStart || undefined,
        date_to: dateFilterEnd || undefined,
        ...getBusinessPaginationParams(pagination),
      })
      const inventoryFilterParams = compactParams({
        ...baseParams,
        warehouse_id: warehouseFilter || undefined,
        inventory_lot_id: lotFilter || undefined,
      })
      const routeSourceParams = qualityInspectionRouteSourceParams({
        inspectionType: inspectionTypeFilter,
        sourceType: routeSourceType,
        sourceID: routeSourceID,
      })
      const inventorySourceParams = compactParams({
        ...inventoryFilterParams,
        source_type: routeSourceParams.source_type,
        source_id: routeSourceParams.source_id,
      })
      let listRequest
      if (inspectionTypeFilter === 'OUTSOURCING_RETURN') {
        listRequest = listOutsourcingReturnQualityInspections(
          {
            ...inventoryFilterParams,
            customer_key: activeCustomerKey || undefined,
            fact_id: routeSourceParams.fact_id,
          },
          { signal: request.signal }
        )
      } else if (inspectionTypeFilter === 'FINISHED_GOODS') {
        listRequest = listFinishedGoodsQualityInspections(
          inventorySourceParams,
          {
            signal: request.signal,
          }
        )
      } else if (inspectionTypeFilter === 'PRODUCTION_STAGE') {
        listRequest = listProductionStageQualityInspections(baseParams, {
          signal: request.signal,
        })
      } else {
        listRequest = listQualityInspections(
          compactParams({
            ...inventorySourceParams,
            inspection_type: inspectionTypeFilter || undefined,
            date_field: dateFilterField,
            purchase_receipt_id:
              purchaseReceiptFilter || routePurchaseReceiptID || undefined,
            purchase_order_id: routePurchaseOrderID || undefined,
            material_id: materialFilter || undefined,
          }),
          { signal: request.signal }
        )
      }
      const [data, routeInspection] = await Promise.all([
        listRequest,
        routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE'
          ? getQualityInspection({ id: routeSelectedID })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const listedRows = Array.isArray(data?.quality_inspections)
        ? data.quality_inspections
        : []
      const listedRouteInspection =
        routeSelectedID > 0
          ? listedRows.find((item) => Number(item?.id) === routeSelectedID) ||
            null
          : null
      const selectedRouteInspection = routeInspection || listedRouteInspection
      const exactPage = resolveExactRecordPage({
        records: listedRows,
        exactRecord: selectedRouteInspection,
        hasExactContext:
          routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE',
        total: Number(data?.total || 0),
      })
      const nextRows = exactPage.records
      setRows(nextRows)
      setSelectedRow((current) => {
        if (routeSelectedID > 0) return selectedRouteInspection
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(exactPage.total)
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, '加载质量检验单'))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    activeCustomerKey,
    beginLatestRequest,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    linkedKeyword,
    inspectionTypeFilter,
    lotFilter,
    materialFilter,
    pagination,
    purchaseReceiptFilter,
    routePurchaseOrderID,
    routePurchaseReceiptID,
    routeQualityInspectionID,
    routeSourceID,
    routeSourceType,
    resultFilter,
    statusFilter,
    warehouseFilter,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    const request = beginLatestRequest('reference-options')
    setReferenceDataState('loading')
    try {
      const [
        receiptResult,
        lotResult,
        materialResult,
        productResult,
        warehouseResult,
      ] = await Promise.all([
        listAllPurchaseReceipts({}, { signal: request.signal }),
        listAllInventoryLots({}, { signal: request.signal }),
        listAllMaterials({ active_only: true }, { signal: request.signal }),
        listAllProducts({ active_only: true }, { signal: request.signal }),
        listAllWarehouses({ active_only: true }, { signal: request.signal }),
      ])
      if (!request.isCurrent()) return false
      setPurchaseReceipts(
        Array.isArray(receiptResult?.purchase_receipts)
          ? receiptResult.purchase_receipts
          : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
      setReferenceDataState('ready')
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      message.error(getActionErrorMessage(error, '加载质检相关资料'))
      setPurchaseReceipts([])
      setInventoryLots([])
      setMaterials([])
      setProducts([])
      setWarehouses([])
      setReferenceDataState('error')
      return false
    } finally {
      if (request.isCurrent()) request.finish()
    }
  }, [beginLatestRequest])

  useEffect(() => {
    const receiptID = positiveInt(selectedRow?.purchase_receipt_id)
    const requestID = selectedRowPurchaseReceiptRequestRef.current + 1
    selectedRowPurchaseReceiptRequestRef.current = requestID
    setSelectedRowPurchaseReceipt(null)

    if (!receiptID || !isRejectedIncomingInspection(selectedRow)) {
      setSelectedRowPurchaseReceiptLoading(false)
      return undefined
    }

    setSelectedRowPurchaseReceiptLoading(true)
    getPurchaseReceipt({ id: receiptID })
      .then((receipt) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        setSelectedRowPurchaseReceipt(
          positiveInt(receipt?.id) === receiptID ? receipt : null
        )
      })
      .catch((error) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        message.error(getActionErrorMessage(error, '核对来源收货状态'))
        setSelectedRowPurchaseReceipt(null)
      })
      .finally(() => {
        if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
          setSelectedRowPurchaseReceiptLoading(false)
        }
      })

    return () => {
      if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
        selectedRowPurchaseReceiptRequestRef.current += 1
      }
    }
  }, [selectedRow])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : [
              'purchase_order_id',
              'purchase_receipt_id',
              'quality_inspection_id',
              'source_type',
              'source_id',
            ]
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  const refreshPageData = useCallback(async () => {
    const [rowsOK, referencesOK] = await Promise.all([
      loadRows(),
      loadReferenceOptions(),
    ])
    return rowsOK !== false && referencesOK !== false
  }, [loadReferenceOptions, loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  useEffect(() => {
    if (inspectionModal?.mode === 'create') {
      inspectionForm.setFieldsValue({
        inspection_no: buildSequentialDraftCode(rows, {
          prefix: 'QI',
          field: 'inspection_no',
        }),
        purchase_receipt_id: undefined,
        purchase_receipt_item_id: undefined,
        decision_note: '',
      })
    }
    if (['pass', 'reject', 'cancel'].includes(inspectionModal?.mode)) {
      decisionForm.resetFields()
      decisionForm.setFieldsValue({
        result: inspectionModal?.mode === 'pass' ? 'PASS' : undefined,
        inspected_at:
          inspectionModal?.mode === 'cancel' ? undefined : todayInputValue(),
        defect_rate_selection: undefined,
        defect_rate_custom_percent: undefined,
        decision_note: '',
      })
    }
  }, [decisionForm, inspectionForm, inspectionModal?.mode, rows])

  const openCreate = useCallback(() => {
    if (referenceDataState !== 'ready') {
      message.warning(
        referenceDataState === 'loading'
          ? '质检来源资料正在加载，请稍后再补建来料质检'
          : '质检来源资料加载失败，请先刷新当前页后重试'
      )
      return
    }
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({ mode: 'create' })
  }, [referenceDataState])

  const openDecision = useCallback((mode, inspection) => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({ mode, inspection })
  }, [])

  const openQualityInspectionDetails = useCallback(async (inspection) => {
    if (!inspection?.id) return
    const requestID = detailRequestRef.current + 1
    detailRequestRef.current = requestID
    setSelectedRow(inspection)
    setDetailInspection(inspection)
    try {
      const detail = await getQualityInspection({ id: inspection.id })
      if (detailRequestRef.current === requestID && detail?.id) {
        setDetailInspection(detail)
      }
    } catch (error) {
      if (detailRequestRef.current === requestID) {
        message.warning(getActionErrorMessage(error, '刷新质量检验详情'))
      }
    }
  }, [])

  const closeQualityInspectionDetails = useCallback(() => {
    detailRequestRef.current += 1
    setDetailInspection(null)
  }, [])

  const closeModal = useCallback(() => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal(null)
  }, [])

  const handleReceiptChange = useCallback(() => {
    inspectionForm.setFieldsValue({
      purchase_receipt_item_id: undefined,
    })
  }, [inspectionForm])

  const handleCreateInspection = useCallback(async () => {
    if (referenceDataState !== 'ready') {
      message.warning('质检来源资料尚未就绪，本次未生成，请刷新后重试')
      return
    }
    const values = await inspectionForm.validateFields()
    setSaving(true)
    try {
      const inspection = await createQualityInspectionDraft(
        compactParams({
          customer_key: activeCustomerKey || undefined,
          ...buildInspectionParams(values),
        })
      )
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          inspection?.id
        )) !== false
      message.success(
        attachmentSaved
          ? '来料质检草稿已创建'
          : '来料质检草稿已创建，未上传的附件请重新选择'
      )
      setSelectedRow(inspection)
      closeModal()
      resetBusinessPaginationCurrent(setPagination)
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建来料质检草稿'))
    } finally {
      setSaving(false)
    }
  }, [activeCustomerKey, closeModal, inspectionForm, referenceDataState])

  const markInspectionReturned = useCallback((inspectionID) => {
    const id = positiveInt(inspectionID)
    if (!id) return
    setReturnedInspectionIDs((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const openPurchaseReturn = useCallback(
    async (inspection) => {
      if (referenceDataState !== 'ready') {
        message.warning(
          referenceDataState === 'loading'
            ? '质检来源资料正在加载，请稍后再生成采购退货'
            : '质检来源资料加载失败，请先刷新当前页后重试'
        )
        return
      }
      if (
        !canCreatePurchaseReturn ||
        !isRejectedIncomingInspection(inspection)
      ) {
        message.warning('只有已判定不合格的来料质检单可以退供应商')
        return
      }
      const sourceReceipt = selectedRowPurchaseReceipt
      if (
        !canCreatePurchaseReturnFromRejectedInspection(
          inspection,
          sourceReceipt
        )
      ) {
        message.warning(
          '首次到货检验不合格只会阻止入库；只有已入库后追加检验不合格才可退供应商'
        )
        return
      }
      if (returnedInspectionIDs.has(inspection.id)) {
        message.info('该质检单已生成采购退货')
        return
      }
      setPurchaseReturnLoading(true)
      try {
        if (canReadPurchaseReturn) {
          const data = await listAllPurchaseReturns(
            compactParams({
              customer_key: activeCustomerKey || undefined,
              quality_inspection_id: inspection.id,
            })
          )
          const activeReturn = (
            Array.isArray(data?.purchase_returns) ? data.purchase_returns : []
          ).find(
            (item) => String(item?.status || '').toUpperCase() !== 'CANCELLED'
          )
          if (activeReturn) {
            markInspectionReturned(inspection.id)
            message.info('该质检单已生成采购退货')
            return
          }
        }
        setPurchaseReturnModal({ inspection })
      } catch (error) {
        message.error(getActionErrorMessage(error, '核对采购退货状态'))
      } finally {
        setPurchaseReturnLoading(false)
      }
    },
    [
      activeCustomerKey,
      canCreatePurchaseReturn,
      canReadPurchaseReturn,
      markInspectionReturned,
      referenceDataState,
      returnedInspectionIDs,
      selectedRowPurchaseReceipt,
    ]
  )

  const closePurchaseReturn = useCallback(() => {
    if (purchaseReturnInFlightRef.current) return
    setPurchaseReturnModal(null)
  }, [])

  const submitPurchaseReturn = useCallback(
    async (values) => {
      const inspection = purchaseReturnModal?.inspection
      if (
        purchaseReturnInFlightRef.current ||
        !isRejectedIncomingInspection(inspection)
      ) {
        return
      }
      let scope
      let attempt
      try {
        const payload = buildPurchaseReturnFromQualityInspectionPayload(
          values,
          inspection,
          activeCustomerKey
        )
        scope = `quality-purchase-return:${inspection.id}`
        attempt = purchaseReturnAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备采购退货'))
        return
      }

      purchaseReturnInFlightRef.current = true
      setPurchaseReturnLoading(true)
      try {
        const created = await createPurchaseReturnFromQualityInspection(
          attempt.params
        )
        if (
          Number(created?.id || 0) <= 0 ||
          Number(created?.quality_inspection_id || 0) !== inspection.id ||
          String(created?.status || '').toUpperCase() !== 'DRAFT'
        ) {
          const error = new Error('采购退货返回结果与当前质检单不一致')
          error.isInvalidResponse = true
          throw error
        }
        purchaseReturnAttemptsRef.current.settle(scope, attempt, null)
        markInspectionReturned(inspection.id)
        setPurchaseReturnModal(null)
        message.success('采购退货草稿已生成，请到采购退货记录核对并确认')
        await loadRows()
      } catch (error) {
        const retained = purchaseReturnAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '生成采购退货草稿'))
        }
      } finally {
        purchaseReturnInFlightRef.current = false
        setPurchaseReturnLoading(false)
      }
    },
    [activeCustomerKey, loadRows, markInspectionReturned, purchaseReturnModal]
  )

  const runInspectionAction = useCallback(
    async (inspection, action, successText) => {
      if (!inspection?.id) return
      setSaving(true)
      try {
        const nextInspection = await action({ id: inspection.id })
        setSelectedRow(nextInspection || inspection)
        message.success(successText)
        await loadRows()
      } catch (error) {
        message.error(getActionErrorMessage(error, successText))
      } finally {
        setSaving(false)
      }
    },
    [loadRows]
  )

  const handleDecision = useCallback(async () => {
    const inspection = inspectionModal?.inspection
    if (!inspection?.id) return
    const values = await decisionForm.validateFields()
    setSaving(true)
    try {
      let action = passQualityInspection
      let params = buildDecisionParams(inspection.id, values)
      let successText = '质量检验已判定合格'
      if (inspectionModal?.mode === 'reject') {
        action = rejectQualityInspection
        params = buildDecisionParams(inspection.id, values, 'REJECT')
        successText = '质量检验已判定不合格'
      } else if (inspectionModal?.mode === 'cancel') {
        action = cancelQualityInspection
        params = buildDecisionParams(inspection.id, values)
        successText = '质量检验已取消'
      }
      const nextInspection = await action(params)
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          nextInspection?.id || inspection.id
        )) !== false
      setSelectedRow(nextInspection || inspection)
      message.success(
        attachmentSaved ? successText : `${successText}，未上传的附件请重新选择`
      )
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '处理质量检验'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, decisionForm, inspectionModal, loadRows])

  const selectedRowLabel = selectedRow
    ? `${selectedRow.inspection_no || '质量检验单已关联'} / ${
        isProductionStageQualityInspection(selectedRow)
          ? String(selectedRow.wip_batch_no || '').trim() || '—'
          : referenceLabel(
              inventoryLotOptions,
              selectedRow.inventory_lot_id,
              '批次'
            )
      }`
    : '请先选择一张质量检验单'

  const modalTitle = {
    create: '生成来料质检草稿',
    pass: '判定合格',
    reject: '判定不合格',
    cancel: '取消质检',
  }[inspectionModal?.mode || 'create']

  const decisionIsProductionStage = isProductionStageQualityInspection(
    inspectionModal?.inspection
  )

  const modalDescription = {
    create:
      '入库准备通常已逐行生成待检记录；这里只为已取消等需要重建的采购入库行补建质检，材料、仓库和批次由来源行带出。',
    pass: decisionIsProductionStage
      ? '生产阶段质量关口当前只允许合格放行；让步接收需另有按关口审批策略和审计，在该能力落地前保持阻断。'
      : '选择合格或让步接收，并按来源记录估算不良比例；这里只登记质量结论，后续由对应来源规则处理。',
    reject:
      '记录不合格及来源的估算不良比例；后续返工、退货或阻断仍由对应来源业务办理。',
    cancel: '取消只关闭当前质检流程，不会直接改写库存数量或生产事实。',
  }[inspectionModal?.mode || 'create']

  const decisionSourceSummary = buildDecisionSourceSummary({
    inspection: inspectionModal?.inspection,
    allPurchaseReceiptItemOptions,
    inventoryLotOptions,
    materialOptions,
    productOptions,
    purchaseReceiptOptions,
  })

  const modalOkText = {
    create: '生成草稿',
    pass: '确认合格',
    reject: '确认不合格',
    cancel: '确认取消',
  }[inspectionModal?.mode || 'create']

  const exportColumns = useMemo(() => {
    const columns = buildQualityInspectionExportColumns({
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    })
    return applyEffectiveFieldPolicyFlags({
      adminProfile,
      moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
      columns,
    })
  }, [
    allPurchaseReceiptItemOptions,
    adminProfile,
    inventoryLotOptions,
    materialOptions,
    productOptions,
    purchaseReceiptOptions,
    warehouseOptions,
  ])

  const dataColumns = useMemo(
    () =>
      buildQualityInspectionDataColumns({
        allPurchaseReceiptItemOptions,
        inventoryLotOptions,
        materialOptions,
        productOptions,
        purchaseReceiptOptions,
        warehouseOptions,
      }),
    [
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    ]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const visibleDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [preferredColumnOrder, dataColumns]
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

  const exportQualityInspections = useCallback(() => {
    if (rows.length === 0) return
    downloadCSV({
      filename: `质量检验-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: exportColumns,
      rows,
    })
  }, [exportColumns, rows])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      resultFilter ||
      inspectionTypeFilter ||
      purchaseReceiptFilter ||
      materialFilter ||
      warehouseFilter ||
      lotFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routePurchaseOrderID ||
      routePurchaseReceiptID ||
      routeQualityInspectionID ||
      routeSourceType ||
      routeSourceID ||
      linkedKeyword
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setResultFilter('')
    setInspectionTypeFilter('')
    setPurchaseReceiptFilter('')
    setMaterialFilter('')
    setWarehouseFilter('')
    setLotFilter('')
    setDateFilterField('inspected_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])

  return (
    <BusinessPageLayout className="erp-v1-quality-inspections-page">
      <PageHeaderCard
        compact
        title="质量检验"
        description="质量检验集中办理采购到货、委外回货、出货关联成品和生产 WIP 分段关口的质量判定。生产 WIP 依次覆盖裁片、皮套、成品、针检、抽检及订单要求的客户验货，每张质检单只代表当前在制批次和当前关口。首次到货检验不合格可按来源行和部分数量办理退厂或补换；补换确认生成新的待收与待检记录，原收货不会因部分处置被整单取消。已入库后的不合格仍生成采购退货并形成库存追溯。"
        tags={[
          <Tag color="gold" key="hold">
            已提交：等待判定
          </Tag>,
          <Tag color="green" key="pass">
            通过：按来源规则继续
          </Tag>,
          <Tag color="red" key="reject">
            不合格：阻止对应后续
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总质检单', value: total },
          { key: 'current', label: '本页显示', value: rows.length },
          {
            key: 'submitted',
            label: '已提交',
            value: rows.filter((item) => item.status === 'SUBMITTED').length,
          },
          {
            key: 'rejected',
            label: '不合格',
            value: rows.filter((item) => item.status === 'REJECTED').length,
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
              placeholder="搜索质检单"
              searchHint="可搜索：质检单号、业务来源、批次"
              onChange={(event) => {
                if (
                  resolvedRouteKeyword ||
                  linkedKeyword ||
                  routeQualityInspectionID ||
                  routePurchaseOrderID ||
                  routePurchaseReceiptID ||
                  (routeSourceType && routeSourceID)
                ) {
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
              options={QUALITY_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={resultFilter}
              options={QUALITY_RESULT_FILTER_OPTIONS}
              onChange={(nextResult) => {
                setResultFilter(nextResult)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={inspectionTypeFilter}
              options={QUALITY_INSPECTION_TYPE_FILTER_OPTIONS}
              onChange={(nextType) => {
                const normalizedType = nextType || ''
                const routeKeysToClear = []
                setInspectionTypeFilter(normalizedType)
                if (normalizedType && normalizedType !== 'INCOMING') {
                  setPurchaseReceiptFilter('')
                  setMaterialFilter('')
                  routeKeysToClear.push(
                    'purchase_order_id',
                    'purchase_receipt_id'
                  )
                }
                if (
                  (routeSourceType || routeSourceID) &&
                  !isQualityInspectionRouteSourceCompatible(
                    normalizedType,
                    routeSourceType
                  )
                ) {
                  routeKeysToClear.push('source_type', 'source_id')
                }
                if (routeKeysToClear.length > 0) {
                  clearRouteContext(routeKeysToClear)
                }
                if (normalizedType === 'PRODUCTION_STAGE') {
                  setWarehouseFilter('')
                  setLotFilter('')
                }
                setSelectedRow(null)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={purchaseReceiptFilter}
              options={[
                { label: '全部入库单', value: '' },
                ...purchaseReceiptOptions,
              ]}
              placeholder="全部入库单"
              disabled={Boolean(
                inspectionTypeFilter && inspectionTypeFilter !== 'INCOMING'
              )}
              showSearch
              optionFilterProp="label"
              onChange={(nextReceipt) => {
                setPurchaseReceiptFilter(nextReceipt || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={materialFilter}
              options={[{ label: '全部材料', value: '' }, ...materialOptions]}
              placeholder="全部材料"
              disabled={Boolean(
                inspectionTypeFilter && inspectionTypeFilter !== 'INCOMING'
              )}
              showSearch
              optionFilterProp="label"
              onChange={(nextMaterial) => {
                setMaterialFilter(nextMaterial || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseFilter}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
              disabled={inspectionTypeFilter === 'PRODUCTION_STAGE'}
              showSearch
              optionFilterProp="label"
              onChange={(nextWarehouse) => {
                setWarehouseFilter(nextWarehouse || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={lotFilter}
              options={[
                { label: '全部批次', value: '' },
                ...inventoryLotOptions,
              ]}
              placeholder="全部批次"
              disabled={inspectionTypeFilter === 'PRODUCTION_STAGE'}
              showSearch
              optionFilterProp="label"
              onChange={(nextLot) => {
                setLotFilter(nextLot || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={QUALITY_DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(nextField) => {
                setDateFilterField(nextField || 'inspected_at')
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
            {routePurchaseOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_order_id'])}
              >
                已按采购订单筛选
              </Tag>
            ) : null}
            {routePurchaseReceiptID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_receipt_id'])}
              >
                已按采购入库筛选
              </Tag>
            ) : null}
            {routeQualityInspectionID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['quality_inspection_id'])}
              >
                已定位质检单
              </Tag>
            ) : null}
            {routeSourceType && routeSourceID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['source_type', 'source_id'])}
              >
                已按来源单据筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={rows.length === 0}
              onClick={exportQualityInspections}
            >
              导出筛选结果
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
          canCreate ? (
            <BusinessActionTooltip
              disabled={referenceDataState !== 'ready'}
              disabledReason="质检来源资料加载完成后可补建"
            >
              <ToolbarButton
                type="primary"
                className="erp-business-list-toolbar__primary-action"
                icon={<PlusOutlined />}
                disabled={referenceDataState !== 'ready'}
                onClick={openCreate}
              >
                补建来料质检
              </ToolbarButton>
            </BusinessActionTooltip>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="提交、判定和取消均由系统按质检规则处理；不会绕过来源规则直接改写库存数量或生产事实。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          {relatedMenuItems.length > 0 ? (
            <Dropdown
              trigger={['click']}
              destroyOnHidden
              menu={{
                items: relatedMenuItems,
                onClick: openRelatedTable,
              }}
            >
              <Button size="small" icon={<LinkOutlined />}>
                相关单据 <DownOutlined />
              </Button>
            </Dropdown>
          ) : null}
          <BusinessActionTooltip
            disabled={!selectedRow}
            disabledReason="请先选择一条质检记录"
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedRow}
              onClick={() => openQualityInspectionDetails(selectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {canUpdate && (!selectedRow || selectedRow.status === 'DRAFT') ? (
            <BusinessActionTooltip
              disabled={!selectedRow || saving}
              disabledReason={
                saving ? '当前操作完成后可提交' : '请先选择一条质检草稿'
              }
            >
              <Popconfirm
                title="确认提交质检并进入待判定状态？"
                onConfirm={() =>
                  runInspectionAction(
                    selectedRow,
                    submitQualityInspection,
                    '质检已提交'
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  icon={<FileDoneOutlined />}
                  disabled={!selectedRow || saving}
                >
                  提交质检
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate &&
          (!selectedRow || selectedRow.status === 'SUBMITTED') ? (
            <>
              <BusinessActionTooltip
                disabled={!selectedRow || saving}
                disabledReason={
                  saving
                    ? '当前操作完成后可判定'
                    : '请先选择一条待判定质检记录'
                }
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!selectedRow || saving}
                  onClick={() => openDecision('pass', selectedRow)}
                >
                  判定合格
                </Button>
              </BusinessActionTooltip>
              <BusinessActionTooltip
                disabled={!selectedRow || saving}
                disabledReason={
                  saving
                    ? '当前操作完成后可判定'
                    : '请先选择一条待判定质检记录'
                }
              >
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  disabled={!selectedRow || saving}
                  onClick={() => openDecision('reject', selectedRow)}
                >
                  判定不合格
                </Button>
              </BusinessActionTooltip>
            </>
          ) : null}
          {canCreatePurchaseReturn ? (
            <Button
              size="small"
              disabled={
                !selectedRow ||
                !selectedRowCanCreateRejectionDisposition ||
                selectedRowPurchaseReceiptLoading ||
                saving
              }
              title={
                selectedRow && isRejectedIncomingInspection(selectedRow)
                  ? selectedRowPurchaseReceiptLoading
                    ? '正在核对来源收货状态'
                    : selectedRowCanCreateRejectionDisposition
                      ? undefined
                      : '该入口只适用于尚未入库的首次来料不合格'
                  : '请选择已判定不合格的来料质检单'
              }
              onClick={() => setRejectionDispositionOpen(true)}
            >
              首次来料退厂 / 补换
            </Button>
          ) : null}
          {selectedRow?.status === 'REJECTED' && selectedRow?.source_type === 'OUTSOURCING_FACT' && canReadOutsourcingDisposition ? (
            <Button size="small" danger onClick={() => setOutsourcingDispositionOpen(true)}>
              委外返厂 / 返工
            </Button>
          ) : null}
          {selectedRow?.status === 'REJECTED' && Number(selectedRow?.production_wip_batch_id || 0) > 0 && canHandleQualityException ? (
            <Button size="small" danger onClick={() => setProductionExceptionOpen(true)}>
              申请报废 / 让步
            </Button>
          ) : null}
          {canCreatePurchaseReturn ? (
            <Button
              size="small"
              icon={<RollbackOutlined />}
              disabled={
                !selectedRow ||
                !selectedRowCanCreatePurchaseReturn ||
                returnedInspectionIDs.has(selectedRow.id) ||
                selectedRowPurchaseReceiptLoading ||
                referenceDataState !== 'ready' ||
                purchaseReturnLoading
              }
              title={
                selectedRow && isRejectedIncomingInspection(selectedRow)
                  ? selectedRowPurchaseReceiptLoading
                    ? '正在核对来源收货状态'
                    : referenceDataState !== 'ready'
                      ? referenceDataState === 'loading'
                        ? '正在加载质检来源资料'
                        : '质检来源资料加载失败，请刷新当前页后重试'
                      : !selectedRowPurchaseReceipt
                        ? '未能确认来源收货已入库，暂不能生成采购退货'
                        : !selectedRowCanCreatePurchaseReturn
                          ? '首次到货检验不合格只阻止入库，不在此生成采购退货'
                          : undefined
                  : undefined
              }
              onClick={() => openPurchaseReturn(selectedRow)}
            >
              {selectedRow && returnedInspectionIDs.has(selectedRow.id)
                ? '已生成退货'
                : '退供应商'}
            </Button>
          ) : null}
          {canUpdate &&
          (!selectedRow ||
            ['DRAFT', 'SUBMITTED'].includes(selectedRow.status)) ? (
              <BusinessActionTooltip
                disabled={!selectedRow || saving}
                disabledReason={
                saving ? '当前操作完成后可取消' : '请先选择一条质检记录'
              }
              >
                <Button
                  size="small"
                  icon={<CloseCircleOutlined />}
                  disabled={!selectedRow || saving}
                  onClick={() => openDecision('cancel', selectedRow)}
                >
                  取消质检
                </Button>
              </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1600 }}
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
        onOpenRecord={openQualityInspectionDetails}
        emptyDescription="暂无质量检验单"
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="质量检验列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <QualityInspectionPurchaseReturnModal
        open={Boolean(purchaseReturnModal)}
        inspection={purchaseReturnModal?.inspection}
        sourceSummary={purchaseReturnSourceSummary}
        loading={purchaseReturnLoading}
        referenceDataReady={referenceDataState === 'ready'}
        onCancel={closePurchaseReturn}
        onSubmit={submitPurchaseReturn}
      />

      <PurchaseRejectionDispositionModal
        open={rejectionDispositionOpen}
        inspection={selectedRow}
        canPost={canPostPurchaseReturn}
        canCancel={canCancelPurchaseReturn}
        onClose={() => setRejectionDispositionOpen(false)}
        onChanged={() => loadRows()}
      />

      <OutsourcingReturnDispositionModal
        open={outsourcingDispositionOpen}
        inspection={selectedRow}
        canCreate={canHandleQualityException}
        canPost={canPostOutsourcingDisposition}
        canCancel={canCancelOutsourcingDisposition}
        onClose={() => setOutsourcingDispositionOpen(false)}
        onChanged={() => loadRows()}
      />

      <ProductionExceptionRequestModal
        open={productionExceptionOpen}
        inspection={selectedRow}
        onClose={() => setProductionExceptionOpen(false)}
        onChanged={() => loadRows()}
      />

      <BusinessRecordDetailsModal
        columns={visibleDataColumns}
        description="查看当前质检单的来源、批次、检验状态和判定结果；如需提交、判定或取消，请使用列表上方的当前操作区。"
        open={Boolean(detailInspection)}
        record={detailInspection}
        title="质量检验详情"
        onClose={closeQualityInspectionDetails}
      >
        <BusinessAttachmentPanel
          ownerType="quality_inspection"
          ownerId={detailInspection?.id}
          title="质检附件"
          description="查看不良照片、检验报告、让步说明或批次异常证据。"
          canUpload={false}
          canDelete={false}
          variant="inline"
        />
      </BusinessRecordDetailsModal>

      <BusinessFormModal
        title={modalTitle}
        description={modalDescription}
        open={Boolean(inspectionModal)}
        onCancel={closeModal}
        onOk={
          inspectionModal?.mode === 'create'
            ? handleCreateInspection
            : handleDecision
        }
        confirmLoading={saving}
        okButtonProps={{
          disabled:
            inspectionModal?.mode === 'create' &&
            referenceDataState !== 'ready',
        }}
        destroyOnHidden
        okText={modalOkText}
        cancelText="关闭"
      >
        {inspectionModal?.mode === 'create' ? (
          <>
            {selectedPurchaseReceipt ? (
              <Alert
                className="erp-business-source-summary"
                showIcon
                type={selectedPurchaseReceiptItem ? 'info' : 'warning'}
                message={`来源采购入库：${
                  selectedPurchaseReceipt.receipt_no || '采购入库已关联'
                }`}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      {[
                        `供应商：${selectedPurchaseReceipt.supplier_name || '-'}`,
                        `状态：${statusText(
                          selectedPurchaseReceipt.status,
                          PURCHASE_RECEIPT_STATUS_LABELS,
                          '状态待确认'
                        )}`,
                        selectedPurchaseReceiptItem
                          ? `来源行：${
                              selectedPurchaseReceiptItem.source_line_no ||
                              '入库明细已关联'
                            }`
                          : '来源行：未选择',
                      ].join('；')}
                    </Text>
                    {selectedPurchaseReceiptItem ? (
                      <Text type="secondary">
                        {[
                          `到货数量：${formatQuantity(
                            selectedPurchaseReceiptItem.quantity
                          )}`,
                          `材料：${referenceLabel(
                            materialOptions,
                            selectedPurchaseReceiptItem.material_id,
                            '材料'
                          )}`,
                          `仓库：${referenceLabel(
                            warehouseOptions,
                            selectedPurchaseReceiptItem.warehouse_id,
                            '仓库'
                          )}`,
                          selectedPurchaseReceiptItem.lot_id
                            ? `批次：${referenceLabel(
                                inventoryLotOptions,
                                selectedPurchaseReceiptItem.lot_id,
                                '批次'
                              )}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join('；')}
                      </Text>
                    ) : (
                      <Text type="secondary">
                        请选择采购入库行后再生成质检草稿，材料、仓库和批次会按来源行带出。
                      </Text>
                    )}
                    <Text type="secondary">
                      当前质检单按采购入库行建单；本次送检数量和已检数量暂未记录，页面不会自行补造。
                    </Text>
                  </Space>
                }
              />
            ) : null}
            <QualityInspectionCreateForm
              form={inspectionForm}
              purchaseReceiptOptions={purchaseReceiptOptions}
              purchaseReceiptItemOptions={purchaseReceiptItemOptions}
              disabled={referenceDataState !== 'ready'}
              onReceiptChange={handleReceiptChange}
            />
          </>
        ) : (
          <>
            <Alert
              className="erp-business-source-summary"
              showIcon
              type="info"
              message={`来源单据：${decisionSourceSummary.sourceNo}`}
              description={
                <Space direction="vertical" size={2}>
                  <Text>{decisionSourceSummary.primary}</Text>
                  {decisionSourceSummary.secondary ? (
                    <Text type="secondary">
                      {decisionSourceSummary.secondary}
                    </Text>
                  ) : null}
                </Space>
              }
            />
            <QualityInspectionDecisionForm
              form={decisionForm}
              mode={inspectionModal?.mode}
              allowConcession={!decisionIsProductionStage}
            />
          </>
        )}
        <BusinessAttachmentPanel
          ref={inspectionAttachmentRef}
          ownerType="quality_inspection"
          ownerId={inspectionModal?.inspection?.id}
          title="质检附件"
          description="上传不良照片、检验报告、让步说明或批次异常证据；附件不能代替质检处理。"
          canUpload={canCreate || canUpdate}
          canDelete={canUpdate}
          variant="inline"
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
