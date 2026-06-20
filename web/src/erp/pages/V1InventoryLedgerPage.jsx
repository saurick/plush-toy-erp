import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DownOutlined, LinkOutlined } from '@ant-design/icons'
import { Button, Card, Dropdown, Empty, Table, Tabs, Tag } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listInventoryBalances,
  listInventoryLots,
  listInventoryTxns,
} from '../api/inventoryApi.mjs'
import {
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
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  inventoryLotOption,
  materialOption,
  productOption,
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'

const VIEW_BALANCES = 'balances'
const VIEW_LOTS = 'lots'
const VIEW_TXNS = 'txns'

const VIEW_ITEMS = [
  { key: VIEW_BALANCES, label: '库存余额', children: null },
  { key: VIEW_LOTS, label: '库存批次', children: null },
  { key: VIEW_TXNS, label: '库存流水', children: null },
]

const VIEW_LABELS = Object.freeze({
  [VIEW_BALANCES]: '库存余额',
  [VIEW_LOTS]: '库存批次',
  [VIEW_TXNS]: '库存流水',
})

const SUBJECT_TYPE_OPTIONS = [
  { label: '全部对象', value: '' },
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
  { label: '全部流水类型', value: '' },
  { label: '入库', value: 'IN' },
  { label: '出库', value: 'OUT' },
  { label: '调增', value: 'ADJUST_IN' },
  { label: '调减', value: 'ADJUST_OUT' },
  { label: '调拨入', value: 'TRANSFER_IN' },
  { label: '调拨出', value: 'TRANSFER_OUT' },
  { label: '冲正', value: 'REVERSAL' },
]

const SOURCE_TYPE_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '采购入库', value: 'PURCHASE_RECEIPT' },
  { label: '采购退货', value: 'PURCHASE_RETURN' },
  { label: '入库调整', value: 'PURCHASE_RECEIPT_ADJUSTMENT' },
  { label: '出货单', value: 'SHIPMENT' },
  { label: '生产事实', value: 'PRODUCTION_FACT' },
  { label: '委外事实', value: 'OUTSOURCING_FACT' },
]

const LOT_DATE_FILTER_OPTIONS = [{ label: '接收日期', value: 'received_at' }]
const TXN_DATE_FILTER_OPTIONS = [{ label: '发生时间', value: 'occurred_at' }]

const SUBJECT_TYPE_LABELS = Object.freeze({
  MATERIAL: '材料',
  PRODUCT: '成品',
})

const SEARCH_PLACEHOLDERS = Object.freeze({
  [VIEW_LOTS]: '搜索批次号 / 供应商批次 / 色号',
  [VIEW_TXNS]: '搜索来源 / 备注 / 幂等键',
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
  REVERSAL: '冲正',
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
  return <Tag>{SUBJECT_TYPE_LABELS[key] || key}</Tag>
}

function subjectTypeText(value) {
  const key = String(value || '').trim()
  return SUBJECT_TYPE_LABELS[key] || key || ''
}

function lotStatusTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={LOT_STATUS_COLORS[key] || 'default'}>
      {LOT_STATUS_LABELS[key] || key}
    </Tag>
  )
}

function lotStatusText(value) {
  const key = String(value || '').trim()
  return LOT_STATUS_LABELS[key] || key || ''
}

function txnTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={TXN_TYPE_COLORS[key] || 'default'}>
      {TXN_TYPE_LABELS[key] || key}
    </Tag>
  )
}

function txnTypeText(value) {
  const key = String(value || '').trim()
  return TXN_TYPE_LABELS[key] || key || ''
}

function sourceTypeText(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  return SOURCE_TYPE_LABELS[key] || key || ''
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

function internalRef(label, value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : `${label} ${value}`
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
    return `批次 ${row.lot_no || internalRef('内部批次', row.id)} / ${
      LOT_STATUS_LABELS[row.status] || row.status || '-'
    }`
  }
  if (view === VIEW_TXNS) {
    return `流水 ${row.source_type || row.txn_type || internalRef('内部流水', row.id)}`
  }
  return `库存项 ${internalRef('内部余额', row.id)} / 批次 ${
    row.lot_no || internalRef('内部批次', row.lot_id)
  }`
}

function sourceRouteFor(sourceType) {
  const key = String(sourceType || '')
    .trim()
    .toUpperCase()
  if (key === 'PURCHASE_RECEIPT') return V1_ROUTE_PATHS.purchaseReceipts
  if (key === 'SHIPMENT') return V1_ROUTE_PATHS.shipments
  if (key === 'PRODUCTION_FACT') return V1_ROUTE_PATHS.productionProgress
  if (key === 'OUTSOURCING_FACT') return V1_ROUTE_PATHS.processingContracts
  return ''
}

export default function V1InventoryLedgerPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = outletContext?.adminProfile || {}
  const [activeView, setActiveView] = useState(VIEW_BALANCES)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [subjectID, setSubjectID] = useState('')
  const [warehouseID, setWarehouseID] = useState('')
  const [lotID, setLotID] = useState('')
  const [lotStatus, setLotStatus] = useState('')
  const [txnType, setTxnType] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const commonParams = compactParams({
        subject_type: subjectType,
        subject_id: subjectID || undefined,
        warehouse_id: warehouseID || undefined,
        lot_id: lotID || undefined,
        keyword: trimOptional(keyword),
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
          })
        )
      } else if (activeView === VIEW_TXNS) {
        data = await listInventoryTxns(
          compactParams({
            ...commonParams,
            txn_type: txnType,
            source_type: trimOptional(sourceType),
            date_field: 'occurred_at',
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
          })
        )
      } else {
        data = await listInventoryBalances(commonParams)
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
      message.error(getActionErrorMessage(error, '加载库存台账'))
    } finally {
      setLoading(false)
    }
  }, [
    activeView,
    dateFilterEnd,
    dateFilterStart,
    keyword,
    lotStatus,
    lotID,
    pagination,
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
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  const resetCurrentPage = useCallback(() => {
    resetBusinessPaginationCurrent(setPagination)
  }, [])

  const handleViewChange = useCallback(
    (nextView) => {
      setActiveView(nextView)
      setSelectedRow(null)
      setDateFilterStart('')
      setDateFilterEnd('')
      resetCurrentPage()
    },
    [resetCurrentPage]
  )

  const activeLabel = VIEW_LABELS[activeView]
  const selectedRowKey = selectedRow
    ? `${activeView}-${selectedRow.id}`
    : undefined
  const relatedMenuItems = useMemo(() => {
    if (!selectedRow) return []
    if (activeView === VIEW_TXNS && sourceRouteFor(selectedRow.source_type)) {
      return [{ key: 'source', label: '来源单据' }]
    }
    return []
  }, [activeView, selectedRow])

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    if (key === 'source') {
      const targetPath = sourceRouteFor(selectedRow.source_type)
      if (targetPath) navigate(targetPath)
    }
  }

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [materialResult, productResult, warehouseResult, lotResult] =
        await Promise.all([
          listMaterials({ limit: 500, active_only: true }),
          listProducts({ limit: 500, active_only: true }),
          listWarehouses({ limit: 500, active_only: true }),
          listInventoryLots({ limit: 500 }),
        ])
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
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载库存筛选引用数据'))
      setMaterials([])
      setProducts([])
      setWarehouses([])
      setInventoryLots([])
    }
  }, [])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  const subjectOptions = useMemo(() => {
    if (subjectType === 'PRODUCT') {
      return uniqueReferenceOptions(products, productOption)
    }
    if (subjectType === 'MATERIAL') {
      return uniqueReferenceOptions(materials, materialOption)
    }
    return []
  }, [materials, products, subjectType])
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )

  const stats = useMemo(
    () => [
      { key: 'view', label: '当前视图', value: activeLabel },
      { key: 'total', label: '匹配记录', value: total },
      { key: 'current', label: '当前页', value: rows.length },
      { key: 'mode', label: '页面模式', value: '只读' },
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
          render: (value, record) =>
            value || internalRef('内部批次', record.id),
        },
        {
          title: '内部主键',
          dataIndex: 'id',
          width: 110,
          render: (value) => internalRef('主键', value),
          exportValue: (record) => internalRef('主键', record?.id),
        },
        {
          title: '对象',
          exportTitle: '对象',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
          exportValue: (record) => subjectTypeText(record?.subject_type),
        },
        {
          title: '对象内部引用',
          dataIndex: 'subject_id',
          width: 140,
          render: (value, record) =>
            internalRef(subjectTypeText(record?.subject_type) || '对象', value),
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
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 170,
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ]
    }

    if (activeView === VIEW_TXNS) {
      return [
        {
          title: '流水标识',
          dataIndex: 'id',
          width: 130,
          render: (value) => internalRef('内部流水', value),
          exportValue: (record) => internalRef('内部流水', record?.id),
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
          title: '对象',
          exportTitle: '对象',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
          exportValue: (record) => subjectTypeText(record?.subject_type),
        },
        {
          title: '对象内部引用',
          dataIndex: 'subject_id',
          width: 140,
          render: (value, record) =>
            internalRef(subjectTypeText(record?.subject_type) || '对象', value),
        },
        {
          title: '仓库内部引用',
          dataIndex: 'warehouse_id',
          width: 140,
          render: (value) => internalRef('仓库', value),
        },
        {
          title: '批次内部引用',
          dataIndex: 'lot_id',
          width: 140,
          render: (value) => internalRef('批次', value),
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
          title: '单位引用',
          dataIndex: 'unit_id',
          width: 120,
          render: (value) => internalRef('单位', value),
        },
        {
          title: '来源',
          exportTitle: '来源',
          dataIndex: 'source_type',
          width: 170,
          render: (value) => sourceTypeText(value) || '-',
          exportValue: (record) => sourceTypeText(record?.source_type),
        },
        {
          title: '来源单据',
          dataIndex: 'source_id',
          width: 120,
          render: (value) => internalRef('来源', value),
        },
        {
          title: '来源行',
          dataIndex: 'source_line_id',
          width: 110,
          render: dash,
        },
        {
          title: '冲正原流水',
          dataIndex: 'reversal_of_txn_id',
          width: 120,
          render: dash,
        },
        {
          title: '发生时间',
          exportTitle: '发生时间',
          dataIndex: 'occurred_at',
          width: 170,
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.occurred_at),
        },
        {
          title: '幂等键',
          dataIndex: 'idempotency_key',
          width: 280,
        },
        { title: '备注', dataIndex: 'note', width: 300 },
      ]
    }

    return [
      {
        title: '库存项',
        dataIndex: 'id',
        width: 130,
        render: (value) => internalRef('内部余额', value),
        exportValue: (record) => internalRef('内部余额', record?.id),
      },
      {
        title: '对象',
        exportTitle: '对象',
        dataIndex: 'subject_type',
        width: 110,
        render: subjectTypeTag,
        exportValue: (record) => subjectTypeText(record?.subject_type),
      },
      {
        title: '对象内部引用',
        dataIndex: 'subject_id',
        width: 140,
        render: (value, record) =>
          internalRef(subjectTypeText(record?.subject_type) || '对象', value),
      },
      {
        title: '仓库内部引用',
        dataIndex: 'warehouse_id',
        width: 140,
        render: (value) => internalRef('仓库', value),
      },
      {
        title: '批次内部引用',
        dataIndex: 'lot_id',
        width: 140,
        render: (value) => internalRef('批次', value),
      },
      {
        title: '单位引用',
        dataIndex: 'unit_id',
        width: 120,
        render: (value) => internalRef('单位', value),
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
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 170,
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.updated_at),
      },
    ]
  }, [activeView])
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: `inventory-${activeView}`,
      moduleTitle: `库存台账 / ${activeLabel}`,
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `inventory-${activeView}.csv`,
      columns: visibleColumns,
      rows,
    })
  }, [activeView, rows, visibleColumns])

  return (
    <BusinessPageLayout className="erp-v1-inventory-ledger-page">
      <PageHeaderCard
        compact
        title="库存台账"
        description="按余额、批次、流水三种视图追溯库存；可用量由后端按 ACTIVE 预留扣减后只读返回，历史流水通过冲正或调整修正，本页不写库存事实。"
        tags={[
          <Tag color="blue" key="balances">
            余额只读
          </Tag>,
          <Tag color="gold" key="lots">
            批次追溯
          </Tag>,
          <Tag color="green" key="txns">
            流水审计
          </Tag>,
          <Tag key="mode">不写入库存</Tag>,
        ]}
        stats={stats}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder={
                activeView === VIEW_BALANCES
                  ? '搜索对象、仓库、批次或内部引用'
                  : SEARCH_PLACEHOLDERS[activeView]
              }
              onChange={(event) => {
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
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={subjectID}
              options={[
                { label: '全部具体对象', value: '' },
                ...subjectOptions,
              ]}
              placeholder={subjectType ? '全部具体对象' : '先选对象类型'}
              disabled={!subjectType}
              showSearch
              optionFilterProp="label"
              onChange={(nextID) => {
                setSubjectID(nextID || '')
                resetCurrentPage()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseID}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
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
          boundaryText="当前页只读；余额、批次和流水只用于查询 / 追溯，不提供库存写入、盘点调整、出库确认、批次状态变更或预留自动消耗。"
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
              查看关联 <DownOutlined />
            </Button>
          </Dropdown>
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
          })}
          locale={{
            emptyText: <Empty description={`暂无${activeLabel}`} />,
          }}
        />
      </Card>
      {columnOrderModal}
    </BusinessPageLayout>
  )
}
