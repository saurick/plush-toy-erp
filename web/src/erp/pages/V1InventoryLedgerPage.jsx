import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DownOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons'
import { Button, Card, Dropdown, Empty, Table, Tabs, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listInventoryBalances,
  listInventoryLots,
  listInventoryTxns,
} from '../api/inventoryApi.mjs'
import {
  listProductSKUs,
  listUnits,
  listMaterials,
  listProducts,
  listWarehouses,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import { businessSourceRouteFor } from '../utils/businessSourceNavigation.mjs'
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

const VIEW_BALANCES = 'balances'
const VIEW_LOTS = 'lots'
const VIEW_TXNS = 'txns'

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

const SEARCH_PLACEHOLDERS = Object.freeze({
  [VIEW_BALANCES]: '搜索存货类型',
  [VIEW_LOTS]: '搜索批次',
  [VIEW_TXNS]: '搜索库存变动',
})

const SEARCH_HINTS = Object.freeze({
  [VIEW_BALANCES]: '可搜索：存货类型',
  [VIEW_LOTS]: '可搜索：批次号、供应商批次、色号',
  [VIEW_TXNS]: '可搜索：变动类型、来源、备注',
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
    return Array.isArray(data?.inventory_lots) ? data.inventory_lots : []
  }
  if (view === VIEW_TXNS) {
    return Array.isArray(data?.inventory_txns) ? data.inventory_txns : []
  }
  return Array.isArray(data?.inventory_balances) ? data.inventory_balances : []
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

export default function V1InventoryLedgerPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const requestControllersRef = useRef({})
  const requestSequenceRef = useRef({})
  const [activeView, setActiveView] = useState(VIEW_BALANCES)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [subjectID, setSubjectID] = useState('')
  const [productSkuID, setProductSkuID] = useState('')
  const [warehouseID, setWarehouseID] = useState('')
  const [lotID, setLotID] = useState('')
  const [lotStatus, setLotStatus] = useState('')
  const [txnType, setTxnType] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const routeView = searchParamText(searchParams, 'view')
  const routeLotID = searchParamPositiveInt(searchParams, 'lot_id')
  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
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

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    setLoading(true)
    try {
      const commonParams = compactParams({
        subject_type: subjectType,
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
        ...getBusinessPaginationParams(pagination),
      })
      let data
      if (activeView === VIEW_LOTS) {
        data = await listInventoryLots(
          compactParams({
            ...commonParams,
            status: lotStatus,
            date_field: 'received_at',
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
          }),
          { signal: request.signal }
        )
      } else if (activeView === VIEW_TXNS) {
        const localSourceType = trimOptional(sourceType)
        const routeSourceMatchesLocal =
          !localSourceType ||
          localSourceType.toUpperCase() ===
            String(routeSourceType || '').trim().toUpperCase()
        data = await listInventoryTxns(
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
          { signal: request.signal }
        )
      } else {
        data = await listInventoryBalances(commonParams, {
          signal: request.signal,
        })
      }
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
  }, [
    activeView,
    beginLatestRequest,
    dateFilterEnd,
    dateFilterStart,
    keyword,
    linkedKeyword,
    lotStatus,
    lotID,
    pagination,
    productSkuID,
    routeLotID,
    routeSourceID,
    routeSourceType,
    sourceType,
    subjectID,
    subjectType,
    txnType,
    warehouseID,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    if (routeView && VIEW_LABELS[routeView] && routeView !== activeView) {
      setActiveView(routeView)
      setSelectedRow(null)
      setDetailRecord(null)
    }
  }, [activeView, routeView])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  const resetCurrentPage = useCallback(() => {
    resetBusinessPaginationCurrent(setPagination)
  }, [])

  const handleViewChange = useCallback(
    (nextView) => {
      setActiveView(nextView)
      setSelectedRow(null)
      setDetailRecord(null)
      setDateFilterStart('')
      setDateFilterEnd('')
      resetCurrentPage()
    },
    [resetCurrentPage]
  )

  const activeLabel = VIEW_LABELS[activeView]
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
        listMaterials(
          { limit: 500, active_only: true },
          { signal: request.signal }
        ),
        listProducts(
          { limit: 500, active_only: true },
          { signal: request.signal }
        ),
        listProductSKUs({ limit: 500 }, { signal: request.signal }),
        listUnits({ limit: 500 }, { signal: request.signal }),
        listWarehouses(
          { limit: 500, active_only: true },
          { signal: request.signal }
        ),
        listInventoryLots({ limit: 500 }, { signal: request.signal }),
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
  }, [beginLatestRequest])

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
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
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
  const renderWarehouseReference = useCallback(
    (value) => referenceLabel(warehouseOptions, value, '仓库'),
    [warehouseOptions]
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

  const stats = useMemo(
    () => [
      { key: 'view', label: '查看内容', value: activeLabel },
      { key: 'total', label: '筛选结果', value: total },
      { key: 'current', label: '本页显示', value: rows.length },
    ],
    [activeLabel, rows.length, total]
  )

  const columns = useMemo(() => {
    if (activeView === VIEW_LOTS) {
      return [
        {
          title: '批次号',
          dataIndex: 'lot_no',
          width: 180,
          render: (value, record) => value || (record.id ? '已登记批次' : '-'),
        },
        {
          title: '存货类型',
          exportTitle: '存货类型',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
          exportValue: (record) => subjectTypeText(record?.subject_type),
        },
        {
          title: '材料 / 产品',
          dataIndex: 'subject_id',
          width: 220,
          render: renderSubjectReference,
          exportValue: (record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        {
          title: '产品规格',
          dataIndex: 'product_sku_id',
          width: 220,
          render: renderProductSKUReference,
          exportValue: (record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        {
          title: '供应商批次',
          dataIndex: 'supplier_lot_no',
          width: 150,
          render: dash,
        },
        { title: '色号', dataIndex: 'color_no', width: 110, render: dash },
        { title: '缸号', dataIndex: 'dye_lot_no', width: 110, render: dash },
        {
          title: '生产批次',
          dataIndex: 'production_lot_no',
          width: 140,
          render: dash,
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'status',
          width: 110,
          render: lotStatusTag,
          exportValue: (record) => lotStatusText(record?.status),
        },
        {
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
          title: '变动记录',
          dataIndex: 'id',
          width: 130,
          render: (value) => (value ? '已记录' : '-'),
          exportValue: (record) => (record?.id ? '已记录' : ''),
        },
        {
          title: '类型',
          exportTitle: '类型',
          dataIndex: 'txn_type',
          width: 120,
          render: txnTypeTag,
          exportValue: (record) => txnTypeText(record?.txn_type),
        },
        {
          title: '方向',
          exportTitle: '方向',
          dataIndex: 'direction',
          width: 100,
          render: directionTag,
          exportValue: (record) => directionText(record?.direction),
        },
        {
          title: '存货类型',
          exportTitle: '存货类型',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
          exportValue: (record) => subjectTypeText(record?.subject_type),
        },
        {
          title: '材料 / 产品',
          dataIndex: 'subject_id',
          width: 220,
          render: renderSubjectReference,
          exportValue: (record) =>
            renderSubjectReference(record?.subject_id, record),
        },
        {
          title: '产品规格',
          dataIndex: 'product_sku_id',
          width: 220,
          render: renderProductSKUReference,
          exportValue: (record) =>
            renderProductSKUReference(record?.product_sku_id, record),
        },
        {
          title: '仓库',
          dataIndex: 'warehouse_id',
          width: 180,
          render: renderWarehouseReference,
          exportValue: (record) =>
            renderWarehouseReference(record?.warehouse_id),
        },
        {
          title: '批次',
          dataIndex: 'lot_id',
          width: 180,
          render: renderLotReference,
          exportValue: (record) => renderLotReference(record?.lot_id),
        },
        {
          title: '数量',
          exportTitle: '数量',
          dataIndex: 'quantity',
          width: 120,
          render: formatQuantity,
          exportValue: (record) => formatQuantity(record?.quantity),
        },
        {
          title: '单位',
          dataIndex: 'unit_id',
          width: 130,
          render: renderUnitReference,
          exportValue: (record) => renderUnitReference(record?.unit_id),
        },
        {
          title: '来源',
          exportTitle: '来源',
          key: 'source_type_label',
          width: 170,
          render: (_, record) => sourceTypeText(record?.source_type) || '-',
          exportValue: (record) => sourceTypeText(record?.source_type),
        },
        {
          title: '来源单据',
          key: 'source_document',
          width: 120,
          render: (_, record) => formatSourceDocumentRef(record),
          exportValue: formatSourceDocumentRef,
        },
        {
          title: '来源明细',
          dataIndex: 'source_line_id',
          width: 130,
          render: (value) => relationRef('来源明细', value),
          exportValue: (record) =>
            relationRef('来源明细', record?.source_line_id),
        },
        {
          title: '原库存变动记录',
          dataIndex: 'reversal_of_txn_id',
          width: 130,
          render: (value) => relationRef('原库存变动记录', value),
          exportValue: (record) =>
            relationRef('原库存变动记录', record?.reversal_of_txn_id),
        },
        {
          title: '发生时间',
          exportTitle: '发生时间',
          dataIndex: 'occurred_at',
          width: 170,
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.occurred_at),
        },
        { title: '备注', dataIndex: 'note', width: 300 },
      ]
    }

    return [
      {
        title: '库存项',
        dataIndex: 'id',
        width: 130,
        render: (value) => (value ? '已登记库存' : '-'),
        exportValue: (record) => (record?.id ? '已登记库存' : ''),
      },
      {
        title: '存货类型',
        exportTitle: '存货类型',
        dataIndex: 'subject_type',
        width: 110,
        render: subjectTypeTag,
        exportValue: (record) => subjectTypeText(record?.subject_type),
      },
      {
        title: '材料 / 产品',
        dataIndex: 'subject_id',
        width: 220,
        render: renderSubjectReference,
        exportValue: (record) =>
          renderSubjectReference(record?.subject_id, record),
      },
      {
        title: '产品规格',
        dataIndex: 'product_sku_id',
        width: 220,
        render: renderProductSKUReference,
        exportValue: (record) =>
          renderProductSKUReference(record?.product_sku_id, record),
      },
      {
        title: '仓库',
        dataIndex: 'warehouse_id',
        width: 180,
        render: renderWarehouseReference,
        exportValue: (record) => renderWarehouseReference(record?.warehouse_id),
      },
      {
        title: '批次',
        dataIndex: 'lot_id',
        width: 180,
        render: renderLotReference,
        exportValue: (record) => renderLotReference(record?.lot_id),
      },
      {
        title: '单位',
        dataIndex: 'unit_id',
        width: 130,
        render: renderUnitReference,
        exportValue: (record) => renderUnitReference(record?.unit_id),
      },
      {
        title: '当前数量',
        exportTitle: '当前数量',
        dataIndex: 'quantity',
        width: 130,
        render: formatQuantity,
        exportValue: (record) => formatQuantity(record?.quantity),
      },
      {
        title: '已预留',
        exportTitle: '已预留',
        dataIndex: 'active_reserved_quantity',
        width: 130,
        render: formatQuantity,
        exportValue: (record) =>
          formatQuantity(record?.active_reserved_quantity),
      },
      {
        title: '可用量',
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
    renderUnitReference,
    renderWarehouseReference,
  ])
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: `inventory-${activeView}`,
      moduleTitle: `库存台账 / ${activeLabel}`,
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `库存明细-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleColumns,
      rows,
    })
  }, [rows, visibleColumns])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      subjectType ||
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
  }, [clearRouteContext])

  return (
    <BusinessPageLayout className="erp-v1-inventory-ledger-page">
      <PageHeaderCard
        compact
        title="库存台账"
        description="可分别查看库存余额、库存批次和库存变动记录；按仓库筛选批次时只显示当前有余额的批次，历史变动请到库存变动记录中查询。本页只用于查询和追溯。"
        tags={[
          <Tag color="blue" key="balances">
            余额只读
          </Tag>,
          <Tag color="gold" key="lots">
            批次追溯
          </Tag>,
          <Tag color="green" key="txns">
            变动追溯
          </Tag>,
          <Tag key="mode">不会改变库存</Tag>,
        ]}
        stats={stats}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={linkedKeyword || keyword}
              placeholder={
                activeView === VIEW_BALANCES
                  ? SEARCH_PLACEHOLDERS[VIEW_BALANCES]
                  : SEARCH_PLACEHOLDERS[activeView]
              }
              searchHint={
                activeView === VIEW_BALANCES
                  ? SEARCH_HINTS[VIEW_BALANCES]
                  : SEARCH_HINTS[activeView]
              }
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
              value={subjectType}
              options={SUBJECT_TYPE_OPTIONS}
              onChange={(nextType) => {
                setSubjectType(nextType || '')
                setSubjectID('')
                setProductSkuID('')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
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
              value={productSkuID}
              options={[
                { label: '全部产品规格', value: '' },
                ...productSKUOptions,
              ]}
              placeholder={
                subjectType === 'PRODUCT' ? '全部产品规格' : '仅成品可选规格'
              }
              disabled={subjectType !== 'PRODUCT'}
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setProductSkuID(nextID || '')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseID}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
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
          <BusinessListToolbarActions
            moduleTitle="库存台账"
            onExport={exportRows}
            exportDisabled={rows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabelFor(activeView, selectedRow)}
          boundaryText="当前页仅供查询和追溯；不能在这里更改库存、进行盘点调整、确认出库、修改批次状态或自动扣减预留数量。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedRow || relatedMenuItems.length === 0}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow || relatedMenuItems.length === 0}
            >
              相关单据 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            icon={<EyeOutlined />}
            disabled={!selectedRow}
            onClick={() => openInventoryDetails(selectedRow)}
          >
            查看详情
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <Card className="erp-business-data-table-card erp-business-module-table-card">
        <Tabs
          activeKey={activeView}
          items={VIEW_ITEMS}
          onChange={handleViewChange}
        />
        <Table
          rowKey={(record) => `${activeView}-${record.id}`}
          loading={loading}
          dataSource={rows}
          columns={tableColumns}
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
                  'a, button, input, textarea, select, label, [role="button"], [role="link"], .ant-table-selection-column, .ant-radio-wrapper, .ant-checkbox-wrapper, .erp-business-row-expand-button'
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
      </Card>
      {columnOrderModal}
      <BusinessRecordDetailsModal
        columns={visibleColumns}
        description="当前弹窗只用于库存查询和追溯，不会修改库存、批次状态、预留或变动记录。"
        open={Boolean(detailRecord)}
        record={detailRecord}
        title={`${activeLabel}详情`}
        onClose={() => setDetailRecord(null)}
      />
    </BusinessPageLayout>
  )
}
