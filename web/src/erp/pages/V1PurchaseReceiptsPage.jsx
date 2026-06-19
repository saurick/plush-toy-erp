import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Input, Popconfirm, Select, Tag } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addPurchaseReceiptItem,
  cancelPurchaseReceipt,
  createPurchaseReceiptWithItems,
  listPurchaseReceipts,
  postPurchaseReceipt,
} from '../api/purchaseApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import {
  listMaterials,
  listUnits,
  listWarehouses,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessOperationPanel,
  BusinessDataTable,
  BusinessPageLayout,
  DateInput,
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
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  buildSequentialDraftCode,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  buildPurchaseReceiptItemParams,
  createBlankPurchaseReceiptItem,
  decimalNumber,
  formatQuantity,
} from '../utils/businessLineItems.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import {
  inventoryLotOption,
  materialOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已过账', value: 'POSTED' },
  { label: '已取消', value: 'CANCELLED' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'blue',
  CANCELLED: 'red',
})
const REFERENCE_LOAD_RETRY_DELAYS_MS = [500, 1000]

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function hasPermission(adminProfile, permission) {
  return (
    adminProfile?.is_super_admin === true ||
    hasActionPermission(adminProfile, permission)
  )
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function optionalText(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function buildReceiptParams(values = {}) {
  return compactParams({
    receipt_no: trimOptional(values.receipt_no),
    supplier_name: trimOptional(values.supplier_name),
    received_at: trimOptional(values.received_at),
    note: trimOptional(values.note),
  })
}

function buildReceiptWithItemsParams(values = {}) {
  return {
    ...buildReceiptParams(values),
    items: (values.items || []).map((item) =>
      buildPurchaseReceiptItemParams(undefined, item)
    ),
  }
}

function receiptItemCount(receipt = {}) {
  return Array.isArray(receipt.items) ? receipt.items.length : 0
}

function receiptQuantityTotal(receipt = {}) {
  return (receipt.items || []).reduce(
    (total, item) => total + decimalNumber(item?.quantity),
    0
  )
}

function PurchaseReceiptItemsList({
  inventoryLotOptions = [],
  items = [],
  materialOptions = [],
  unitOptions = [],
  warehouseOptions = [],
}) {
  if (!items.length) {
    return (
      <div className="erp-purchase-receipt-items-list">
        <div className="erp-purchase-receipt-items-list__empty">暂无明细</div>
      </div>
    )
  }

  return (
    <div className="erp-purchase-receipt-items-list" aria-label="入库明细">
      {items.map((item, index) => {
        const fields = [
          {
            label: '材料',
            value: referenceLabel(materialOptions, item.material_id, '材料'),
            wide: true,
          },
          {
            label: '仓库',
            value: referenceLabel(warehouseOptions, item.warehouse_id, '仓库'),
          },
          {
            label: '单位',
            value: referenceLabel(unitOptions, item.unit_id, '单位'),
          },
          {
            label: '批次',
            value: referenceLabel(inventoryLotOptions, item.lot_id, '批次'),
            wide: true,
          },
          { label: '批次号', value: optionalText(item.lot_no) },
          {
            label: '数量',
            value: formatQuantity(decimalNumber(item.quantity)),
          },
          { label: '单价', value: optionalText(item.unit_price) },
          { label: '金额', value: optionalText(item.amount) },
          {
            label: '采购订单行',
            value: item.purchase_order_item_id
              ? `关联行 ${item.purchase_order_item_id}`
              : '-',
          },
          { label: '来源行号', value: optionalText(item.source_line_no) },
          { label: '备注', value: optionalText(item.note), wide: true },
        ]
        return (
          <article
            className="erp-purchase-receipt-item-card"
            key={item.id || `${item.material_id || 'item'}-${index}`}
          >
            <div className="erp-purchase-receipt-item-card__head">
              <strong>{`明细 ${index + 1}`}</strong>
              <span>
                {`数量 ${formatQuantity(decimalNumber(item.quantity))} / 金额 ${optionalText(item.amount)}`}
              </span>
            </div>
            <dl className="erp-purchase-receipt-item-card__grid">
              {fields.map((field) => (
                <div
                  className={
                    field.wide
                      ? 'erp-purchase-receipt-item-card__field erp-purchase-receipt-item-card__field--wide'
                      : 'erp-purchase-receipt-item-card__field'
                  }
                  key={field.label}
                >
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        )
      })}
    </div>
  )
}

function canExpandPurchaseReceiptRow(record) {
  return receiptItemCount(record) > 0
}

function formListName(field, name) {
  return field ? [field.name, name] : name
}

function PurchaseReceiptItemFormFields({
  field,
  inventoryLotOptions = [],
  materialOptions = [],
  unitOptions = [],
  warehouseOptions = [],
}) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料"
        name={formListName(field, 'material_id')}
        rules={[{ required: true, message: '请选择材料' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={materialOptions}
          placeholder="请选择材料"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="仓库"
        name={formListName(field, 'warehouse_id')}
        rules={[{ required: true, message: '请选择仓库' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={warehouseOptions}
          placeholder="请选择仓库"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位"
        name={formListName(field, 'unit_id')}
        rules={[{ required: true, message: '请选择单位' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="入库数量"
        name={formListName(field, 'quantity')}
        rules={[{ required: true, message: '请填写入库数量' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次"
        name={formListName(field, 'lot_id')}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={inventoryLotOptions}
          placeholder="请选择批次"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次号"
        name={formListName(field, 'lot_no')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="来源行号"
        name={formListName(field, 'source_line_no')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单价"
        name={formListName(field, 'unit_price')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="金额"
        name={formListName(field, 'amount')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--wide"
        label="备注"
        name={formListName(field, 'note')}
      >
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
      </Form.Item>
    </>
  )
}

export default function V1PurchaseReceiptsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = outletContext?.adminProfile || {}
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [receiptModal, setReceiptModal] = useState(null)
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [receiptForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canCreate = hasPermission(adminProfile, 'purchase.receipt.create')
  const canPost =
    canCreate || hasPermission(adminProfile, 'warehouse.inbound.confirm')
  const relatedMenuItems = [
    { key: 'purchase-orders', label: '采购订单' },
    { key: 'quality-inspections', label: '来料质检' },
    { key: 'inventory', label: '库存台账' },
  ]
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const renderExpandedPurchaseReceiptItems = useCallback(
    (record) => (
      <PurchaseReceiptItemsList
        inventoryLotOptions={inventoryLotOptions}
        items={record.items || []}
        materialOptions={materialOptions}
        unitOptions={unitOptions}
        warehouseOptions={warehouseOptions}
      />
    ),
    [inventoryLotOptions, materialOptions, unitOptions, warehouseOptions]
  )

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-orders': V1_ROUTE_PATHS.purchaseOrders,
      'quality-inspections': V1_ROUTE_PATHS.qualityInspections,
      inventory: V1_ROUTE_PATHS.inventory,
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPurchaseReceipts(
        compactParams({
          status: statusFilter,
          keyword: trimOptional(keyword),
          ...getBusinessPaginationParams(pagination),
        })
      )
      const nextRows = Array.isArray(data?.purchase_receipts)
        ? data.purchase_receipts
        : []
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购入库单'))
    } finally {
      setLoading(false)
    }
  }, [keyword, pagination, statusFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    let lastError
    try {
      let materialResult
      let unitResult
      let warehouseResult
      let lotResult
      for (
        let attempt = 0;
        attempt <= REFERENCE_LOAD_RETRY_DELAYS_MS.length;
        attempt += 1
      ) {
        try {
          materialResult = await listMaterials({
            limit: 500,
            active_only: true,
          })
          unitResult = await listUnits({ limit: 500 })
          warehouseResult = await listWarehouses({
            limit: 500,
            active_only: true,
          })
          lotResult = await listInventoryLots({ limit: 500 })
          lastError = null
          break
        } catch (error) {
          lastError = error
          const retryDelay = REFERENCE_LOAD_RETRY_DELAYS_MS[attempt]
          if (!retryDelay) {
            break
          }
          await wait(retryDelay)
        }
      }
      if (lastError) {
        throw lastError
      }
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
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
      message.error(getActionErrorMessage(error, '加载入库引用数据'))
      setMaterials([])
      setUnits([])
      setWarehouses([])
      setInventoryLots([])
    }
  }, [])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  useEffect(() => {
    if (receiptModal?.mode === 'create') {
      receiptForm.setFieldsValue({
        receipt_no: buildSequentialDraftCode(rows, {
          prefix: 'PR',
          field: 'receipt_no',
        }),
        supplier_name: '',
        received_at: todayInputValue(),
        note: '',
        items: [createBlankPurchaseReceiptItem()],
      })
    }
    if (receiptModal?.mode === 'item') {
      itemForm.setFieldsValue({
        material_id: undefined,
        warehouse_id: undefined,
        unit_id: undefined,
        lot_id: undefined,
        purchase_order_item_id: undefined,
        lot_no: '',
        quantity: '',
        unit_price: '',
        amount: '',
        source_line_no: '',
        note: '',
      })
    }
  }, [itemForm, receiptForm, receiptModal?.mode, rows])

  const openCreate = useCallback(() => {
    setReceiptModal({ mode: 'create' })
  }, [])

  const openAddItem = useCallback((receipt) => {
    setReceiptModal({ mode: 'item', receipt })
  }, [])

  const closeModal = useCallback(() => {
    setReceiptModal(null)
  }, [])

  const handleCreateReceipt = useCallback(async () => {
    let values
    try {
      values = await receiptForm.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const receipt = await createPurchaseReceiptWithItems(
        buildReceiptWithItemsParams(values)
      )
      message.success('采购入库草稿和明细已创建')
      setSelectedRow(receipt)
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建采购入库草稿'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, loadRows, receiptForm])

  const handleAddItem = useCallback(async () => {
    let values
    try {
      values = await itemForm.validateFields()
    } catch {
      return
    }
    const receipt = receiptModal?.receipt
    if (!receipt?.id) return
    setSaving(true)
    try {
      await addPurchaseReceiptItem(
        buildPurchaseReceiptItemParams(receipt.id, values)
      )
      message.success('入库明细已添加')
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '添加入库明细'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, itemForm, loadRows, receiptModal?.receipt])

  const runReceiptAction = useCallback(
    async (receipt, action, successText) => {
      if (!receipt?.id) return
      setSaving(true)
      try {
        const nextReceipt = await action({ id: receipt.id })
        setSelectedRow(nextReceipt || receipt)
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

  const selectedRowLabel = selectedRow
    ? `${selectedRow.receipt_no || selectedRow.id} / ${
        selectedRow.supplier_name || '未填写供应商'
      }`
    : '请先选择一张采购入库单'

  const columns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '入库单号',
          exportTitle: '入库单号',
          dataIndex: 'receipt_no',
          width: 160,
          sortType: 'text',
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'status',
          width: 110,
          sortType: 'text',
          render: statusTag,
          exportValue: (record) =>
            STATUS_LABELS[record?.status] || record?.status || '',
        },
        {
          title: '供应商',
          exportTitle: '供应商',
          dataIndex: 'supplier_name',
          width: 180,
          sortType: 'text',
        },
        {
          title: '收货日期',
          exportTitle: '收货日期',
          dataIndex: 'received_at',
          width: 130,
          sortType: 'date',
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record?.received_at),
        },
        {
          title: '过账时间',
          exportTitle: '过账时间',
          dataIndex: 'posted_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.posted_at),
        },
        {
          title: '明细行数',
          exportTitle: '明细行数',
          key: 'item_count',
          width: 100,
          sortValue: receiptItemCount,
          render: (_, record) => receiptItemCount(record),
          exportValue: receiptItemCount,
        },
        {
          title: '入库数量',
          exportTitle: '入库数量',
          key: 'quantity_total',
          width: 120,
          sortValue: receiptQuantityTotal,
          render: (_, record) => formatQuantity(receiptQuantityTotal(record)),
          exportValue: (record) => formatQuantity(receiptQuantityTotal(record)),
        },
        {
          title: '创建时间',
          exportTitle: '创建时间',
          dataIndex: 'created_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.created_at),
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
        {
          title: '备注',
          exportTitle: '备注',
          dataIndex: 'note',
          ellipsis: true,
          sortable: false,
        },
      ]),
    []
  )
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'inbound',
      moduleTitle: '入库管理',
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: 'purchase-receipts.csv',
      columns: visibleColumns,
      rows,
    })
  }, [rows, visibleColumns])

  return (
    <BusinessPageLayout className="erp-v1-purchase-receipts-page">
      <PageHeaderCard
        compact
        title="入库管理"
        description="入库管理当前接入 purchase_receipts / purchase_receipt_items；草稿加明细后由后端过账写库存流水、余额和批次，Workflow 入库任务完成不等于采购入库过账。"
        tags={[
          <Tag color="gold" key="workflow">
            Workflow：协同入库
          </Tag>,
          <Tag color="blue" key="receipt">
            PurchaseReceipt：入库事实
          </Tag>,
          <Tag color="green" key="inventory">
            过账后写 inventory_txns
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总入库单', value: total },
          { key: 'current', label: '当前结果', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
          {
            key: 'posted',
            label: '已过账',
            value: rows.filter((item) => item.status === 'POSTED').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索入库单号 / 供应商"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle="入库管理"
            onExport={exportRows}
            exportDisabled={rows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建入库单
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="过账和取消均由后端采购入库 usecase 写库存事实或冲正；前端不本地改库存。"
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
            disabled={!selectedRow}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'DRAFT' ||
              !canCreate ||
              saving
            }
            onClick={() => openAddItem(selectedRow)}
          >
            添加明细
          </Button>
          <Popconfirm
            title="确认过账并写库存入库事实？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                postPurchaseReceipt,
                '采购入库已过账'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canPost ||
                saving
              }
            >
              过账入库
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认取消已过账入库并写库存冲正？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                cancelPurchaseReceipt,
                '采购入库已取消'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'POSTED' ||
                !canPost ||
                saving
              }
            >
              取消入库
            </Button>
          </Popconfirm>
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
        scroll={{ x: 1320 }}
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
        expandable={{
          columnTitle: '明细',
          expandedRowRender: renderExpandedPurchaseReceiptItems,
          rowExpandable: canExpandPurchaseReceiptRow,
        }}
        emptyDescription="暂无采购入库单"
      />
      {columnOrderModal}

      <BusinessFormModal
        title={
          receiptModal?.mode === 'item' ? '添加入库明细' : '新建采购入库单'
        }
        open={Boolean(receiptModal)}
        onCancel={closeModal}
        onOk={
          receiptModal?.mode === 'item' ? handleAddItem : handleCreateReceipt
        }
        confirmLoading={saving}
        destroyOnHidden
        okText={receiptModal?.mode === 'item' ? '添加明细' : '创建草稿'}
        cancelText="关闭"
      >
        {receiptModal?.mode === 'item' ? (
          <Form
            form={itemForm}
            layout="vertical"
            className="erp-business-action-form erp-business-action-form--grid"
          >
            <PurchaseReceiptItemFormFields
              inventoryLotOptions={inventoryLotOptions}
              materialOptions={materialOptions}
              unitOptions={unitOptions}
              warehouseOptions={warehouseOptions}
            />
          </Form>
        ) : (
          <Form
            form={receiptForm}
            layout="vertical"
            className="erp-business-action-form"
          >
            <div className="erp-business-action-form--grid">
              <Form.Item
                className="erp-business-action-form__field"
                label="入库单号（自动）"
                name="receipt_no"
                rules={[
                  { required: true, message: '请填写或保留自动入库单号' },
                ]}
              >
                <Input
                  allowClear
                  autoFocus
                  autoComplete="off"
                  placeholder="自动生成，可按需要调整"
                />
              </Form.Item>
              <Form.Item
                className="erp-business-action-form__field"
                label="供应商"
                name="supplier_name"
                rules={[{ required: true, message: '请填写供应商' }]}
              >
                <Input allowClear autoComplete="off" />
              </Form.Item>
              <Form.Item
                className="erp-business-action-form__field"
                label="收货日期"
                name="received_at"
              >
                <DateInput />
              </Form.Item>
              <Form.Item
                className="erp-business-action-form__field erp-business-action-form__field--wide"
                label="备注"
                name="note"
              >
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </div>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <section className="erp-master-contact-list erp-purchase-receipt-modal-items">
                  <div className="erp-master-contact-list__head">
                    <div>
                      <strong>入库明细</strong>
                      <span>
                        单头和初始明细由后端一次创建；库存流水仍只在过账时写入。
                      </span>
                    </div>
                  </div>
                  <div className="erp-master-contact-list__items">
                    {fields.map((field) => (
                      <div
                        className="erp-master-contact-list__row"
                        key={field.key}
                      >
                        <div className="erp-master-contact-list__row-head">
                          <strong>明细 {field.name + 1}</strong>
                          <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            disabled={fields.length <= 1}
                            onClick={() => remove(field.name)}
                          >
                            删除
                          </Button>
                        </div>
                        <div className="erp-master-contact-list__grid">
                          <PurchaseReceiptItemFormFields
                            field={field}
                            inventoryLotOptions={inventoryLotOptions}
                            materialOptions={materialOptions}
                            unitOptions={unitOptions}
                            warehouseOptions={warehouseOptions}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="erp-line-items-form__footer">
                    <div className="erp-line-items-form__footer-actions">
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add(createBlankPurchaseReceiptItem())}
                      >
                        添加条目
                      </Button>
                    </div>
                    <div className="erp-line-items-form__stats">
                      <span className="erp-line-items-form__stat">
                        已录入
                        <strong className="erp-line-items-form__stat-value">
                          {fields.length}
                        </strong>
                        条
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </Form.List>
          </Form>
        )}
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
