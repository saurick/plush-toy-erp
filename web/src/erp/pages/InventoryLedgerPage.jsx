import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AuditOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  ReconciliationOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  Popconfirm,
  Space,
  Tag,
} from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import WorkflowSourceProgressButton from '../components/workflow/WorkflowSourceProgressButton.jsx'
import { showProcessSubmissionReceipt } from '../components/workflow/ProcessSubmissionReceipt.jsx'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import useBusinessPageState from '../hooks/useBusinessPageState'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import Table from '@/common/components/table/AppTable'
import Tabs from '@/common/components/navigation/SlidingTabs'
import ProductIdentity from '../components/master-data/ProductIdentity.jsx'
import {
  MATERIAL_STOCK_CATEGORY_OPTIONS,
  materialStockCategoryLabel,
} from '../utils/warehouseClassification.mjs'
import WarehouseSettingsModal from '../components/inventory/WarehouseSettingsModal.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listAllInventoryBalances,
  listAllInventoryLots,
  listAllInventoryTxns,
  listInventoryBalances,
  createInventoryOperation,
  getInventoryOperation,
  listInventoryLots,
  listInventoryTxns,
  saveInventoryOperationDraft,
} from '../api/inventoryApi.mjs'
import {
  executeInventoryAdjustmentSubmit,
  findExceptionProcessActiveNode,
  getInventoryAdjustmentApprovalProcess,
  startInventoryAdjustmentApprovalProcess,
} from '../api/customerConfigApi.mjs'
import {
  listProductSKUs,
  listUnits,
  listMaterials,
  listProducts,
  listWarehouses,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessActionTooltip,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  normalizeBusinessTableColumns,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import InventoryDistributionOverview from '../components/business-visualizations/InventoryDistributionOverview.jsx'
import { BusinessViewSwitch } from '../components/business-visualizations/BusinessVisualizationFrame.jsx'
import { BusinessHelpLabel } from '../components/help/BusinessContextHelp.jsx'
import InventoryOperationModal from '../components/inventory/InventoryOperationModal.jsx'
import { executeInventoryOperationTransition } from '../utils/inventoryOperationTransition.mjs'
import InventoryOperationRecordsModal from '../components/inventory/InventoryOperationRecordsModal.jsx'
import ExceptionProcessRecoveryButton from '../components/workflow/ExceptionProcessRecoveryButton.jsx'
import {
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import { compactParams, trimOptional } from '../utils/sourceDocumentValues.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  businessSourceRouteFor,
  sourceRouteFor,
} from '../utils/businessSourceNavigation.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import { resolveRelatedRecordActionAvailability } from '../utils/operationalActionAvailability.mjs'
import {
  inventoryLotOption,
  materialOption,
  productOption,
  productSKUOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  searchParamPositiveInt,
  searchParamText,
} from '../utils/routeQuery.mjs'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
} from '../utils/sourceBusinessAction.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import useBusinessVisualizationData from '../hooks/useBusinessVisualizationData.js'

const VIEW_BALANCES = 'balances'
const VIEW_LOTS = 'lots'
const VIEW_TXNS = 'txns'
const INVENTORY_OPERATION_SESSION_PREFIX =
  'plush-erp:inventory-operation:last:v1:'
const INVENTORY_OPERATION_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SUBMITTED: '待审批',
  APPROVED: '已批准待过账',
  REJECTED: '已驳回',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const VIEW_ITEMS = [
  { key: VIEW_BALANCES, label: '库存余额', children: null },
  { key: VIEW_LOTS, label: '库存批次', children: null },
  { key: VIEW_TXNS, label: '库存变动记录', children: null },
]

const VIEW_LABELS = Object.freeze({
  [VIEW_BALANCES]: '库存余额',
  [VIEW_LOTS]: '库存批次',
  [VIEW_TXNS]: '库存变动记录',
})

const SUBJECT_TYPE_OPTIONS = [
  { label: '全部存货类型', value: '' },
  { label: '材料', value: 'MATERIAL' },
  { label: '成品', value: 'PRODUCT' },
]

const LOT_STATUS_OPTIONS = [
  { label: '全部批次状态', value: '' },
  { label: '可用', value: 'ACTIVE' },
  { label: '冻结', value: 'HOLD' },
  { label: '不合格', value: 'REJECTED' },
  { label: '停用', value: 'DISABLED' },
]

const TXN_TYPE_OPTIONS = [
  { label: '全部变动类型', value: '' },
  { label: '入库', value: 'IN' },
  { label: '出库', value: 'OUT' },
  { label: '调增', value: 'ADJUST_IN' },
  { label: '调减', value: 'ADJUST_OUT' },
  { label: '调拨入', value: 'TRANSFER_IN' },
  { label: '调拨出', value: 'TRANSFER_OUT' },
  { label: '撤销调整', value: 'REVERSAL' },
]

const SOURCE_TYPE_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '采购入库', value: 'PURCHASE_RECEIPT' },
  { label: '采购退货', value: 'PURCHASE_RETURN' },
  { label: '入库调整', value: 'PURCHASE_RECEIPT_ADJUSTMENT' },
  { label: '出货单', value: 'SHIPMENT' },
  { label: '生产记录', value: 'PRODUCTION_FACT' },
  { label: '委外记录', value: 'OUTSOURCING_FACT' },
]

const LOT_DATE_FILTER_OPTIONS = [{ label: '接收日期', value: 'received_at' }]
const TXN_DATE_FILTER_OPTIONS = [{ label: '发生时间', value: 'occurred_at' }]

const SUBJECT_TYPE_LABELS = Object.freeze({
  MATERIAL: '材料',
  PRODUCT: '成品',
})

const LOT_STATUS_LABELS = Object.freeze({
  ACTIVE: '可用',
  HOLD: '冻结',
  REJECTED: '不合格',
  DISABLED: '停用',
})

const LOT_STATUS_COLORS = Object.freeze({
  ACTIVE: 'green',
  HOLD: 'gold',
  REJECTED: 'red',
  DISABLED: 'default',
})

const TXN_TYPE_LABELS = Object.freeze({
  IN: '入库',
  OUT: '出库',
  ADJUST_IN: '调增',
  ADJUST_OUT: '调减',
  TRANSFER_IN: '调拨入',
  TRANSFER_OUT: '调拨出',
  REVERSAL: '撤销调整',
})

const TXN_TYPE_COLORS = Object.freeze({
  IN: 'green',
  OUT: 'red',
  ADJUST_IN: 'blue',
  ADJUST_OUT: 'orange',
  TRANSFER_IN: 'cyan',
  TRANSFER_OUT: 'purple',
  REVERSAL: 'default',
})

const SOURCE_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    SOURCE_TYPE_OPTIONS.filter((item) => item.value).map((item) => [
      item.value,
      item.label,
    ])
  )
)

function dash(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function subjectTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return <Tag>{SUBJECT_TYPE_LABELS[key] || '其他存货'}</Tag>
}

function subjectTypeText(value) {
  const key = String(value || '').trim()
  return SUBJECT_TYPE_LABELS[key] || (key ? '其他存货' : '')
}

function lotStatusTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={LOT_STATUS_COLORS[key] || 'default'}>
      {LOT_STATUS_LABELS[key] || '批次状态'}
    </Tag>
  )
}

function lotStatusText(value) {
  const key = String(value || '').trim()
  return LOT_STATUS_LABELS[key] || (key ? '批次状态' : '')
}

function txnTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={TXN_TYPE_COLORS[key] || 'default'}>
      {TXN_TYPE_LABELS[key] || '库存变动'}
    </Tag>
  )
}

function txnTypeText(value) {
  const key = String(value || '').trim()
  return TXN_TYPE_LABELS[key] || (key ? '库存变动' : '')
}

function sourceTypeText(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  if (!key) return ''
  return SOURCE_TYPE_LABELS[key] || '其他来源'
}

function directionTag(value) {
  const direction = Number(value || 0)
  if (direction > 0) return <Tag color="green">增加</Tag>
  if (direction < 0) return <Tag color="red">扣减</Tag>
  return '-'
}

function directionText(value) {
  const direction = Number(value || 0)
  if (direction > 0) return '增加'
  if (direction < 0) return '扣减'
  return ''
}

function formatQuantity(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function linkedBusinessRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `${label}已关联`
}

function formatSourceDocumentRef(record = {}) {
  const sourceNo = String(
    record.source_no ||
      record.document_no ||
      record.order_no ||
      record.receipt_no ||
      record.shipment_no ||
      ''
  ).trim()
  if (sourceNo) return sourceNo
  return sourceTypeText(record.source_type) ? '未提供业务单号' : '-'
}

function relationRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `已关联${label}`
}

function getRowsFromData(view, data) {
  if (view === VIEW_LOTS) {
    return data.inventory_lots
  }
  if (view === VIEW_TXNS) {
    return data.inventory_txns
  }
  return data.inventory_balances
}

function selectedLabelFor(view, row) {
  if (!row) return '请先选择一条库存记录'
  if (view === VIEW_LOTS) {
    return `批次 ${row.lot_no || '已登记批次'} / ${
      lotStatusText(row.status) || '-'
    }`
  }
  if (view === VIEW_TXNS) {
    return `库存变动 ${sourceTypeText(row.source_type) || txnTypeText(row.txn_type) || '已记录'}`
  }
  return `库存项已登记 / 批次 ${row.lot_no || (row.lot_id ? '已关联批次' : '-')}`
}

function canOpenSourceDocument(record = {}) {
  return Boolean(businessSourceRouteFor(record.source_type, record.source_id))
}

export default function InventoryLedgerPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const requestControllersRef = useRef({})
  const requestSequenceRef = useRef({})
  const operationAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const [activeView, setActiveView] = useBusinessPageState(
    'activeView',
    VIEW_BALANCES
  )
  const [balanceDisplay, setBalanceDisplay] = useBusinessPageState(
    'balanceDisplay',
    'list'
  )
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useBusinessPageState('keyword', '')
  const [subjectType, setSubjectType] = useBusinessPageState('subjectType', '')
  const [stockCategory, setStockCategory] = useBusinessPageState(
    'stockCategory',
    ''
  )
  const [warehouseSettingsOpen, setWarehouseSettingsOpen] = useState(false)
  const [subjectID, setSubjectID] = useBusinessPageState('subjectID', '')
  const [productSkuID, setProductSkuID] = useBusinessPageState(
    'productSkuID',
    ''
  )
  const [warehouseID, setWarehouseID] = useBusinessPageState('warehouseID', '')
  const [lotID, setLotID] = useBusinessPageState('lotID', '')
  const [lotStatus, setLotStatus] = useBusinessPageState('lotStatus', '')
  const [txnType, setTxnType] = useBusinessPageState('txnType', '')
  const [sourceType, setSourceType] = useBusinessPageState('sourceType', '')
  const [dateFilterStart, setDateFilterStart] = useBusinessPageState(
    'dateFilterStart',
    ''
  )
  const [dateFilterEnd, setDateFilterEnd] = useBusinessPageState(
    'dateFilterEnd',
    ''
  )
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [pagination, setPagination] = useBusinessPageState('pagination', {
    current: 1,
    pageSize: 20,
  })
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const [operationType, setOperationType] = useState('')
  const [operationLoading, setOperationLoading] = useState(false)
  const [currentOperation, setCurrentOperation] = useState(null)
  const [editingOperation, setEditingOperation] = useState(null)
  const [operationRecordsOpen, setOperationRecordsOpen] = useState(false)
  const [operationRecoveryError, setOperationRecoveryError] = useState('')
  const [operationCancelOpen, setOperationCancelOpen] = useState(false)
  const [operationCancelReason, setOperationCancelReason] = useState('')
  const routeView = searchParamText(searchParams, 'view')
  const routeLotID = searchParamPositiveInt(searchParams, 'lot_id')
  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')
  const routeInventoryOperationID = searchParamPositiveInt(
    searchParams,
    'inventory_operation_id'
  )
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const allowedMenuPaths = useMemo(
    () => outletContext?.allowedMenuPaths || [],
    [outletContext?.allowedMenuPaths]
  )
  const operationSessionKey = useMemo(() => {
    const adminID = Number(adminProfile?.id || 0)
    const customerKey = String(
      adminProfile?.effective_session?.customer?.key || 'default'
    ).trim()
    return adminID > 0
      ? `${INVENTORY_OPERATION_SESSION_PREFIX}${adminID}:${customerKey}`
      : ''
  }, [adminProfile])
  const canCreateInventoryOperation = hasActionPermission(
    adminProfile,
    PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE
  )
  const canApproveInventoryOperation = hasActionPermission(
    adminProfile,
    PermissionCode.WAREHOUSE_ADJUSTMENT_APPROVE
  )
  const canRecoverProcess = hasActionPermission(
    adminProfile,
    PermissionCode.PROCESS_RUNTIME_RECOVER
  )
  const customerKey = String(
    adminProfile?.effective_session?.customer?.key || ''
  ).trim()
  const currentAdminID = Number(adminProfile?.id || 0)
  const canReadInventory = hasActionPermission(
    adminProfile,
    PermissionCode.WAREHOUSE_INVENTORY_READ
  )
  const canReadMaterials = hasActionPermission(adminProfile, PermissionCode.MATERIAL_READ)
  const canReadProducts = hasActionPermission(adminProfile, PermissionCode.PRODUCT_READ)
  const canReadProductSKUs = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCT_SKU_READ
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

  const beginLatestRequest = useCallback((key) => {
    requestControllersRef.current[key]?.abort()
    const controller = new AbortController()
    const nextSequence = Number(requestSequenceRef.current[key] || 0) + 1
    requestControllersRef.current[key] = controller
    requestSequenceRef.current[key] = nextSequence

    return {
      signal: controller.signal,
      isCurrent: () =>
        requestControllersRef.current[key] === controller &&
        requestSequenceRef.current[key] === nextSequence &&
        !controller.signal.aborted,
      finish: () => {
        if (requestControllersRef.current[key] === controller) {
          delete requestControllersRef.current[key]
        }
      },
    }
  }, [])

  useEffect(() => {
    const controllers = requestControllersRef.current
    return () => {
      Object.values(controllers).forEach((controller) => {
        controller?.abort()
      })
    }
  }, [])

  const rememberInventoryOperation = useCallback(
    (operation) => {
      setCurrentOperation(operation || null)
      setOperationRecoveryError('')
      if (!operationSessionKey || !operation?.id) return
      window.sessionStorage.setItem(operationSessionKey, String(operation.id))
    },
    [operationSessionKey]
  )

  const recoverInventoryOperation = useCallback(
    async (operationID, { quiet = false } = {}) => {
      const id = Number(operationID || 0)
      if (!id) return null
      try {
        const operation = await getInventoryOperation({ id })
        if (!operation?.id) throw new Error('库存作业回执不完整')
        rememberInventoryOperation(operation)
        return operation
      } catch (error) {
        const text = getActionErrorMessage(error, '恢复最近库存作业')
        setOperationRecoveryError(text)
        if (!quiet) message.error(text)
        return null
      }
    },
    [rememberInventoryOperation]
  )

  useEffect(() => {
    if (!operationSessionKey) return
    const operationID = Number(
      window.sessionStorage.getItem(operationSessionKey) || 0
    )
    if (operationID > 0) {
      recoverInventoryOperation(operationID, { quiet: true })
    }
  }, [operationSessionKey, recoverInventoryOperation])
  useEffect(() => {
    if (routeInventoryOperationID > 0) {
      recoverInventoryOperation(routeInventoryOperationID)
    }
  }, [recoverInventoryOperation, routeInventoryOperationID])

  const inventoryCommonParams = useMemo(
    () =>
      compactParams({
        subject_type: subjectType,
        stock_category: stockCategory || undefined,
        subject_id: subjectID || undefined,
        product_sku_id: productSkuID || undefined,
        warehouse_id: warehouseID || undefined,
        lot_id: lotID || routeLotID || undefined,
        keyword: trimOptional(
          linkedDocumentRequestKeyword({
            localKeyword: keyword,
            linkedKeyword,
            hasExactContext: Boolean(
              routeLotID || (routeSourceType && routeSourceID)
            ),
          })
        ),
      }),
    [
      keyword,
      linkedKeyword,
      lotID,
      productSkuID,
      routeLotID,
      routeSourceID,
      routeSourceType,
      subjectID,
      stockCategory,
      subjectType,
      warehouseID,
    ]
  )

  const loadInventoryList = useCallback(
    ({ signal, all = false }) => {
      const commonParams = {
        ...inventoryCommonParams,
        ...(all ? {} : getBusinessPaginationParams(pagination)),
      }
      if (activeView === VIEW_LOTS) {
        const list = all ? listAllInventoryLots : listInventoryLots
        return list(
          compactParams({
            ...commonParams,
            status: lotStatus,
            date_field: 'received_at',
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
          }),
          { signal }
        )
      }
      if (activeView === VIEW_TXNS) {
        const localSourceType = trimOptional(sourceType)
        const routeSourceMatchesLocal =
          !localSourceType ||
          localSourceType.toUpperCase() ===
            String(routeSourceType || '')
              .trim()
              .toUpperCase()
        const list = all ? listAllInventoryTxns : listInventoryTxns
        return list(
          compactParams({
            ...commonParams,
            txn_type: txnType,
            source_type: localSourceType || routeSourceType || undefined,
            source_id: routeSourceMatchesLocal
              ? routeSourceID || undefined
              : undefined,
            date_field: 'occurred_at',
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
          }),
          { signal }
        )
      }
      const list = all ? listAllInventoryBalances : listInventoryBalances
      return list(commonParams, { signal })
    },
    [
      activeView,
      dateFilterEnd,
      dateFilterStart,
      inventoryCommonParams,
      lotStatus,
      pagination,
      routeSourceID,
      routeSourceType,
      sourceType,
      txnType,
    ]
  )

  const loadDistributionBalances = useCallback(
    async ({ signal }) => {
      const data = await loadInventoryList({ signal, all: true })
      return getRowsFromData(VIEW_BALANCES, data)
    },
    [loadInventoryList]
  )

  const distributionData = useBusinessVisualizationData({
    enabled: activeView === VIEW_BALANCES && balanceDisplay === 'distribution',
    load: loadDistributionBalances,
    actionLabel: '加载仓库库存分布',
  })
  const reloadDistributionData = distributionData.reload

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    if (!canReadInventory) {
      if (request.isCurrent()) {
        setRows([])
        setTotal(0)
        setSelectedRow(null)
      }
      request.finish()
      return
    }
    setLoading(true)
    try {
      const data = await loadInventoryList({ signal: request.signal })
      if (!request.isCurrent()) {
        return
      }
      const nextRows = getRowsFromData(activeView, data)
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载库存台账'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [activeView, beginLatestRequest, canReadInventory, loadInventoryList])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    if (routeView && VIEW_LABELS[routeView] && routeView !== activeView) {
      setActiveView(routeView)
      setSelectedRow(null)
      setDetailRecord(null)
    }
  }, [activeView, routeView, setActiveView])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() => {
      if (activeView === VIEW_BALANCES && balanceDisplay === 'distribution') {
        reloadDistributionData()
      }
      return loadRows()
    })
  }, [
    activeView,
    balanceDisplay,
    loadRows,
    outletContext,
    reloadDistributionData,
  ])

  const resetCurrentPage = useCallback(() => {
    resetBusinessPaginationCurrent(setPagination)
  }, [setPagination])

  const handleViewChange = useCallback(
    (nextView) => {
      setActiveView(nextView)
      if (nextView !== VIEW_BALANCES) setBalanceDisplay('list')
      setSelectedRow(null)
      setDetailRecord(null)
      setDateFilterStart('')
      setDateFilterEnd('')
      resetCurrentPage()
    },
    [
      resetCurrentPage,
      setActiveView,
      setBalanceDisplay,
      setDateFilterEnd,
      setDateFilterStart,
    ]
  )

  const activeLabel = VIEW_LABELS[activeView]
  const inventoryBalanceSwitch = (
    <BusinessViewSwitch
      value={balanceDisplay}
      options={[
        { value: 'list', label: '余额明细' },
        { value: 'distribution', label: '仓库分布' },
      ]}
      onChange={setBalanceDisplay}
    />
  )
  const openInventoryDetails = useCallback((record) => {
    if (!record?.id) return
    setSelectedRow(record)
    setDetailRecord(record)
  }, [])
  const selectedRowKey = selectedRow
    ? `${activeView}-${selectedRow.id}`
    : undefined
  const relatedMenuItems = useMemo(() => {
    if (!selectedRow) return []
    const sourcePath = businessSourceRouteFor(
      selectedRow.source_type,
      selectedRow.source_id
    )
    if (
      activeView === VIEW_TXNS &&
      canOpenSourceDocument(selectedRow) &&
      canOpenRelatedPath(sourcePath)
    ) {
      return [{ key: 'source', label: '来源单据' }]
    }
    return []
  }, [activeView, canOpenRelatedPath, selectedRow])
  const hasRelatedCapability =
    activeView === VIEW_TXNS &&
    [
      'SALES_ORDER',
      'PRODUCTION_ORDER',
      'PRODUCTION_FACT',
      'OUTSOURCING_ORDER',
      'OUTSOURCING_FACT',
      'PURCHASE_ORDER',
      'PURCHASE_RECEIPT',
      'QUALITY_INSPECTION',
      'SHIPMENT',
    ].some((sourceTypeValue) =>
      canOpenRelatedPath(sourceRouteFor(sourceTypeValue))
    )
  const relatedActionAvailability = resolveRelatedRecordActionAvailability({
    authorized: hasRelatedCapability,
    record: selectedRow,
    itemCount: relatedMenuItems.length,
  })

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    if (key === 'source') {
      const targetPath = businessSourceRouteFor(
        selectedRow.source_type,
        selectedRow.source_id,
        {
          keyword: selectedRow.source_no,
          source: 'inventory-ledger',
        }
      )
      if (targetPath) navigate(targetPath)
    }
  }

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['source_type', 'source_id', 'lot_id']
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetCurrentPage()
    },
    [resetCurrentPage, searchParams, setSearchParams]
  )

  const loadReferenceOptions = useCallback(async () => {
    const request = beginLatestRequest('references')
    try {
      const [
        materialResult,
        productResult,
        productSKUResult,
        unitResult,
        warehouseResult,
        lotResult,
      ] = await Promise.all([
        canReadMaterials
          ? listMaterials(
              { limit: 500, active_only: true },
              { signal: request.signal }
            )
          : Promise.resolve({ materials: [] }),
        canReadProducts
          ? listProducts(
              { limit: 500, active_only: true },
              { signal: request.signal }
            )
          : Promise.resolve({ products: [] }),
        canReadProductSKUs
          ? listProductSKUs({ limit: 500 }, { signal: request.signal })
          : Promise.resolve({ product_skus: [] }),
        canReadMaterials
          ? listUnits({ limit: 500 }, { signal: request.signal })
          : Promise.resolve({ units: [] }),
        canReadInventory
          ? listWarehouses(
              { limit: 500, active_only: true },
              { signal: request.signal }
            )
          : Promise.resolve({ warehouses: [] }),
        canReadInventory
          ? listInventoryLots({ limit: 500 }, { signal: request.signal })
          : Promise.resolve({ inventory_lots: [] }),
      ])
      if (!request.isCurrent()) {
        return
      }
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setProductSKUs(
        Array.isArray(productSKUResult?.product_skus)
          ? productSKUResult.product_skus
          : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载库存筛选资料'))
      setMaterials([])
      setProducts([])
      setProductSKUs([])
      setUnits([])
      setWarehouses([])
      setInventoryLots([])
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    canReadInventory,
    canReadMaterials,
    canReadProductSKUs,
    canReadProducts,
  ])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const productSKUOptions = useMemo(() => {
    const selectedProductID = Number(subjectID || 0)
    const source =
      selectedProductID > 0
        ? productSKUs.filter(
            (item) => Number(item?.product_id || 0) === selectedProductID
          )
        : productSKUs
    return uniqueReferenceOptions(source, productSKUOption)
  }, [productSKUs, subjectID])
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const subjectOptions = useMemo(() => {
    if (subjectType === 'PRODUCT') {
      return productOptions
    }
    if (subjectType === 'MATERIAL') {
      return materialOptions
    }
    return []
  }, [materialOptions, productOptions, subjectType])
  const subjectTypeOptions = useMemo(
    () =>
      SUBJECT_TYPE_OPTIONS.filter(
        (option) =>
          !option.value ||
          (option.value === 'MATERIAL' && canReadMaterials) ||
          (option.value === 'PRODUCT' && canReadProducts)
      ),
    [canReadMaterials, canReadProducts]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const warehouseFilterOptions = useMemo(() => {
    const selectedID = Number(warehouseID || 0)
    if (
      selectedID <= 0 ||
      warehouseOptions.some(
        (option) => Number(option.value || 0) === selectedID
      )
    ) {
      return warehouseOptions
    }
    return [
      ...warehouseOptions,
      { value: selectedID, label: `仓库 #${selectedID}（未启用）` },
    ]
  }, [warehouseID, warehouseOptions])
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const openInventoryOperation = useCallback(
    (type) => {
      if (!selectedRow || activeView !== VIEW_BALANCES) {
        message.warning('请先在库存余额中选择一条库存记录')
        return
      }
      setEditingOperation(null)
      setOperationType(type)
    },
    [activeView, selectedRow]
  )

  const submitInventoryOperation = useCallback(
    async (values) => {
      if (!selectedRow || !operationType) return
      const draftItem = Array.isArray(values?.items) ? values.items[0] : null
      if (!draftItem) return
      const item = compactParams({
        line_no: '1',
        subject_type: selectedRow.subject_type,
        subject_id: selectedRow.subject_id,
        product_sku_id: selectedRow.product_sku_id || undefined,
        from_warehouse_id: selectedRow.warehouse_id,
        from_lot_id: selectedRow.lot_id || undefined,
        to_warehouse_id: draftItem.to_warehouse_id || undefined,
        unit_id: selectedRow.unit_id,
        expected_quantity:
          operationType === 'CYCLE_COUNT'
            ? String(selectedRow.quantity ?? '0')
            : undefined,
        counted_quantity:
          operationType === 'CYCLE_COUNT'
            ? String(draftItem.counted_quantity || '').trim()
            : undefined,
        adjustment_quantity:
          operationType === 'CYCLE_COUNT'
            ? undefined
            : String(draftItem.adjustment_quantity || '').trim(),
        note: trimOptional(draftItem.note),
      })
      const payload = compactParams({
        operation_no: trimOptional(values.operation_no),
        operation_type: operationType,
        reason: trimOptional(values.reason),
        items: [item],
      })
      const scope = `${operationType}:${selectedRow.subject_type}:${selectedRow.subject_id}:${selectedRow.product_sku_id || 0}:${selectedRow.warehouse_id}:${selectedRow.lot_id || 0}`
      const attempt = operationAttemptsRef.current.prepare(scope, payload)
      setOperationLoading(true)
      try {
        const created = await createInventoryOperation(attempt.params)
        if (!created?.id || created.status !== 'DRAFT') {
          throw Object.assign(new Error('库存作业结果暂时无法确认'), {
            isInvalidResponse: true,
          })
        }
        let operation = created
        let submittedProcess
        if (operationType === 'MANUAL_ADJUSTMENT') {
          let processData
          try {
            processData = await startInventoryAdjustmentApprovalProcess({
              ...(customerKey ? { customer_key: customerKey } : {}),
              inventory_operation_id: created.id,
              idempotency_key: `inventory-adjustment-approval/${created.id}`,
            })
          } catch (error) {
            if (!isSourceBusinessActionResultUnknown(error)) throw error
            processData = await getInventoryAdjustmentApprovalProcess({
              ...(customerKey ? { customer_key: customerKey } : {}),
              inventory_operation_id: created.id,
            })
            if (!processData?.process_context) throw error
          }
          submittedProcess = processData
          if (processData.source_readback?.status === 'DRAFT') {
            const node = findExceptionProcessActiveNode(
              processData,
              'submit_inventory_adjustment'
            )
            try {
              const execution = await executeInventoryAdjustmentSubmit({
                ...(customerKey ? { customer_key: customerKey } : {}),
                process_instance_id:
                  processData.process_context.process_instance.id,
                process_node_instance_id: node.id,
                expected_version: node.version,
                inventory_operation_id: created.id,
                idempotency_key: `inventory-adjustment-submit/${created.id}/${node.id}`,
              })
              operation = execution.source_readback
            } catch (error) {
              if (!isSourceBusinessActionResultUnknown(error)) throw error
              const readback = await getInventoryAdjustmentApprovalProcess({
                ...(customerKey ? { customer_key: customerKey } : {}),
                inventory_operation_id: created.id,
              })
              if (readback?.source_readback?.status !== 'SUBMITTED') throw error
              operation = readback.source_readback
            }
          } else {
            operation = processData.source_readback
          }
        }
        operationAttemptsRef.current.settle(scope, attempt, null)
        rememberInventoryOperation(operation)
        setOperationType('')
        if (operationType === 'MANUAL_ADJUSTMENT') {
          showProcessSubmissionReceipt({ result: submittedProcess, title: '人工库存调整已提交审批' })
        } else {
          message.success('库存作业草稿已生成，请核对后过账')
        }
      } catch (error) {
        const retained = operationAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        message[retained ? 'warning' : 'error'](
          retained
            ? '提交结果暂时无法确认，请保持填写内容不变后重试'
            : getActionErrorMessage(error, '生成库存作业')
        )
      } finally {
        setOperationLoading(false)
      }
    },
    [customerKey, operationType, rememberInventoryOperation, selectedRow]
  )

  const openInventoryOperationEdit = useCallback(
    async (record) => {
      const operationID = Number(record?.id || 0)
      if (!operationID || !canCreateInventoryOperation) return false
      const request = beginLatestRequest('inventory-operation-edit')
      setOperationLoading(true)
      try {
        const detail = await getInventoryOperation(
          { id: operationID },
          { signal: request.signal }
        )
        if (!request.isCurrent()) return false
        const completeItems =
          Array.isArray(detail?.items) &&
          detail.items.length > 0 &&
          detail.items.every((item) => Number(item?.id || 0) > 0)
        if (
          Number(detail?.id || 0) !== operationID ||
          detail?.status !== 'DRAFT' ||
          Number(detail?.version || 0) <= 0 ||
          Number(detail?.created_by || 0) !== currentAdminID ||
          !completeItems
        ) {
          const error = new Error('当前库存作业已不可编辑或详情不完整')
          error.isInvalidResponse = true
          throw error
        }
        rememberInventoryOperation(detail)
        setOperationType('')
        setEditingOperation(detail)
        setOperationRecordsOpen(false)
        return true
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) return false
        message.error(getActionErrorMessage(error, '读取库存作业草稿'))
        return false
      } finally {
        if (request.isCurrent()) {
          setOperationLoading(false)
          request.finish()
        }
      }
    },
    [
      beginLatestRequest,
      canCreateInventoryOperation,
      currentAdminID,
      rememberInventoryOperation,
    ]
  )

  const saveInventoryOperation = useCallback(
    async (values) => {
      if (!editingOperation?.id || !editingOperation?.version) return
      const operationType = editingOperation.operation_type
      const items = Array.isArray(values?.items) ? values.items : []
      const payload = compactParams({
        id: editingOperation.id,
        expected_version: editingOperation.version,
        operation_no: trimOptional(values.operation_no),
        reason: trimOptional(values.reason),
        items: items.map((item) =>
          compactParams({
            id: item.id,
            counted_quantity:
              operationType === 'CYCLE_COUNT'
                ? String(item.counted_quantity || '').trim()
                : undefined,
            adjustment_quantity:
              operationType === 'CYCLE_COUNT'
                ? undefined
                : String(item.adjustment_quantity || '').trim(),
            to_warehouse_id:
              operationType === 'TRANSFER'
                ? item.to_warehouse_id || undefined
                : undefined,
            note: trimOptional(item.note),
          })
        ),
      })
      setOperationLoading(true)
      try {
        const saved = await saveInventoryOperationDraft(payload)
        if (
          Number(saved?.id || 0) !== Number(editingOperation.id) ||
          saved?.status !== 'DRAFT' ||
          Number(saved?.version || 0) !==
            Number(editingOperation.version || 0) + 1 ||
          !Array.isArray(saved?.items) ||
          saved.items.length !== items.length
        ) {
          const error = new Error('库存作业保存结果暂时无法确认')
          error.isInvalidResponse = true
          throw error
        }
        rememberInventoryOperation(saved)
        setEditingOperation(null)
        message.success('库存作业草稿已保存')
      } catch (error) {
        message.error(getActionErrorMessage(error, '保存库存作业草稿'))
      } finally {
        setOperationLoading(false)
      }
    },
    [editingOperation, rememberInventoryOperation]
  )

  const transitionInventoryOperation = useCallback(
    async (action, reason = '', operation = currentOperation) => {
      if (!operation?.id || !operation?.version) return
      setOperationLoading(true)
      try {
        const result = await executeInventoryOperationTransition({
          action,
          reason,
          operation,
          customerKey,
          actorID: Number(adminProfile?.id || 0),
        })
        if (!result) return
        rememberInventoryOperation(result.operation)
        if (result.outcome === 'changed') {
          await loadRows()
          message.warning('库存作业状态已被其他操作更新，请核对后重试')
          return
        }
        setOperationCancelOpen(false)
        setOperationCancelReason('')
        await loadRows()
        if (action === 'submit') {
          showProcessSubmissionReceipt({
            title: '人工库存调整已提交审批',
            loadProcess: () => getInventoryAdjustmentApprovalProcess({
              ...(customerKey ? { customer_key: customerKey } : {}),
              inventory_operation_id: operation.id,
            }),
          })
        } else {
          message.success(result.recovered ? '已重新读取库存作业结果' : { post: '库存作业已过账', cancel: '库存作业已取消' }[action])
        }
      } catch (error) {
        message.error(getActionErrorMessage(error, '处理库存作业'))
      } finally {
        setOperationLoading(false)
      }
    },
    [
      currentOperation,
      adminProfile?.id,
      customerKey,
      loadRows,
      rememberInventoryOperation,
    ]
  )

  const renderSubjectReference = useCallback(
    (value, record) => {
      if (record?.subject_type === 'PRODUCT') {
        return referenceLabel(productOptions, value, '成品')
      }
      if (record?.subject_type === 'MATERIAL') {
        return referenceLabel(materialOptions, value, '材料')
      }
      return linkedBusinessRef(
        subjectTypeText(record?.subject_type) || '存货',
        value
      )
    },
    [materialOptions, productOptions]
  )
  const renderSubjectIdentity = useCallback(
    (value, record) =>
      record?.subject_type === 'PRODUCT' ? (
        <ProductIdentity
          productId={value}
          name={renderSubjectReference(value, record)}
        />
      ) : (
        renderSubjectReference(value, record)
      ),
    [renderSubjectReference]
  )
  const renderWarehouseReference = useCallback(
    (value) => referenceLabel(warehouseFilterOptions, value, '仓库'),
    [warehouseFilterOptions]
  )
  const renderProductSKUReference = useCallback(
    (value, record) => {
      if (record?.subject_type !== 'PRODUCT') return '-'
      if (!Number(value || 0)) return '未分规格'
      return referenceLabel(productSKUOptions, value, '产品规格')
    },
    [productSKUOptions]
  )
  const renderLotReference = useCallback(
    (value) => referenceLabel(inventoryLotOptions, value, '批次'),
    [inventoryLotOptions]
  )
  const renderUnitReference = useCallback(
    (value) => referenceLabel(unitOptions, value, '单位'),
    [unitOptions]
  )
  const operationSourceLabels = useMemo(
    () => ({
      subject: selectedRow
        ? renderSubjectReference(selectedRow.subject_id, selectedRow)
        : '',
      warehouse: selectedRow
        ? renderWarehouseReference(selectedRow.warehouse_id)
        : '',
      lot: selectedRow ? renderLotReference(selectedRow.lot_id) : '',
      unit: selectedRow ? renderUnitReference(selectedRow.unit_id) : '',
    }),
    [
      renderLotReference,
      renderSubjectReference,
      renderUnitReference,
      renderWarehouseReference,
      selectedRow,
    ]
  )
  const resolveOperationItemSourceLabels = useCallback(
    (item) => ({
      subject: renderSubjectReference(item?.subject_id, item),
      warehouse: renderWarehouseReference(item?.from_warehouse_id),
      lot: renderLotReference(item?.from_lot_id),
      unit: renderUnitReference(item?.unit_id),
    }),
    [
      renderLotReference,
      renderSubjectReference,
      renderUnitReference,
      renderWarehouseReference,
    ]
  )

  const stats = useMemo(
    () => [
      { key: 'total', label: '筛选结果', value: total },
      { key: 'current', label: '本页显示', value: rows.length },
    ],
    [rows.length, total]
  )

  const columns = useMemo(() => {
    if (activeView === VIEW_LOTS) {
      return [
        {
          defaultPriority: 10,
          title: '批次号',
          dataIndex: 'lot_no',
          copyable: { label: '批次号' },
          detailCopyable: true,
          width: 180,
          render: (value, record) => value || (record.id ? '已登记批次' : '-'),
        },
        {
          defaultPriority: 50,
          title: '存货类型',
          exportTitle: '存货类型',
          dataIndex: 'subject_type',
          width: 110,
          render: (value, record) =>
            value === 'MATERIAL'
              ? materialStockCategoryLabel(record.stock_category)
              : subjectTypeTag(value),
          exportValue: (record) =>
            record?.subject_type === 'MATERIAL'
              ? materialStockCategoryLabel(record.stock_category)
              : subjectTypeText(record?.subject_type),
        },
        {
          align: 'left',
          defaultPriority: 30,
          title: '材料 / 产品',
          dataIndex: 'subject_id',
          copyable: {
            label: '材料或产品',
            resolveValue: (_value, record) =>
              renderSubjectReference(record?.subject_id, record),
          },
          width: 300,
          className: 'erp-product-identity-cell',
          render: renderSubjectIdentity,
          detailValue: (record) =>
            renderSubjectIdentity(record.subject_id, record),
          exportValue: (record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        {
          align: 'left',
          defaultPriority: 40,
          title: '产品规格',
          dataIndex: 'product_sku_id',
          copyable: {
            label: '产品规格',
            resolveValue: (_value, record) =>
              renderProductSKUReference(record?.product_sku_id, record),
          },
          width: 220,
          render: renderProductSKUReference,
          exportValue: (record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        {
          title: '供应商批次',
          dataIndex: 'supplier_lot_no',
          copyable: { label: '供应商批次' },
          detailCopyable: true,
          width: 150,
          render: dash,
        },
        {
          title: '色号',
          dataIndex: 'color_no',
          copyable: { label: '色号' },
          detailCopyable: true,
          width: 110,
          render: dash,
        },
        {
          title: '缸号',
          dataIndex: 'dye_lot_no',
          copyable: { label: '缸号' },
          detailCopyable: true,
          width: 110,
          render: dash,
        },
        {
          title: '生产批次',
          dataIndex: 'production_lot_no',
          copyable: { label: '生产批次' },
          detailCopyable: true,
          width: 140,
          render: dash,
        },
        {
          defaultPriority: 20,
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'status',
          width: 110,
          render: lotStatusTag,
          exportValue: (record) => lotStatusText(record?.status),
        },
        {
          defaultPriority: 60,
          title: '接收日期',
          exportTitle: '接收日期',
          dataIndex: 'received_at',
          width: 140,
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record?.received_at),
        },
      ]
    }

    if (activeView === VIEW_TXNS) {
      return [
        {
          defaultPriority: 150,
          title: '变动记录',
          dataIndex: 'id',
          width: 130,
          render: (value) => (value ? '已记录' : '-'),
          exportValue: (record) => (record?.id ? '已记录' : ''),
        },
        {
          defaultPriority: 90,
          title: '类型',
          exportTitle: '类型',
          dataIndex: 'txn_type',
          width: 120,
          render: txnTypeTag,
          exportValue: (record) => txnTypeText(record?.txn_type),
        },
        {
          defaultPriority: 40,
          title: '方向',
          exportTitle: '方向',
          dataIndex: 'direction',
          width: 100,
          render: directionTag,
          exportValue: (record) => directionText(record?.direction),
        },
        {
          defaultPriority: 100,
          title: '存货类型',
          exportTitle: '存货类型',
          dataIndex: 'subject_type',
          width: 110,
          render: (value, record) =>
            value === 'MATERIAL'
              ? materialStockCategoryLabel(record.stock_category)
              : subjectTypeTag(value),
          exportValue: (record) =>
            record?.subject_type === 'MATERIAL'
              ? materialStockCategoryLabel(record.stock_category)
              : subjectTypeText(record?.subject_type),
        },
        {
          align: 'left',
          defaultPriority: 20,
          title: '材料 / 产品',
          dataIndex: 'subject_id',
          copyable: {
            label: '材料或产品',
            resolveValue: (_value, record) =>
              renderSubjectReference(record?.subject_id, record),
          },
          width: 300,
          className: 'erp-product-identity-cell',
          render: renderSubjectIdentity,
          detailValue: (record) =>
            renderSubjectIdentity(record.subject_id, record),
          exportValue: (record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        {
          align: 'left',
          defaultPriority: 30,
          title: '产品规格',
          dataIndex: 'product_sku_id',
          copyable: {
            label: '产品规格',
            resolveValue: (_value, record) =>
              renderProductSKUReference(record?.product_sku_id, record),
          },
          width: 220,
          render: renderProductSKUReference,
          exportValue: (record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        {
          defaultPriority: 70,
          title: '仓库',
          dataIndex: 'warehouse_id',
          copyable: {
            label: '仓库',
            resolveValue: (_value, record) =>
              renderWarehouseReference(record?.warehouse_id),
          },
          width: 180,
          render: renderWarehouseReference,
          exportValue: (record) =>
            renderWarehouseReference(record?.warehouse_id),
        },
        {
          defaultPriority: 80,
          title: '批次',
          dataIndex: 'lot_id',
          copyable: {
            label: '批次',
            resolveValue: (_value, record) =>
              renderLotReference(record?.lot_id),
          },
          detailCopyable: true,
          width: 180,
          render: renderLotReference,
          exportValue: (record) => renderLotReference(record?.lot_id),
        },
        {
          align: 'right',
          defaultPriority: 50,
          title: '数量',
          exportTitle: '数量',
          dataIndex: 'quantity',
          width: 120,
          render: formatQuantity,
          exportValue: (record) => formatQuantity(record?.quantity),
        },
        {
          defaultPriority: 60,
          title: '单位',
          dataIndex: 'unit_id',
          width: 130,
          render: renderUnitReference,
          exportValue: (record) => renderUnitReference(record?.unit_id),
        },
        {
          align: 'left',
          defaultPriority: 110,
          title: '来源',
          exportTitle: '来源',
          key: 'source_type_label',
          width: 170,
          render: (_, record) => sourceTypeText(record?.source_type) || '-',
          exportValue: (record) => sourceTypeText(record?.source_type),
        },
        {
          align: 'left',
          defaultPriority: 120,
          title: '来源单据',
          key: 'source_document',
          copyable: {
            label: '来源单据',
            resolveValue: (_value, record) =>
              record?.source_no ||
              record?.source_document_no ||
              record?.document_no ||
              '',
          },
          detailCopyable: true,
          width: 120,
          render: (_, record) => formatSourceDocumentRef(record),
          exportValue: formatSourceDocumentRef,
        },
        {
          defaultPriority: 130,
          title: '来源明细',
          dataIndex: 'source_line_id',
          width: 130,
          render: (value) => relationRef('来源明细', value),
          exportValue: (record) =>
            relationRef('来源明细', record?.source_line_id),
        },
        {
          defaultPriority: 140,
          title: '原库存变动记录',
          dataIndex: 'reversal_of_txn_id',
          width: 130,
          render: (value) => relationRef('原库存变动记录', value),
          exportValue: (record) =>
            relationRef('原库存变动记录', record?.reversal_of_txn_id),
        },
        {
          defaultPriority: 10,
          title: '发生时间',
          exportTitle: '发生时间',
          dataIndex: 'occurred_at',
          width: 170,
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.occurred_at),
        },
        { align: 'left', title: '备注', dataIndex: 'note', width: 300 },
      ]
    }

    return [
      {
        align: 'left',
        defaultPriority: 90,
        title: '库存项',
        dataIndex: 'id',
        width: 130,
        render: (value) => (value ? '已登记库存' : '-'),
        exportValue: (record) => (record?.id ? '已登记库存' : ''),
      },
      {
        defaultPriority: 80,
        title: '存货类型',
        exportTitle: '存货类型',
        dataIndex: 'subject_type',
        width: 110,
        render: (value, record) =>
          value === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeTag(value),
        exportValue: (record) =>
          record?.subject_type === 'MATERIAL'
            ? materialStockCategoryLabel(record.stock_category)
            : subjectTypeText(record?.subject_type),
      },
      {
        align: 'left',
        defaultPriority: 10,
        title: '材料 / 产品',
        dataIndex: 'subject_id',
        copyable: {
          label: '材料或产品',
          resolveValue: (_value, record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        width: 300,
        className: 'erp-product-identity-cell',
        render: renderSubjectIdentity,
        detailValue: (record) =>
          renderSubjectIdentity(record.subject_id, record),
        exportValue: (record) =>
          renderSubjectReference(record?.subject_id, record),
      },
      {
        align: 'left',
        defaultPriority: 20,
        title: '产品规格',
        dataIndex: 'product_sku_id',
        copyable: {
          label: '产品规格',
          resolveValue: (_value, record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        width: 220,
        render: renderProductSKUReference,
        exportValue: (record) =>
          renderProductSKUReference(record?.product_sku_id, record),
      },
      {
        defaultPriority: 30,
        title: '仓库',
        dataIndex: 'warehouse_id',
        copyable: {
          label: '仓库',
          resolveValue: (_value, record) =>
            renderWarehouseReference(record?.warehouse_id),
        },
        width: 180,
        render: renderWarehouseReference,
        exportValue: (record) => renderWarehouseReference(record?.warehouse_id),
      },
      {
        defaultPriority: 70,
        title: '批次',
        dataIndex: 'lot_id',
        copyable: {
          label: '批次',
          resolveValue: (_value, record) => renderLotReference(record?.lot_id),
        },
        detailCopyable: true,
        width: 180,
        render: renderLotReference,
        exportValue: (record) => renderLotReference(record?.lot_id),
      },
      {
        defaultPriority: 45,
        title: '单位',
        dataIndex: 'unit_id',
        width: 130,
        render: renderUnitReference,
        exportValue: (record) => renderUnitReference(record?.unit_id),
      },
      {
        align: 'right',
        defaultPriority: 50,
        title: '当前数量',
        exportTitle: '当前数量',
        dataIndex: 'quantity',
        width: 130,
        render: formatQuantity,
        exportValue: (record) => formatQuantity(record?.quantity),
      },
      {
        align: 'right',
        defaultPriority: 60,
        title: '已预留',
        exportTitle: '已预留',
        dataIndex: 'active_reserved_quantity',
        width: 130,
        render: formatQuantity,
        exportValue: (record) =>
          formatQuantity(record?.active_reserved_quantity),
      },
      {
        align: 'right',
        defaultPriority: 40,
        title: (
          <BusinessHelpLabel
            itemKey="available-quantity"
            label="可用量"
            pageKey="inventory"
          />
        ),
        exportTitle: '可用量',
        dataIndex: 'available_quantity',
        width: 130,
        render: formatQuantity,
        exportValue: (record) => formatQuantity(record?.available_quantity),
      },
    ]
  }, [
    activeView,
    renderLotReference,
    renderProductSKUReference,
    renderSubjectReference,
    renderSubjectIdentity,
    renderUnitReference,
    renderWarehouseReference,
  ])
  const {
    tableColumns,
    exportColumns,
    visibleColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: `inventory-${activeView}`,
    moduleTitle: `库存台账 / ${activeLabel}`,
    columns,
  })
  const copyableTableColumns = useMemo(
    () => normalizeBusinessTableColumns(tableColumns),
    [tableColumns]
  )
  const loadExportRows = useCallback(
    async ({ signal }) => {
      if (!canReadInventory) return []
      const data = await loadInventoryList({ signal, all: true })
      return getRowsFromData(activeView, data)
    },
    [activeView, canReadInventory, loadInventoryList]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: `inventory-export:${activeView}`,
    loadRows: loadExportRows,
    filename: `库存明细-${currentBusinessDate()}.csv`,
    columns: exportColumns,
    recordLabel: `${activeLabel}记录`,
  })

  const hasActiveFilters = Boolean(
    keyword.trim() ||
    subjectType ||
    stockCategory ||
    subjectID ||
    productSkuID ||
    warehouseID ||
    lotID ||
    lotStatus ||
    txnType ||
    sourceType ||
    dateFilterStart ||
    dateFilterEnd ||
    routeSourceID ||
    routeSourceType ||
    routeLotID ||
    linkedKeyword
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setSubjectType('')
    setStockCategory('')
    setSubjectID('')
    setProductSkuID('')
    setWarehouseID('')
    setLotID('')
    setLotStatus('')
    setTxnType('')
    setSourceType('')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [
    clearRouteContext,
    setDateFilterEnd,
    setDateFilterStart,
    setKeyword,
    setLotID,
    setLotStatus,
    setProductSkuID,
    setSourceType,
    setStockCategory,
    setSubjectID,
    setSubjectType,
    setTxnType,
    setWarehouseID,
  ])
  const openOperationCancellation = async () => {
    if (!currentOperation?.id) return
    if (
      currentOperation.operation_type !== 'MANUAL_ADJUSTMENT' ||
      currentOperation.status === 'POSTED'
    ) {
      setOperationCancelOpen(true)
      return
    }
    setOperationLoading(true)
    try {
      const processData = await getInventoryAdjustmentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        inventory_operation_id: currentOperation.id,
      })
      const operation = processData.source_readback
      rememberInventoryOperation(operation)
      if (
        !['DRAFT', 'SUBMITTED', 'APPROVED'].includes(operation.status) ||
        (processData.process_context &&
          processData.process_context.process_instance.status !== 'blocked')
      ) {
        message.warning(
          ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(operation.status)
            ? '该人工调整流程仍在办理，请先在任务中心驳回或阻塞流程'
            : '当前状态不能取消人工库存调整'
        )
        return
      }
      setOperationCancelReason('')
      setOperationCancelOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对库存作业取消条件'))
    } finally {
      setOperationLoading(false)
    }
  }
  const currentOperationCanCancel =
    canCreateInventoryOperation &&
    currentOperation?.id &&
    ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED'].includes(
      currentOperation.status
    ) &&
    (Number(currentOperation.created_by || 0) === currentAdminID ||
      (currentOperation.status === 'POSTED' &&
        Number(currentOperation.posted_by || 0) === currentAdminID))

  return (
    <BusinessPageLayout className="erp-inventory-ledger-page">
      <PageHeaderCard
        compact
        helpKey="inventory"
        title="库存台账"
        stats={stats}
      />

      {currentOperation || operationRecoveryError ? (
        <Alert
          className="erp-inventory-operation-receipt"
          type={operationRecoveryError ? 'warning' : 'info'}
          showIcon
          message={
            currentOperation
              ? `最近库存作业：${currentOperation.operation_no || '已登记'} / ${
                  INVENTORY_OPERATION_STATUS_LABELS[currentOperation.status] ||
                  '状态待核对'
                }`
              : '最近库存作业暂时无法恢复'
          }
          description={
            operationRecoveryError ||
            (currentOperation?.status === 'DRAFT'
              ? currentOperation.operation_type === 'MANUAL_ADJUSTMENT'
                ? '请核对后提交审批；创建人不能审批，批准后仍须由仓库过账。'
                : '请核对作业内容后过账；过账前库存不会变化。'
              : currentOperation?.status === 'SUBMITTED'
                ? '等待另一位有权人员批准或驳回；审批本身不会改变库存。'
                : currentOperation?.status === 'APPROVED'
                  ? '审批已通过，仓库过账后才会形成库存变动。'
                  : currentOperation?.reject_reason ||
                    currentOperation?.cancel_reason ||
                    currentOperation?.reason ||
                    '')
          }
          action={
            currentOperation?.id ? (
              <Space wrap size={6}>
                {currentOperation.status === 'DRAFT' &&
                canCreateInventoryOperation &&
                Number(currentOperation.created_by || 0) === currentAdminID ? (
                  <Button
                    icon={<EditOutlined aria-hidden="true" />}
                    className="erp-action-button"
                    size="small"
                    disabled={operationLoading}
                    onClick={() => openInventoryOperationEdit(currentOperation)}
                  >
                    编辑草稿
                  </Button>
                ) : null}
                {currentOperation.status === 'DRAFT' &&
                canCreateInventoryOperation &&
                Number(currentOperation.created_by || 0) === currentAdminID ? (
                  currentOperation.operation_type === 'MANUAL_ADJUSTMENT' ? (
                    <Popconfirm
                      title="确认提交这张人工库存调整审批？"
                      okText="提交审批"
                      cancelText="返回"
                      onConfirm={() => transitionInventoryOperation('submit')}
                    >
                      <Button
                        icon={<SendOutlined aria-hidden="true" />}
                        className="erp-action-button"
                        type="primary"
                        size="small"
                        loading={operationLoading}
                      >
                        提交审批
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Popconfirm
                      title="确认过账这张库存作业？"
                      okText="确认过账"
                      cancelText="返回"
                      onConfirm={() => transitionInventoryOperation('post')}
                    >
                      <Button
                        type="primary"
                        size="small"
                        loading={operationLoading}
                      >
                        过账
                      </Button>
                    </Popconfirm>
                  )
                ) : null}
                {currentOperation.status === 'APPROVED' &&
                canCreateInventoryOperation ? (
                  <Popconfirm
                    title="确认过账这张库存作业？"
                    okText="确认过账"
                    cancelText="返回"
                    onConfirm={() => transitionInventoryOperation('post')}
                  >
                    <Button
                      type="primary"
                      size="small"
                      loading={operationLoading}
                    >
                      过账
                    </Button>
                  </Popconfirm>
                ) : null}
                {currentOperation.status === 'SUBMITTED' &&
                canApproveInventoryOperation ? (
                  <Button
                    icon={<AuditOutlined aria-hidden="true" />}
                    className="erp-action-button"
                    size="small"
                    onClick={() => navigate('/erp/task-board')}
                  >
                    去任务中心审批
                  </Button>
                ) : null}
                {currentOperationCanCancel ? (
                  <Button
                    danger
                    size="small"
                    disabled={operationLoading}
                    onClick={openOperationCancellation}
                  >
                    核对并取消
                  </Button>
                ) : null}
                {currentOperation.operation_type === 'MANUAL_ADJUSTMENT' ? <WorkflowSourceProgressButton sourceType="inventory_operation" sourceID={currentOperation.id} profile={adminProfile} disabled={operationLoading} /> : null}
                <ExceptionProcessRecoveryButton
                  canRecover={
                    canRecoverProcess &&
                    currentOperation.operation_type === 'MANUAL_ADJUSTMENT'
                  }
                  disabled={operationLoading}
                  disabledReason="当前操作完成后可核对异常流程"
                  loadProcess={() =>
                    getInventoryAdjustmentApprovalProcess({
                      ...(customerKey ? { customer_key: customerKey } : {}),
                      inventory_operation_id: currentOperation.id,
                    })
                  }
                  onRecovered={async () => {
                    await recoverInventoryOperation(currentOperation.id)
                    await loadRows()
                  }}
                />
                <Button
                  size="small"
                  onClick={() => recoverInventoryOperation(currentOperation.id)}
                >
                  重新读取
                </Button>
              </Space>
            ) : null
          }
        />
      ) : null}

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={linkedKeyword || keyword}
              {...BUSINESS_SEARCH_SCOPES[activeView]}
              onChange={(event) => {
                if (
                  linkedKeyword ||
                  routeLotID ||
                  (routeSourceType && routeSourceID)
                ) {
                  clearRouteContext()
                }
                setKeyword(event.target.value)
                resetCurrentPage()
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="存货类型"
              value={subjectType}
              options={subjectTypeOptions}
              onChange={(nextType) => {
                setSubjectType(nextType || '')
                setStockCategory('')
                setSubjectID('')
                setProductSkuID('')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="材料库存类别"
              value={stockCategory}
              disabled={subjectType === 'PRODUCT'}
              options={[
                { value: '', label: '全部材料类别' },
                ...MATERIAL_STOCK_CATEGORY_OPTIONS,
                { value: 'UNCLASSIFIED', label: '待分类' },
              ]}
              onChange={(value) => {
                setStockCategory(value || '')
                setSubjectID('')
                if (value) setSubjectType('MATERIAL')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="材料或产品"
              value={subjectID}
              options={[
                { label: '全部材料或产品', value: '' },
                ...subjectOptions,
              ]}
              placeholder={subjectType ? '全部材料或产品' : '先选存货类型'}
              disabled={!subjectType}
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setSubjectID(nextID || '')
                setProductSkuID('')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="产品规格"
              value={productSkuID}
              options={[
                { label: '全部产品规格', value: '' },
                ...productSKUOptions,
              ]}
              placeholder={
                subjectType === 'PRODUCT' ? '全部产品规格' : '仅成品可选规格'
              }
              disabled={subjectType !== 'PRODUCT' || !canReadProductSKUs}
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setProductSkuID(nextID || '')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="仓库"
              value={warehouseID}
              options={[
                { label: '全部仓库', value: '' },
                ...warehouseFilterOptions,
              ]}
              placeholder={
                activeView === VIEW_LOTS ? '当前有余额仓库' : '全部仓库'
              }
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setWarehouseID(nextID || '')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              aria-label="批次"
              value={lotID}
              options={[
                { label: '全部批次', value: '' },
                ...inventoryLotOptions,
              ]}
              placeholder="全部批次"
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setLotID(nextID || '')
                resetCurrentPage()
              }}
            />
            {activeView === VIEW_LOTS ? (
              <SelectFilter
                className="erp-business-filter-control--status"
                value={lotStatus}
                options={LOT_STATUS_OPTIONS}
                onChange={(nextStatus) => {
                  setLotStatus(nextStatus)
                  resetCurrentPage()
                }}
              />
            ) : null}
            {activeView === VIEW_TXNS ? (
              <>
                <SelectFilter
                  className="erp-business-filter-control--status"
                  value={txnType}
                  options={TXN_TYPE_OPTIONS}
                  onChange={(nextType) => {
                    setTxnType(nextType)
                    resetCurrentPage()
                  }}
                />
                <SelectFilter
                  className="erp-business-filter-control--status"
                  value={sourceType}
                  options={SOURCE_TYPE_OPTIONS}
                  onChange={(nextType) => {
                    if (routeSourceType || routeSourceID || linkedKeyword) {
                      clearRouteContext(['source_type', 'source_id'])
                    }
                    setSourceType(nextType)
                    resetCurrentPage()
                  }}
                />
              </>
            ) : null}
            {activeView !== VIEW_BALANCES ? (
              <DateRangeFilter
                options={
                  activeView === VIEW_LOTS
                    ? LOT_DATE_FILTER_OPTIONS
                    : TXN_DATE_FILTER_OPTIONS
                }
                value={activeView === VIEW_LOTS ? 'received_at' : 'occurred_at'}
                onTypeChange={() => {}}
                startValue={dateFilterStart}
                endValue={dateFilterEnd}
                onStartChange={(nextStart) => {
                  setDateFilterStart(nextStart)
                  resetCurrentPage()
                }}
                onEndChange={(nextEnd) => {
                  setDateFilterEnd(nextEnd)
                  resetCurrentPage()
                }}
              />
            ) : null}
            {routeSourceType && routeSourceID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['source_type', 'source_id'])}
              >
                已按{sourceTypeText(routeSourceType)}筛选
              </Tag>
            ) : null}
            {routeLotID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['lot_id'])}
              >
                已按批次筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <Space size={8} wrap>
            {hasActionPermission(adminProfile, PermissionCode.WAREHOUSE_MANAGE) ? (
              <Button onClick={() => setWarehouseSettingsOpen(true)}>
                仓库设置
              </Button>
            ) : null}
            <BusinessListToolbarActions
              moduleTitle="库存台账"
              onExport={exportRows}
              exportDisabled={loading || exporting || total === 0}
              exportDisabledReason={
                exporting
                  ? '正在准备导出，请稍候'
                  : loading
                    ? '库存台账加载完成后可导出'
                    : total === 0
                      ? `当前筛选没有可导出的${activeLabel}记录`
                      : ''
              }
              onOpenColumnOrder={openColumnOrder}
            />
            {canCreateInventoryOperation || canApproveInventoryOperation ? (
              <Button
                data-business-action-key="inventory-operation-records"
                onClick={() => setOperationRecordsOpen(true)}
              >
                库存作业
              </Button>
            ) : null}
          </Space>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabelFor(activeView, selectedRow)}
          boundaryText="盘点、调拨和人工调整只从所选库存余额生成受控作业；草稿不会改变库存，确认出库、批次状态和预留仍由各自业务入口处理。"
        >
          <SelectionClearAction
            selectedCount={selectedRow ? 1 : 0}
            selectionLabel="库存记录"
            onClear={() => setSelectedRow(null)}
          />
          {relatedActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={relatedActionAvailability.disabled}
              disabledReason={
                !selectedRow
                  ? '请先选择一条库存变动记录'
                  : relatedActionAvailability.disabledReason
              }
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
                  size="small"
                  icon={<LinkOutlined />}
                  data-business-action-key="related-records"
                  disabled={relatedActionAvailability.disabled}
                >
                  相关单据 <DownOutlined />
                </Button>
              </Dropdown>
            </BusinessActionTooltip>
          ) : null}
          <BusinessActionTooltip
            disabled={!selectedRow}
            disabledReason="请先选择一条库存记录"
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedRow}
              onClick={() => openInventoryDetails(selectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {canCreateInventoryOperation && activeView === VIEW_BALANCES ? (
            <>
              {[
                ['CYCLE_COUNT', '盘点', true, ReconciliationOutlined],
                ['TRANSFER', '调拨', false, SwapOutlined],
                ['MANUAL_ADJUSTMENT', '人工调整', false, EditOutlined],
              ].map(([type, label, primary, Icon]) => (
                <BusinessActionTooltip
                  key={type}
                  disabled={!selectedRow || operationLoading}
                  disabledReason={
                    !selectedRow
                      ? '请先选择一条库存余额'
                      : '当前库存作业完成后可继续'
                  }
                >
                  <Button
                    icon={<Icon aria-hidden="true" />}
                    className="erp-action-button"
                    data-business-action-key={`inventory-${type.toLowerCase()}`}
                    size="small"
                    type={primary ? 'primary' : 'default'}
                    disabled={!selectedRow || operationLoading}
                    onClick={() => openInventoryOperation(type)}
                  >
                    {label}
                  </Button>
                </BusinessActionTooltip>
              ))}
            </>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <Card className="erp-business-data-table-card erp-business-module-table-card">
        <div className="erp-business-data-table-card__header erp-inventory-ledger-view-bar">
          <Tabs
            activeKey={activeView}
            items={VIEW_ITEMS}
            onChange={handleViewChange}
          />
          {activeView === VIEW_BALANCES ? inventoryBalanceSwitch : null}
        </div>
        {activeView === VIEW_BALANCES && balanceDisplay === 'distribution' ? (
          <InventoryDistributionOverview
            balances={distributionData.rows}
            warehouses={warehouses}
            loading={distributionData.loading}
            error={distributionData.error}
            onRetry={distributionData.reload}
            onSelectWarehouse={(warehouse) => {
              if (warehouse.warehouseID <= 0) return
              setWarehouseID(warehouse.warehouseID)
              setBalanceDisplay('list')
              resetCurrentPage()
            }}
          />
        ) : (
          <Table
            scrollToolbar
            rowKey={(record) => `${activeView}-${record.id}`}
            loading={loading}
            dataSource={rows}
            columns={copyableTableColumns}
            pagination={createBusinessTablePagination({
              pagination,
              total,
              onChange: (current, pageSize) =>
                setPagination({ current, pageSize }),
            })}
            scroll={{ x: activeView === VIEW_TXNS ? 1900 : 1500 }}
            rowSelection={{
              type: 'radio',
              columnWidth: 48,
              selectedRowKeys: selectedRowKey ? [selectedRowKey] : [],
              onChange: (_keys, selectedRows) =>
                setSelectedRow(selectedRows[0] || null),
            }}
            rowClassName={(record) =>
              record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
            }
            onRow={(record) => ({
              onClick: () => setSelectedRow(record),
              onDoubleClick: (event) => {
                if (
                  event.target?.closest?.(
                    'a, button, input, textarea, select, label, [role="button"], [role="link"], .ant-table-selection-column, .ant-radio-wrapper, .ant-checkbox-wrapper'
                  )
                ) {
                  return
                }
                openInventoryDetails(record)
              },
              style: { cursor: 'pointer' },
              title: '单击选中，双击打开',
            })}
            locale={{
              emptyText: <Empty description={`暂无${activeLabel}`} />,
            }}
          />
        )}
      </Card>
      {columnOrderModal}
      <BusinessDetailsModal
        columns={visibleColumns}
        description="当前弹窗只用于库存查询和追溯，不会修改库存、批次状态、预留或变动记录。"
        open={Boolean(detailRecord)}
        record={detailRecord}
        title={`${activeLabel}详情`}
        onClose={() => setDetailRecord(null)}
      />
      <InventoryOperationRecordsModal
        open={operationRecordsOpen}
        currentAdminID={currentAdminID}
        canCreate={canCreateInventoryOperation}
        onCancel={() => setOperationRecordsOpen(false)}
        onSelect={async (record) => {
          const recovered = await recoverInventoryOperation(record?.id)
          if (recovered?.id) setOperationRecordsOpen(false)
        }}
        onEdit={openInventoryOperationEdit}
      />
      <InventoryOperationModal
        customerKey={customerKey}
        open={Boolean(operationType || editingOperation)}
        mode={editingOperation ? 'edit' : 'create'}
        operation={editingOperation}
        operationType={editingOperation?.operation_type || operationType}
        sourceRecord={selectedRow}
        sourceLabels={operationSourceLabels}
        resolveSourceLabels={resolveOperationItemSourceLabels}
        warehouseOptions={warehouseOptions}
        loading={operationLoading}
        onCancel={() => {
          setOperationType('')
          setEditingOperation(null)
        }}
        onSubmit={
          editingOperation ? saveInventoryOperation : submitInventoryOperation
        }
      />
      <BusinessModal
        size="confirm"
        title="取消库存作业"
        open={operationCancelOpen}
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={operationLoading}
        closable={!operationLoading}
        maskClosable={!operationLoading}
        onCancel={() => !operationLoading && setOperationCancelOpen(false)}
        onOk={() => {
          if (!operationCancelReason.trim()) {
            message.warning('请填写取消原因')
            return
          }
          transitionInventoryOperation('cancel', operationCancelReason)
        }}
      >
        <Input.TextArea
          value={operationCancelReason}
          rows={3}
          maxLength={255}
          showCount
          placeholder="请填写取消原因"
          onChange={(event) => setOperationCancelReason(event.target.value)}
        />
      </BusinessModal>
      <WarehouseSettingsModal
        open={warehouseSettingsOpen}
        onCancel={() => setWarehouseSettingsOpen(false)}
        onSaved={() => {
          loadReferenceOptions()
          loadRows()
        }}
      />
    </BusinessPageLayout>
  )
}
