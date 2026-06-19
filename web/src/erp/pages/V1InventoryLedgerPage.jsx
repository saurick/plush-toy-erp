import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DownOutlined, LinkOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Table,
  Tabs,
  Tag,
} from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listInventoryBalances,
  listInventoryLots,
  listInventoryTxns,
} from '../api/inventoryApi.mjs'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
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

function positiveInt(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : undefined
}

function dash(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function subjectTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return <Tag>{SUBJECT_TYPE_LABELS[key] || key}</Tag>
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

function txnTypeTag(value) {
  const key = String(value || '').trim()
  if (!key) return '-'
  return (
    <Tag color={TXN_TYPE_COLORS[key] || 'default'}>
      {TXN_TYPE_LABELS[key] || key}
    </Tag>
  )
}

function directionTag(value) {
  const direction = Number(value || 0)
  if (direction > 0) return <Tag color="green">增加</Tag>
  if (direction < 0) return <Tag color="red">扣减</Tag>
  return '-'
}

function formatQuantity(value) {
  const text = String(value ?? '').trim()
  return text || '-'
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
    return `批次 ${row.lot_no || row.id} / ${LOT_STATUS_LABELS[row.status] || row.status || '-'}`
  }
  if (view === VIEW_TXNS) {
    return `流水 #${row.id} / ${row.source_type || '-'}`
  }
  return `余额 #${row.id} / 批次 ${row.lot_id || '-'}`
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
  const [activeView, setActiveView] = useState(VIEW_BALANCES)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [subjectID, setSubjectID] = useState()
  const [warehouseID, setWarehouseID] = useState()
  const [lotID, setLotID] = useState()
  const [lotStatus, setLotStatus] = useState('')
  const [txnType, setTxnType] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const commonParams = compactParams({
        subject_type: subjectType,
        subject_id: positiveInt(subjectID),
        keyword: trimOptional(keyword),
        ...getBusinessPaginationParams(pagination),
      })
      let data
      if (activeView === VIEW_LOTS) {
        data = await listInventoryLots(
          compactParams({
            ...commonParams,
            status: lotStatus,
          })
        )
      } else if (activeView === VIEW_TXNS) {
        data = await listInventoryTxns(
          compactParams({
            ...commonParams,
            warehouse_id: positiveInt(warehouseID),
            lot_id: positiveInt(lotID),
            txn_type: txnType,
            source_type: trimOptional(sourceType),
          })
        )
      } else {
        data = await listInventoryBalances(
          compactParams({
            ...commonParams,
            warehouse_id: positiveInt(warehouseID),
            lot_id: positiveInt(lotID),
          })
        )
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
    keyword,
    lotID,
    lotStatus,
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
    const items = []
    if (activeView !== VIEW_LOTS && selectedRow.lot_id) {
      items.push({ key: 'lot', label: '库存批次' })
    }
    if (activeView !== VIEW_TXNS) {
      items.push({ key: 'txns', label: '库存流水' })
    }
    if (activeView === VIEW_TXNS && sourceRouteFor(selectedRow.source_type)) {
      items.push({ key: 'source', label: '来源单据' })
    }
    return items
  }, [activeView, selectedRow])

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    if (key === 'lot' && selectedRow.lot_id) {
      setLotID(selectedRow.lot_id)
      setActiveView(VIEW_LOTS)
      resetCurrentPage()
      return
    }
    if (key === 'txns') {
      if (selectedRow.lot_id) setLotID(selectedRow.lot_id)
      setActiveView(VIEW_TXNS)
      resetCurrentPage()
      return
    }
    if (key === 'source') {
      const targetPath = sourceRouteFor(selectedRow.source_type)
      if (targetPath) navigate(targetPath)
    }
  }

  const stats = useMemo(
    () => [
      { key: 'total', label: '总记录', value: total },
      { key: 'current', label: '当前页', value: rows.length },
      { key: 'view', label: '当前视图', value: activeLabel },
      { key: 'mode', label: '页面模式', value: '只读' },
    ],
    [activeLabel, rows.length, total]
  )

  const columns = useMemo(() => {
    if (activeView === VIEW_LOTS) {
      return [
        { title: '批次 ID', dataIndex: 'id', width: 100 },
        {
          title: '对象',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
        },
        { title: '对象 ID', dataIndex: 'subject_id', width: 100 },
        { title: '批次号', dataIndex: 'lot_no', width: 180 },
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
          dataIndex: 'status',
          width: 110,
          render: lotStatusTag,
        },
        {
          title: '接收日期',
          dataIndex: 'received_at',
          width: 140,
          render: formatUnixDate,
        },
        {
          title: '更新时间',
          dataIndex: 'updated_at',
          width: 170,
          render: formatUnixDateTime,
        },
      ]
    }

    if (activeView === VIEW_TXNS) {
      return [
        { title: '流水 ID', dataIndex: 'id', width: 100 },
        {
          title: '类型',
          dataIndex: 'txn_type',
          width: 120,
          render: txnTypeTag,
        },
        {
          title: '方向',
          dataIndex: 'direction',
          width: 100,
          render: directionTag,
        },
        {
          title: '对象',
          dataIndex: 'subject_type',
          width: 110,
          render: subjectTypeTag,
        },
        { title: '对象 ID', dataIndex: 'subject_id', width: 100 },
        { title: '仓库 ID', dataIndex: 'warehouse_id', width: 100 },
        { title: '批次 ID', dataIndex: 'lot_id', width: 100, render: dash },
        {
          title: '数量',
          dataIndex: 'quantity',
          width: 120,
          render: formatQuantity,
        },
        { title: '单位 ID', dataIndex: 'unit_id', width: 100 },
        { title: '来源', dataIndex: 'source_type', width: 170 },
        { title: '来源单', dataIndex: 'source_id', width: 110, render: dash },
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
          dataIndex: 'occurred_at',
          width: 170,
          render: formatUnixDateTime,
        },
        {
          title: '幂等键',
          dataIndex: 'idempotency_key',
          width: 190,
          ellipsis: true,
        },
        { title: '备注', dataIndex: 'note', width: 180, ellipsis: true },
      ]
    }

    return [
      { title: '余额 ID', dataIndex: 'id', width: 100 },
      {
        title: '对象',
        dataIndex: 'subject_type',
        width: 110,
        render: subjectTypeTag,
      },
      { title: '对象 ID', dataIndex: 'subject_id', width: 100 },
      { title: '仓库 ID', dataIndex: 'warehouse_id', width: 100 },
      { title: '批次 ID', dataIndex: 'lot_id', width: 100, render: dash },
      { title: '单位 ID', dataIndex: 'unit_id', width: 100 },
      {
        title: '当前数量',
        dataIndex: 'quantity',
        width: 130,
        render: formatQuantity,
      },
      {
        title: '已预留',
        dataIndex: 'active_reserved_quantity',
        width: 130,
        render: formatQuantity,
      },
      {
        title: '可用量',
        dataIndex: 'available_quantity',
        width: 130,
        render: formatQuantity,
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 170,
        render: formatUnixDateTime,
      },
    ]
  }, [activeView])

  return (
    <BusinessPageLayout className="erp-v1-inventory-ledger-page">
      <PageHeaderCard
        compact
        title="库存台账"
        description="库存台账读取 inventory_balances、inventory_lots、inventory_txns 和 ACTIVE stock_reservations；可用量只读计算，库存增减、批次状态和冲正仍由后端事实 usecase 写入。"
        tags={[
          <Tag color="blue" key="balances">
            inventory_balances
          </Tag>,
          <Tag color="gold" key="lots">
            inventory_lots
          </Tag>,
          <Tag color="green" key="txns">
            inventory_txns
          </Tag>,
        ]}
        stats={stats}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索批次号 / 来源 / 备注 / ID"
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
                setSubjectType(nextType)
                resetCurrentPage()
              }}
            />
            <InputNumber
              className="erp-business-filter-control"
              min={1}
              precision={0}
              placeholder="对象 ID"
              value={subjectID}
              onChange={(nextValue) => {
                setSubjectID(nextValue)
                resetCurrentPage()
              }}
            />
            {activeView !== VIEW_LOTS ? (
              <>
                <InputNumber
                  className="erp-business-filter-control"
                  min={1}
                  precision={0}
                  placeholder="仓库 ID"
                  value={warehouseID}
                  onChange={(nextValue) => {
                    setWarehouseID(nextValue)
                    resetCurrentPage()
                  }}
                />
                <InputNumber
                  className="erp-business-filter-control"
                  min={1}
                  precision={0}
                  placeholder="批次 ID"
                  value={lotID}
                  onChange={(nextValue) => {
                    setLotID(nextValue)
                    resetCurrentPage()
                  }}
                />
              </>
            ) : null}
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
                <Input
                  allowClear
                  className="erp-business-filter-control"
                  placeholder="来源类型"
                  value={sourceType}
                  onChange={(event) => {
                    setSourceType(event.target.value)
                    resetCurrentPage()
                  }}
                  onPressEnter={loadRows}
                />
              </>
            ) : null}
          </>
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
          columns={columns}
          pagination={createBusinessTablePagination({
            pagination,
            total,
            onChange: (current, pageSize) =>
              setPagination({ current, pageSize }),
          })}
          scroll={{ x: activeView === VIEW_TXNS ? 1900 : 1500 }}
          rowSelection={{
            type: 'radio',
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
    </BusinessPageLayout>
  )
}
