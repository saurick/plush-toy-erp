import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addShipmentItem,
  cancelShipment,
  createShipment,
  listShipments,
  shipShipment,
} from '../api/operationalFactApi.mjs'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'

const { Paragraph, Text, Title } = Typography

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已出货', value: 'SHIPPED' },
  { label: '已取消', value: 'CANCELLED' },
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

function ShipmentFormFields() {
  return (
    <>
      <Form.Item
        label="出货单号"
        name="shipment_no"
        rules={[{ required: true, message: '请填写出货单号' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="销售订单 ID" name="sales_order_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="客户 ID" name="customer_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="客户快照" name="customer_snapshot">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true, message: '请填写幂等键' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="计划出货日期" name="planned_ship_at">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

function ShipmentItemFormFields() {
  return (
    <>
      <Form.Item
        label="出货单 ID"
        name="shipment_id"
        rules={[{ required: true, message: '请选择出货单' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="销售订单行 ID" name="sales_order_item_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="产品 ID"
        name="product_id"
        rules={[{ required: true, message: '请填写产品 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="仓库 ID"
        name="warehouse_id"
        rules={[{ required: true, message: '请填写仓库 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="批次 ID" name="lot_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="单位 ID"
        name="unit_id"
        rules={[{ required: true, message: '请填写单位 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="数量"
        name="quantity"
        rules={[{ required: true, message: '请填写数量' }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item label="备注" name="note">
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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [detailShipment, setDetailShipment] = useState(null)
  const [createForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canCreate = hasPermission(adminProfile, 'shipment.create')
  const canShip = hasPermission(adminProfile, 'shipment.ship')
  const canCancel = hasPermission(adminProfile, 'shipment.cancel')

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listShipments(
        compactParams({ status: statusFilter, limit: 100, offset: 0 })
      )
      setRows(Array.isArray(data?.shipments) ? data.shipments : [])
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载出货单'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const selectedDetail = useMemo(() => {
    if (!detailShipment?.id) {
      return null
    }
    return rows.find((item) => item.id === detailShipment.id) || detailShipment
  }, [detailShipment, rows])

  const openCreate = () => {
    createForm.setFieldsValue({
      idempotency_key: idempotencyKey('shipment'),
      planned_ship_at: new Date().toISOString().slice(0, 10),
    })
    setCreateOpen(true)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    createForm.resetFields()
  }

  const submitCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setSaving(true)
      await createShipment(buildShipmentParams(values))
      message.success('出货单草稿已保存')
      closeCreate()
      await loadRows()
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '新建出货单'))
    } finally {
      setSaving(false)
    }
  }

  const openItem = (shipment) => {
    itemForm.setFieldsValue({ shipment_id: shipment?.id })
    setItemOpen(true)
  }

  const closeItem = () => {
    setItemOpen(false)
    itemForm.resetFields()
  }

  const submitItem = async () => {
    try {
      const values = await itemForm.validateFields()
      setSaving(true)
      await addShipmentItem(buildShipmentItemParams(values))
      message.success('出货明细已保存')
      closeItem()
      await loadRows()
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '保存出货明细'))
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
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailShipment(record)}
          >
            详情
          </Button>
          {record.status === 'DRAFT' ? (
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={!canCreate || saving}
              onClick={() => openItem(record)}
            >
              加行
            </Button>
          ) : null}
          {record.status === 'DRAFT' ? (
            <Popconfirm
              title="确认出货并写库存 OUT？"
              onConfirm={() =>
                runShipmentAction(record, shipShipment, '确认出货')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={!canShip || saving}
              >
                出货
              </Button>
            </Popconfirm>
          ) : null}
          {record.status === 'SHIPPED' ? (
            <Popconfirm
              title="确认取消并写出库冲正？"
              onConfirm={() =>
                runShipmentAction(record, cancelShipment, '取消出货')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={!canCancel || saving}
              >
                取消
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" size={8}>
          <Title level={2} className="erp-dashboard-title">
            出货单
          </Title>
          <Paragraph className="erp-dashboard-summary">
            出货单对应 shipments / shipment_items。出货放行只表示可发货，
            出库管理只看库存出库事实；只有本页确认出货后的 SHIPPED
            才是真实出货事实，并由后端写 inventory_txns.OUT。
          </Paragraph>
          <Space wrap>
            <Tag color="gold">出货放行：可发货</Tag>
            <Tag color="blue">出货单：已出货事实</Tag>
            <Tag color="green">出库管理：库存出库事实</Tag>
          </Space>
        </Space>
      </Card>

      <Card className="erp-dashboard-table-card" variant="borderless">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space
            wrap
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <Space wrap>
              <Select
                value={statusFilter}
                options={STATUS_OPTIONS}
                style={{ width: 140 }}
                onChange={setStatusFilter}
              />
              <Text type="secondary">共 {total} 条</Text>
            </Space>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!canCreate}
                onClick={openCreate}
              >
                新建草稿
              </Button>
            </Space>
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: <Empty description="暂无出货单" /> }}
            scroll={{ x: 1320 }}
          />
        </Space>
      </Card>

      <Drawer
        title="出货单明细"
        open={Boolean(selectedDetail)}
        onClose={() => setDetailShipment(null)}
        width={760}
      >
        {selectedDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="出货单号">
                {selectedDetail.shipment_no || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {statusTag(selectedDetail.status)}
              </Descriptions.Item>
              <Descriptions.Item label="销售订单">
                {selectedDetail.sales_order_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户">
                {selectedDetail.customer_snapshot ||
                  selectedDetail.customer_id ||
                  '-'}
              </Descriptions.Item>
              <Descriptions.Item label="计划出货">
                {formatUnixDate(selectedDetail.planned_ship_at)}
              </Descriptions.Item>
              <Descriptions.Item label="实际出货">
                {formatUnixDate(selectedDetail.shipped_at)}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedDetail.note || '-'}
              </Descriptions.Item>
            </Descriptions>
            <ShipmentItemsTable items={selectedDetail.items || []} />
          </Space>
        ) : null}
      </Drawer>

      <Drawer
        title="新建出货单草稿"
        open={createOpen}
        onClose={closeCreate}
        width={520}
        extra={
          <Button
            type="primary"
            loading={saving}
            disabled={!canCreate}
            onClick={submitCreate}
          >
            保存
          </Button>
        }
      >
        <Form layout="vertical" form={createForm}>
          <ShipmentFormFields />
        </Form>
      </Drawer>

      <Drawer
        title="添加出货明细"
        open={itemOpen}
        onClose={closeItem}
        width={520}
        extra={
          <Button
            type="primary"
            loading={saving}
            disabled={!canCreate}
            onClick={submitItem}
          >
            保存
          </Button>
        }
      >
        <Form layout="vertical" form={itemForm}>
          <ShipmentItemFormFields />
        </Form>
      </Drawer>
    </Space>
  )
}
