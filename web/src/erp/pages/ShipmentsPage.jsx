import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Table,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addShipmentItem,
  cancelShipment,
  createShipmentWithItems,
  listShipments,
  shipShipment,
} from '../api/operationalFactApi.mjs'
import {
  listSalesOrderItems,
  listSalesOrders,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateInput,
  DateRangeFilter,
  PageHeaderCard,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import SourceImportPickerModal from '../components/business-list/SourceImportPickerModal.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'

const BUSINESS_FORM_MODAL_WIDTH = 'min(920px, calc(100vw - 96px))'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已出货', value: 'SHIPPED' },
  { label: '已取消', value: 'CANCELLED' },
]

const DATE_FILTER_OPTIONS = [
  { label: '计划出货', value: 'planned_ship_at' },
  { label: '实际出货', value: 'shipped_at' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SHIPPED: '已出货',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  SHIPPED: 'blue',
  CANCELLED: 'red',
})

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

function positiveInt(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.trunc(numberValue)
    : undefined
}

function requiredInt(value) {
  return positiveInt(value) || 0
}

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}`
}

function buildShipmentParams(values = {}) {
  return compactParams({
    shipment_no: trimOptional(values.shipment_no),
    sales_order_id: positiveInt(values.sales_order_id),
    customer_id: positiveInt(values.customer_id),
    customer_snapshot: trimOptional(values.customer_snapshot),
    idempotency_key: trimOptional(values.idempotency_key),
    planned_ship_at: trimOptional(values.planned_ship_at),
    note: trimOptional(values.note),
  })
}

function buildShipmentItemParams(values = {}) {
  return compactParams({
    shipment_id: requiredInt(values.shipment_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    note: trimOptional(values.note),
  })
}

function buildShipmentWithItemsParams(values = {}) {
  return {
    ...buildShipmentParams(values),
    items: (values.items || []).map((item) => buildShipmentItemParams(item)),
  }
}

function salesOrderCustomerText(order = {}) {
  const snapshot = order.customer_snapshot
  if (typeof snapshot === 'string') {
    return snapshot
  }
  return (
    snapshot?.name ||
    snapshot?.short_name ||
    snapshot?.code ||
    (order.customer_id ? `客户 #${order.customer_id}` : '')
  )
}

function createShipmentItemFromSalesOrderItem(item, shipmentID) {
  const sourceItem = item || {}
  return {
    shipment_id: shipmentID,
    sales_order_item_id: sourceItem.id,
    product_id: sourceItem.product_id,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: sourceItem.unit_id,
    quantity: sourceItem.ordered_quantity || '',
    note: sourceItem.product_name_snapshot
      ? `来源销售订单行：${sourceItem.product_name_snapshot}`
      : '',
  }
}

function isBlankShipmentItem(item = {}) {
  return [
    item.sales_order_item_id,
    item.product_id,
    item.warehouse_id,
    item.lot_id,
    item.unit_id,
    item.quantity,
    item.note,
  ].every((value) => value === undefined || value === null || value === '')
}

function createBlankShipmentItem(shipmentID) {
  return {
    shipment_id: shipmentID,
    sales_order_item_id: undefined,
    product_id: undefined,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: undefined,
    quantity: '',
    note: '',
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
    note: shipment.note || '',
  }
}

function ShipmentFormFields({ disabled = false }) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="出货单号"
        name="shipment_no"
        rules={[{ required: true, message: '请填写出货单号' }]}
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="销售订单 ID"
        name="sales_order_id"
      >
        <InputNumber
          disabled={disabled}
          min={1}
          precision={0}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户 ID"
        name="customer_id"
      >
        <InputNumber
          disabled={disabled}
          min={1}
          precision={0}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户快照"
        name="customer_snapshot"
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true, message: '请填写幂等键' }]}
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="计划出货日期"
        name="planned_ship_at"
      >
        <DateInput disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea
          allowClear
          disabled={disabled}
          rows={3}
          maxLength={300}
          showCount
        />
      </Form.Item>
    </>
  )
}

function ShipmentItemFormFields({ field, showShipmentID = false }) {
  const namePrefix = field ? field.name : undefined
  const fieldName = (key) => (field ? [namePrefix, key] : key)
  return (
    <>
      {showShipmentID ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="出货单 ID"
          name={fieldName('shipment_id')}
          rules={[{ required: true, message: '请选择出货单' }]}
        >
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="销售订单行 ID"
        name={fieldName('sales_order_item_id')}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="产品 ID"
        name={fieldName('product_id')}
        rules={[{ required: true, message: '请填写产品 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="仓库 ID"
        name={fieldName('warehouse_id')}
        rules={[{ required: true, message: '请填写仓库 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次 ID"
        name={fieldName('lot_id')}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位 ID"
        name={fieldName('unit_id')}
        rules={[{ required: true, message: '请填写单位 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="数量"
        name={fieldName('quantity')}
        rules={[{ required: true, message: '请填写数量' }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name={fieldName('note')}
      >
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

function ShipmentItemsTable({ items = [] }) {
  return (
    <Table
      rowKey="id"
      size="small"
      dataSource={items}
      pagination={false}
      locale={{ emptyText: <Empty description="暂无出货明细" /> }}
      scroll={{ x: 760 }}
      columns={[
        { title: '行 ID', dataIndex: 'id', width: 80 },
        { title: '销售订单行', dataIndex: 'sales_order_item_id', width: 120 },
        { title: '产品', dataIndex: 'product_id', width: 100 },
        {
          title: '仓库 / 批次 / 单位',
          width: 180,
          render: (_, record) =>
            `W${record.warehouse_id || '-'} / L${record.lot_id || '-'} / U${
              record.unit_id || '-'
            }`,
        },
        { title: '数量', dataIndex: 'quantity', width: 120 },
        { title: '备注', dataIndex: 'note' },
      ]}
    />
  )
}

export default function ShipmentsPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('planned_ship_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [shipmentModal, setShipmentModal] = useState(null)
  const [salesOrderSources, setSalesOrderSources] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [salesOrderImportOpen, setSalesOrderImportOpen] = useState(false)
  const [shipmentForm] = Form.useForm()

  const canCreate = hasPermission(adminProfile, 'shipment.create')
  const canShip = hasPermission(adminProfile, 'shipment.ship')
  const canCancel = hasPermission(adminProfile, 'shipment.cancel')

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listShipments(
        compactParams({
          status: statusFilter,
          date_field: dateFilterField,
          date_from: dateFilterStart || undefined,
          date_to: dateFilterEnd || undefined,
          ...getBusinessPaginationParams(pagination),
        })
      )
      const nextRows = Array.isArray(data?.shipments) ? data.shipments : []
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || current
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载出货单'))
    } finally {
      setLoading(false)
    }
  }, [
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    pagination,
    statusFilter,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

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
  const isAppendModal = shipmentModalMode === 'append'
  const salesOrderImportColumns = useMemo(
    () => [
      {
        title: '销售订单号',
        dataIndex: 'order_no',
        width: 160,
        searchText: (order) =>
          [
            order.order_no,
            order.customer_order_no,
            salesOrderCustomerText(order),
          ].join(' '),
      },
      { title: '客户订单号', dataIndex: 'customer_order_no', width: 140 },
      {
        title: '客户',
        width: 190,
        render: (_, order) => salesOrderCustomerText(order) || '-',
        searchText: (order) => salesOrderCustomerText(order),
      },
      {
        title: '状态',
        dataIndex: 'lifecycle_status',
        width: 110,
      },
      {
        title: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        render: formatUnixDate,
      },
    ],
    []
  )

  const loadSalesOrderSources = useCallback(async () => {
    setSourceLoading(true)
    try {
      const data = await listSalesOrders({
        lifecycle_status: 'active',
        limit: 100,
      })
      setSalesOrderSources(
        Array.isArray(data?.sales_orders) ? data.sales_orders : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载销售订单来源'))
    } finally {
      setSourceLoading(false)
    }
  }, [])

  const openSalesOrderImport = () => {
    setSalesOrderImportOpen(true)
    loadSalesOrderSources()
  }

  const importSalesOrderToShipment = async (orders = []) => {
    const sourceOrder = orders[0]
    if (!sourceOrder?.id) return
    try {
      setSourceLoading(true)
      const data = await listSalesOrderItems({
        sales_order_id: sourceOrder.id,
        line_status: 'open',
        limit: 200,
      })
      const sourceItems = Array.isArray(data?.sales_order_items)
        ? data.sales_order_items
        : []
      shipmentForm.setFieldsValue({
        sales_order_id: sourceOrder.id,
        customer_id: sourceOrder.customer_id,
        customer_snapshot: salesOrderCustomerText(sourceOrder),
      })
      if (sourceItems.length > 0) {
        const currentItems = (shipmentForm.getFieldValue('items') || []).filter(
          (item) => !isBlankShipmentItem(item)
        )
        shipmentForm.setFieldsValue({
          items: [
            ...currentItems,
            ...sourceItems.map((item) =>
              createShipmentItemFromSalesOrderItem(
                item,
                modalSelectedShipment?.id
              )
            ),
          ],
        })
        message.success('已导入销售订单来源和出货明细')
      } else {
        message.warning('已带出销售订单信息，但该订单暂无可导入明细')
      }
      setSalesOrderImportOpen(false)
    } catch (error) {
      message.error(getActionErrorMessage(error, '导入销售订单来源'))
    } finally {
      setSourceLoading(false)
    }
  }

  const openCreate = () => {
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      idempotency_key: idempotencyKey('shipment'),
      planned_ship_at: new Date().toISOString().slice(0, 10),
      items: [createBlankShipmentItem()],
    })
    setShipmentModal({ mode: 'create', shipment: null })
  }

  const openAppendItems = (shipment) => {
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      ...shipmentFormValues(shipment),
      items: [createBlankShipmentItem(shipment?.id)],
    })
    setShipmentModal({ mode: 'append', shipment })
  }

  const closeShipmentModal = () => {
    setSalesOrderImportOpen(false)
    setShipmentModal(null)
    shipmentForm.resetFields()
  }

  const addShipmentItems = async (shipmentID, items = []) => {
    if (!positiveInt(shipmentID)) {
      throw new Error('缺少出货单 ID，无法保存出货明细')
    }
    const normalizedItems = items.map((item) =>
      buildShipmentItemParams({ ...item, shipment_id: shipmentID })
    )
    for (const item of normalizedItems) {
      await addShipmentItem(item)
    }
  }

  const submitShipmentModal = async () => {
    try {
      const values = await shipmentForm.validateFields()
      setSaving(true)
      if (isCreateModal) {
        await createShipmentWithItems(buildShipmentWithItemsParams(values))
        message.success('出货单草稿和明细已保存')
      } else if (isAppendModal) {
        await addShipmentItems(modalSelectedShipment?.id, values.items || [])
        message.success('出货明细已保存')
      }
      closeShipmentModal()
      await loadRows()
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

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 72, fixed: 'left' },
    {
      title: '出货单号',
      dataIndex: 'shipment_no',
      width: 180,
      ellipsis: true,
    },
    { title: '状态', dataIndex: 'status', width: 110, render: statusTag },
    { title: '销售订单', dataIndex: 'sales_order_id', width: 120 },
    {
      title: '客户',
      width: 160,
      render: (_, record) =>
        record.customer_snapshot ||
        (record.customer_id ? `客户 #${record.customer_id}` : '-'),
      ellipsis: true,
    },
    {
      title: '明细行',
      width: 90,
      render: (_, record) => record.items?.length || 0,
    },
    {
      title: '计划 / 实际出货',
      width: 180,
      render: (_, record) =>
        `${formatUnixDate(record.planned_ship_at)} / ${formatUnixDate(
          record.shipped_at
        )}`,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: formatUnixDateTime,
      sorter: (a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0),
    },
    {
      title: '备注',
      dataIndex: 'note',
      ellipsis: true,
    },
  ]
  const selectedRowLabel = selectedRow
    ? `${selectedRow.shipment_no || selectedRow.id} / ${
        selectedRow.customer_snapshot ||
        (selectedRow.customer_id
          ? `客户 #${selectedRow.customer_id}`
          : '未指定客户')
      }`
    : '请先选择一张出货单'

  return (
    <BusinessPageLayout className="erp-v1-shipments-page">
      <PageHeaderCard
        compact
        title="出货单"
        description="出货单对应 shipments / shipment_items；只有确认出货后的 SHIPPED 才是真实出货事实，并由后端写 inventory_txns.OUT。"
        tags={[
          <Tag color="gold" key="release">
            出货放行：可发货
          </Tag>,
          <Tag color="blue" key="shipment">
            出货单：已出货事实
          </Tag>,
          <Tag color="green" key="inventory">
            出库管理：库存出库事实
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总出货单', value: total },
          { key: 'current', label: '当前结果', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
          { key: 'selected', label: '已选出货单', value: selectedRow ? 1 : 0 },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={DATE_FILTER_OPTIONS}
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
          </>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建草稿
          </ToolbarButton>
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
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'DRAFT' ||
              !canCreate ||
              saving
            }
            onClick={() => openAppendItems(selectedRow)}
          >
            添加明细
          </Button>
          <Popconfirm
            title="确认出货并写库存 OUT？"
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
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canShip ||
                saving
              }
            >
              出货
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认取消并写出库冲正？"
            onConfirm={() =>
              runShipmentAction(selectedRow, cancelShipment, '取消出货')
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
                selectedRow.status !== 'SHIPPED' ||
                !canCancel ||
                saving
              }
            >
              取消
            </Button>
          </Popconfirm>
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
        emptyDescription="暂无出货单"
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
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        title={
          <div className="erp-business-action-modal__title">
            <span>
              {isCreateModal
                ? '新建出货单'
                : isAppendModal
                  ? '维护出货明细'
                  : '维护出货明细'}
            </span>
            <small>
              出货单弹窗上方维护主表字段，下方维护出货明细；新建保存由后端事务一次写入。
            </small>
          </div>
        }
        open={Boolean(shipmentModal)}
        onCancel={closeShipmentModal}
        onOk={submitShipmentModal}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: !canCreate }}
        width={BUSINESS_FORM_MODAL_WIDTH}
        centered
        forceRender
        destroyOnHidden={false}
      >
        <Form
          layout="vertical"
          form={shipmentForm}
          className="erp-business-action-form"
        >
          <ShipmentFormFields disabled={!isCreateModal} />
          {modalSelectedShipment ? (
            <section className="erp-master-contact-list erp-shipment-modal-items">
              <div className="erp-master-contact-list__head">
                <div>
                  <strong>已保存出货明细</strong>
                  <span>当前出货单已保存的明细只读展示。</span>
                </div>
                <Tag>{modalSelectedShipment.items?.length || 0} 行</Tag>
              </div>
              <ShipmentItemsTable items={modalSelectedShipment.items || []} />
            </section>
          ) : null}
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <section className="erp-master-contact-list erp-shipment-modal-items">
                <div className="erp-master-contact-list__head">
                  <div>
                    <strong>
                      {isCreateModal ? '出货明细' : '新增出货明细'}
                    </strong>
                    <span>
                      明细随当前弹窗保存；可从销售订单导入来源，库存 OUT
                      仍由确认出货动作写入。
                    </span>
                  </div>
                </div>
                <div className="erp-line-items-form__import-row">
                  <div className="erp-line-items-form__import-copy">
                    <strong>从销售订单导入</strong>
                    <span>
                      先选择销售订单来源；产品、单位和订单行追溯带回主弹窗，仓库
                      / 批次仍在出货明细里补齐。
                    </span>
                  </div>
                  <Button
                    className="erp-line-items-form__import-button"
                    onClick={openSalesOrderImport}
                  >
                    从销售订单导入
                  </Button>
                </div>
                <SourceImportPickerModal
                  open={salesOrderImportOpen}
                  title="从销售订单导入出货明细"
                  description="这里只选择来源销售订单；导入后回到主弹窗维护本次出货数量、仓库和批次。"
                  rows={salesOrderSources}
                  columns={salesOrderImportColumns}
                  multiple={false}
                  loading={sourceLoading}
                  getSelectedLabel={(order) =>
                    order?.order_no ||
                    order?.customer_order_no ||
                    order?.id ||
                    '-'
                  }
                  searchPlaceholder="搜索销售订单号、客户订单号或客户"
                  emptyDescription="暂无可导入销售订单"
                  onCancel={() => setSalesOrderImportOpen(false)}
                  onImport={importSalesOrderToShipment}
                />
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
                        <ShipmentItemFormFields field={field} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="erp-line-items-form__footer">
                  <div className="erp-line-items-form__footer-actions">
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() =>
                        add(createBlankShipmentItem(modalSelectedShipment?.id))
                      }
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
      </Modal>
    </BusinessPageLayout>
  )
}
