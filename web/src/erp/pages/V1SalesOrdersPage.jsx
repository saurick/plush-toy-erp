import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
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
  Modal,
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
  activateSalesOrder,
  addSalesOrderItem,
  cancelSalesOrder,
  closeSalesOrder,
  createSalesOrder,
  listCustomers,
  listSalesOrderItems,
  listSalesOrders,
  removeSalesOrderItem,
  submitSalesOrder,
  updateSalesOrder,
  updateSalesOrderItem,
} from '../api/masterDataOrderApi.mjs'
import {
  SALES_ORDER_ITEM_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
  buildCustomerSnapshot,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  formatUnixDate,
  hasActionPermission,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'

const { Paragraph, Text, Title } = Typography

const STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已生效', value: 'active' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

const LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'sales_order.submit',
    run: submitSalesOrder,
  },
  {
    key: 'activate',
    label: '生效',
    permission: 'sales_order.activate',
    run: activateSalesOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'sales_order.close',
    run: closeSalesOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'sales_order.cancel',
    run: cancelSalesOrder,
  },
]

function salesOrderStatusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={SALES_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, SALES_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function lineStatusTag(status) {
  const key = String(status || '').trim()
  return <Tag>{statusText(key, SALES_ORDER_ITEM_STATUS_LABELS)}</Tag>
}

function SalesOrderFormFields({ customers }) {
  return (
    <>
      <Form.Item
        label="订单号"
        name="order_no"
        rules={[{ required: true, message: '请填写订单号' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="客户"
        name="customer_id"
        rules={[{ required: true, message: '请选择客户' }]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          options={customers.map((customer) => ({
            label: `${customer.code || customer.id} - ${customer.name}`,
            value: customer.id,
          }))}
        />
      </Form.Item>
      <Form.Item label="客户订单号" name="customer_order_no">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="订单日期"
        name="order_date"
        rules={[{ required: true, message: '请选择订单日期' }]}
      >
        <Input type="date" />
      </Form.Item>
      <Form.Item label="计划交付日期" name="planned_delivery_date">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

function SalesOrderItemFormFields() {
  return (
    <>
      <Form.Item
        label="行号"
        name="line_no"
        rules={[{ required: true, message: '请填写行号' }]}
      >
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
        label="单位 ID"
        name="unit_id"
        rules={[{ required: true, message: '请填写单位 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="产品编号快照" name="product_code_snapshot">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="产品名称快照"
        name="product_name_snapshot"
        rules={[{ required: true, message: '请填写产品名称快照' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="颜色快照" name="color_snapshot">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="订单数量"
        name="ordered_quantity"
        rules={[{ required: true, message: '请填写订单数量' }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item label="单价" name="unit_price">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="金额" name="amount">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="计划交付日期" name="planned_delivery_date">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

export default function V1SalesOrdersPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [loading, setLoading] = useState(false)
  const [itemLoading, setItemLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [orderForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canCreateOrder = hasActionPermission(adminProfile, 'sales_order.create')
  const canUpdateOrder = hasActionPermission(adminProfile, 'sales_order.update')
  const canCreateItem = hasActionPermission(
    adminProfile,
    'sales_order_item.create'
  )
  const canUpdateItem = hasActionPermission(
    adminProfile,
    'sales_order_item.update'
  )
  const canCancelItem = hasActionPermission(
    adminProfile,
    'sales_order_item.cancel'
  )

  const loadCustomers = useCallback(async () => {
    try {
      const result = await listCustomers({ active_only: true, limit: 200 })
      setCustomers(Array.isArray(result?.customers) ? result.customers : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载客户选项'))
    }
  }, [])

  const loadItems = useCallback(async (order) => {
    if (!order?.id) {
      setItems([])
      return
    }
    setItemLoading(true)
    try {
      const result = await listSalesOrderItems({
        sales_order_id: order.id,
        limit: 200,
      })
      setItems(
        Array.isArray(result?.sales_order_items) ? result.sales_order_items : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载订单行'))
    } finally {
      setItemLoading(false)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listSalesOrders({
        keyword,
        lifecycle_status: statusFilter,
        limit: 100,
      })
      const nextOrders = Array.isArray(result?.sales_orders)
        ? result.sales_orders
        : []
      setOrders(nextOrders)
      setTotal(Number(result?.total || nextOrders.length || 0))
      setSelectedOrder((current) => {
        if (!current?.id) return nextOrders[0] || null
        return (
          nextOrders.find((item) => item.id === current.id) ||
          nextOrders[0] ||
          null
        )
      })
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载销售订单'))
      return false
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter])

  useEffect(() => {
    loadCustomers()
    loadOrders()
  }, [loadCustomers, loadOrders])

  useEffect(() => {
    loadItems(selectedOrder)
  }, [loadItems, selectedOrder])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadOrders)
  }, [loadOrders, outletContext])

  const openCreateOrder = () => {
    setEditingOrder(null)
    orderForm.resetFields()
    orderForm.setFieldsValue({
      order_date: new Date().toISOString().slice(0, 10),
    })
    setOrderModalOpen(true)
  }

  const openEditOrder = (order) => {
    setEditingOrder(order)
    orderForm.setFieldsValue({
      ...order,
      order_date: unixToDateInputValue(order.order_date),
      planned_delivery_date: unixToDateInputValue(order.planned_delivery_date),
    })
    setOrderModalOpen(true)
  }

  const openCreateItem = () => {
    if (!selectedOrder?.id) {
      message.warning('请先选择销售订单')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({ line_no: items.length + 1 })
    setItemModalOpen(true)
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    itemForm.setFieldsValue({
      ...item,
      planned_delivery_date: unixToDateInputValue(item.planned_delivery_date),
    })
    setItemModalOpen(true)
  }

  const saveOrder = async () => {
    const values = await orderForm.validateFields()
    const customer = customers.find((item) => item.id === values.customer_id)
    setSaving(true)
    try {
      const params = buildSalesOrderParams(
        {
          ...values,
          customer_snapshot: buildCustomerSnapshot(customer),
        },
        editingOrder?.id ? { id: editingOrder.id } : {}
      )
      const saved = editingOrder?.id
        ? await updateSalesOrder(params)
        : await createSalesOrder(params)
      message.success(editingOrder?.id ? '销售订单已更新' : '销售订单已创建')
      setOrderModalOpen(false)
      setSelectedOrder(saved || selectedOrder)
      await loadOrders()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存销售订单'))
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async () => {
    if (!selectedOrder?.id) return
    const values = await itemForm.validateFields()
    setSaving(true)
    try {
      const params = buildSalesOrderItemParams(values, {
        sales_order_id: selectedOrder.id,
        ...(editingItem?.id ? { id: editingItem.id } : {}),
      })
      await (editingItem?.id
        ? updateSalesOrderItem(params)
        : addSalesOrderItem(params))
      message.success(editingItem?.id ? '订单行已更新' : '订单行已新增')
      setItemModalOpen(false)
      await loadItems(selectedOrder)
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存订单行'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, order) => {
    setSaving(true)
    try {
      const updated = await action.run({ id: order.id })
      message.success(`销售订单已${action.label}`)
      setSelectedOrder(updated || order)
      await loadOrders()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${action.label}销售订单`))
    } finally {
      setSaving(false)
    }
  }

  const cancelItem = async (item) => {
    setSaving(true)
    try {
      await removeSalesOrderItem({ id: item.id })
      message.success('订单行已取消')
      await loadItems(selectedOrder)
    } catch (error) {
      message.error(getActionErrorMessage(error, '取消订单行'))
    } finally {
      setSaving(false)
    }
  }

  const orderColumns = useMemo(
    () => [
      { title: '订单号', dataIndex: 'order_no', width: 160 },
      {
        title: '客户',
        dataIndex: 'customer_snapshot',
        width: 180,
        render: (value, record) =>
          value?.name || `客户 ID ${record.customer_id}`,
      },
      {
        title: '客户订单号',
        dataIndex: 'customer_order_no',
        width: 150,
        render: (value) => value || '-',
      },
      {
        title: '订单日期',
        dataIndex: 'order_date',
        width: 120,
        render: formatUnixDate,
      },
      {
        title: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        render: formatUnixDate,
      },
      {
        title: '生命周期',
        dataIndex: 'lifecycle_status',
        width: 120,
        render: salesOrderStatusTag,
      },
      {
        title: '操作',
        key: 'actions',
        width: 360,
        fixed: 'right',
        render: (_, order) => (
          <Space size={6} wrap>
            <Button
              size="small"
              onClick={() => {
                setSelectedOrder(order)
                setDetailOpen(true)
              }}
            >
              查看
            </Button>
            {canUpdateOrder ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditOrder(order)}
              >
                编辑
              </Button>
            ) : null}
            {LIFECYCLE_ACTIONS.filter((action) =>
              hasActionPermission(adminProfile, action.permission)
            ).map((action) => (
              <Button
                key={action.key}
                size="small"
                onClick={() => runLifecycleAction(action, order)}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        ),
      },
    ],
    [adminProfile, canUpdateOrder]
  )

  const itemColumns = useMemo(
    () => [
      { title: '行号', dataIndex: 'line_no', width: 80 },
      { title: '产品 ID', dataIndex: 'product_id', width: 90 },
      { title: '单位 ID', dataIndex: 'unit_id', width: 90 },
      {
        title: '产品编号',
        dataIndex: 'product_code_snapshot',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '产品名称',
        dataIndex: 'product_name_snapshot',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '颜色',
        dataIndex: 'color_snapshot',
        width: 100,
        render: (value) => value || '-',
      },
      { title: '订单数量', dataIndex: 'ordered_quantity', width: 120 },
      {
        title: '单价',
        dataIndex: 'unit_price',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '金额',
        dataIndex: 'amount',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        render: formatUnixDate,
      },
      {
        title: '行状态',
        dataIndex: 'line_status',
        width: 100,
        render: lineStatusTag,
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        fixed: 'right',
        render: (_, item) => (
          <Space size={6} wrap>
            {canUpdateItem ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditItem(item)}
              >
                编辑
              </Button>
            ) : null}
            {canCancelItem ? (
              <Popconfirm
                title="确认取消该订单行？"
                onConfirm={() => cancelItem(item)}
              >
                <Button size="small" icon={<StopOutlined />}>
                  取消
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canCancelItem, canUpdateItem]
  )

  return (
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card className="erp-dashboard-card" variant="borderless">
        <Space className="erp-dashboard-heading-row" align="start">
          <div>
            <Title level={4} className="erp-dashboard-title">
              销售订单
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              销售订单只表示 Source Document /
              客户订单承诺，不代表出货、库存扣减、应收、发票或收款已经发生。
            </Paragraph>
          </div>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadOrders}
              loading={loading}
            >
              刷新
            </Button>
            {canCreateOrder ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreateOrder}
              >
                新建订单
              </Button>
            ) : null}
          </Space>
        </Space>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" size={12} className="erp-dashboard-block">
          <Space wrap>
            <Input.Search
              allowClear
              value={keyword}
              placeholder="搜索订单号、客户订单号"
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={loadOrders}
              style={{ width: 280 }}
            />
            <Select
              value={statusFilter}
              options={STATUS_FILTER_OPTIONS}
              onChange={setStatusFilter}
              style={{ width: 140 }}
            />
            <Tag>共 {total} 条</Tag>
          </Space>
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            columns={orderColumns}
            dataSource={orders}
            scroll={{ x: 1240 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            rowClassName={(record) =>
              record.id === selectedOrder?.id ? 'ant-table-row-selected' : ''
            }
            onRow={(record) => ({
              onClick: () => setSelectedOrder(record),
            })}
          />
        </Space>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" size={12} className="erp-dashboard-block">
          <Space className="erp-dashboard-heading-row" align="start">
            <div>
              <Title level={5} className="erp-dashboard-section-title">
                销售订单行
              </Title>
              <Paragraph type="secondary" className="erp-dashboard-summary">
                {selectedOrder?.order_no
                  ? `当前订单：${selectedOrder.order_no}`
                  : '选择销售订单后查看明细行。'}
              </Paragraph>
            </div>
            {canCreateItem ? (
              <Button
                icon={<PlusOutlined />}
                onClick={openCreateItem}
                disabled={!selectedOrder}
              >
                新增订单行
              </Button>
            ) : null}
          </Space>
          {selectedOrder ? (
            <Table
              rowKey="id"
              size="middle"
              loading={itemLoading}
              columns={itemColumns}
              dataSource={items}
              scroll={{ x: 1420 }}
              pagination={false}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="尚未选择销售订单"
            />
          )}
        </Space>
      </Card>

      <Modal
        title={editingOrder?.id ? '编辑销售订单' : '新建销售订单'}
        open={orderModalOpen}
        onOk={saveOrder}
        onCancel={() => setOrderModalOpen(false)}
        confirmLoading={saving}
        forceRender
        destroyOnHidden={false}
      >
        <Form form={orderForm} layout="vertical">
          <SalesOrderFormFields customers={customers} />
        </Form>
      </Modal>

      <Modal
        title={editingItem?.id ? '编辑订单行' : '新增订单行'}
        open={itemModalOpen}
        onOk={saveItem}
        onCancel={() => setItemModalOpen(false)}
        confirmLoading={saving}
        forceRender
        destroyOnHidden={false}
      >
        <Form form={itemForm} layout="vertical">
          <SalesOrderItemFormFields />
        </Form>
      </Modal>

      <Drawer
        title="销售订单详情"
        width={560}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {selectedOrder ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="订单号">
              {selectedOrder.order_no}
            </Descriptions.Item>
            <Descriptions.Item label="客户">
              {selectedOrder.customer_snapshot?.name ||
                `客户 ID ${selectedOrder.customer_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="客户订单号">
              {selectedOrder.customer_order_no || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="订单日期">
              {formatUnixDate(selectedOrder.order_date)}
            </Descriptions.Item>
            <Descriptions.Item label="计划交付">
              {formatUnixDate(selectedOrder.planned_delivery_date)}
            </Descriptions.Item>
            <Descriptions.Item label="生命周期">
              {salesOrderStatusTag(selectedOrder.lifecycle_status)}
            </Descriptions.Item>
            <Descriptions.Item label="备注">
              {selectedOrder.note || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
        <Paragraph type="secondary" style={{ marginTop: 16 }}>
          当前页面不展示已发货数量，不生成出货、库存预留、库存流水、发票、应收或收款。出货事实后续由
          ShipmentUsecase 接入。
        </Paragraph>
      </Drawer>
    </Space>
  )
}
