import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  StopOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessFilterPanel,
  CollaborationTaskPanel,
  BusinessListToolbar,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
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
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
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
import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  getModuleColumnKey,
  repositionModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'

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

const SALES_ORDERS_MODULE_KEY = 'sales-orders'
const SALES_ORDER_ITEMS_MODULE_KEY = 'sales-order-items'
const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

function getColumnLabel(column = {}) {
  return String(column.exportTitle || column.title || column.key || '').trim()
}

function renderColumnHeader(column, onOpenColumnOrder) {
  const label = getColumnLabel(column)
  return (
    <span className="erp-module-column-header">
      <span className="erp-module-column-header-text">{label}</span>
      <Tooltip title="调整列顺序">
        <Button
          type="text"
          size="small"
          className="erp-module-column-header-trigger"
          icon={<SettingOutlined />}
          aria-label={`${label} 列设置`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenColumnOrder?.()
          }}
        />
      </Tooltip>
    </span>
  )
}

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') {
    return []
  }

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
  if (typeof window === 'undefined') {
    return
  }

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
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }

  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) {
    return sanitizedAccountOrder
  }
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
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

function ColumnOrderModal({
  open,
  columns = [],
  order = [],
  saving = false,
  moduleTitle = '',
  onChange,
  onReset,
  onClose,
}) {
  const normalizedOrder = useMemo(() => {
    const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
    return sanitizedOrder.length > 0
      ? sanitizedOrder
      : buildModuleColumnOrder(columns)
  }, [columns, order])
  const orderedColumns = useMemo(
    () => applyModuleColumnOrder(columns, normalizedOrder),
    [columns, normalizedOrder]
  )

  return (
    <Modal
      title="调整列表列顺序"
      open={open}
      onCancel={onClose}
      destroyOnHidden={false}
      footer={
        <Space wrap>
          <Button disabled={saving} onClick={onReset}>
            恢复默认
          </Button>
          <Button type="primary" loading={saving} onClick={onClose}>
            完成
          </Button>
        </Space>
      }
    >
      <div
        className="erp-business-column-order-modal"
        role="list"
        aria-label={`${moduleTitle || '列表'}列顺序`}
      >
        {orderedColumns.map((column, index) => {
          const key = getModuleColumnKey(column, index)
          const label = getColumnLabel(column)
          return (
            <div
              key={key}
              className="erp-business-column-order-modal__row"
              role="listitem"
            >
              <span className="erp-business-column-order-modal__label">
                {label}
              </span>
              <Space size={4}>
                <Tooltip title="移到最前">
                  <Button
                    type="text"
                    size="small"
                    icon={<VerticalAlignTopOutlined />}
                    aria-label={`${label} 移到最前`}
                    disabled={saving || index === 0}
                    onClick={() =>
                      onChange?.(
                        repositionModuleColumnOrder(
                          normalizedOrder,
                          columns,
                          key,
                          0
                        )
                      )
                    }
                  />
                </Tooltip>
                <Tooltip title="移到最后">
                  <Button
                    type="text"
                    size="small"
                    icon={<VerticalAlignBottomOutlined />}
                    aria-label={`${label} 移到最后`}
                    disabled={saving || index === orderedColumns.length - 1}
                    onClick={() =>
                      onChange?.(
                        repositionModuleColumnOrder(
                          normalizedOrder,
                          columns,
                          key,
                          orderedColumns.length - 1
                        )
                      )
                    }
                  />
                </Tooltip>
              </Space>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

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
  const [orderColumnOrder, setOrderColumnOrder] = useState(null)
  const [itemColumnOrder, setItemColumnOrder] = useState(null)
  const [columnOrderTarget, setColumnOrderTarget] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
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

  const persistColumnOrder = useCallback(
    async ({ moduleKey, columns, nextOrder, setLocalOrder }) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(nextOrder, columns)
      setLocalOrder(sanitizedOrder)
      writeStoredColumnOrder(moduleKey, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleKey,
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

  const orderDataColumns = useMemo(
    () => [
      {
        title: '订单号',
        exportTitle: '订单号',
        dataIndex: 'order_no',
        width: 160,
      },
      {
        title: '客户',
        exportTitle: '客户',
        dataIndex: 'customer_snapshot',
        width: 180,
        render: (value, record) =>
          value?.name || `客户 ID ${record.customer_id}`,
        exportValue: (record) =>
          record?.customer_snapshot?.name ||
          (record?.customer_id ? `客户 ID ${record.customer_id}` : ''),
      },
      {
        title: '客户订单号',
        exportTitle: '客户订单号',
        dataIndex: 'customer_order_no',
        width: 150,
        render: (value) => value || '-',
      },
      {
        title: '订单日期',
        exportTitle: '订单日期',
        dataIndex: 'order_date',
        width: 120,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.order_date),
      },
      {
        title: '计划交付',
        exportTitle: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
      },
      {
        title: '生命周期',
        exportTitle: '生命周期',
        dataIndex: 'lifecycle_status',
        width: 120,
        render: salesOrderStatusTag,
        exportValue: (record) =>
          statusText(record?.lifecycle_status, SALES_ORDER_STATUS_LABELS),
      },
    ],
    []
  )

  const effectiveOrderColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: SALES_ORDERS_MODULE_KEY,
        columns: orderDataColumns,
        localOrder: orderColumnOrder,
      }),
    [adminProfile, orderColumnOrder, orderDataColumns]
  )

  const visibleOrderDataColumns = useMemo(
    () => applyModuleColumnOrder(orderDataColumns, effectiveOrderColumnOrder),
    [effectiveOrderColumnOrder, orderDataColumns]
  )

  const orderActionColumn = useMemo(
    () => ({
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
    }),
    [adminProfile, canUpdateOrder]
  )

  const orderColumns = useMemo(
    () => [
      ...visibleOrderDataColumns.map((column) => ({
        ...column,
        title: renderColumnHeader(column, () => setColumnOrderTarget('orders')),
      })),
      orderActionColumn,
    ],
    [orderActionColumn, visibleOrderDataColumns]
  )

  const itemDataColumns = useMemo(
    () => [
      {
        title: '行号',
        exportTitle: '行号',
        dataIndex: 'line_no',
        width: 80,
      },
      {
        title: '产品 ID',
        exportTitle: '产品 ID',
        dataIndex: 'product_id',
        width: 90,
      },
      {
        title: '单位 ID',
        exportTitle: '单位 ID',
        dataIndex: 'unit_id',
        width: 90,
      },
      {
        title: '产品编号',
        exportTitle: '产品编号',
        dataIndex: 'product_code_snapshot',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '产品名称',
        exportTitle: '产品名称',
        dataIndex: 'product_name_snapshot',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '颜色',
        exportTitle: '颜色',
        dataIndex: 'color_snapshot',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '订单数量',
        exportTitle: '订单数量',
        dataIndex: 'ordered_quantity',
        width: 120,
      },
      {
        title: '单价',
        exportTitle: '单价',
        dataIndex: 'unit_price',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '金额',
        exportTitle: '金额',
        dataIndex: 'amount',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '计划交付',
        exportTitle: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
      },
      {
        title: '行状态',
        exportTitle: '行状态',
        dataIndex: 'line_status',
        width: 100,
        render: lineStatusTag,
        exportValue: (record) =>
          statusText(record?.line_status, SALES_ORDER_ITEM_STATUS_LABELS),
      },
    ],
    []
  )

  const effectiveItemColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: SALES_ORDER_ITEMS_MODULE_KEY,
        columns: itemDataColumns,
        localOrder: itemColumnOrder,
      }),
    [adminProfile, itemColumnOrder, itemDataColumns]
  )

  const visibleItemDataColumns = useMemo(
    () => applyModuleColumnOrder(itemDataColumns, effectiveItemColumnOrder),
    [effectiveItemColumnOrder, itemDataColumns]
  )

  const itemActionColumn = useMemo(
    () => ({
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
    }),
    [canCancelItem, canUpdateItem]
  )

  const itemColumns = useMemo(
    () => [
      ...visibleItemDataColumns.map((column) => ({
        ...column,
        title: renderColumnHeader(column, () => setColumnOrderTarget('items')),
      })),
      itemActionColumn,
    ],
    [itemActionColumn, visibleItemDataColumns]
  )

  const exportOrders = useCallback(() => {
    if (orders.length === 0) return
    downloadCSV({
      filename: `sales-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleOrderDataColumns,
      rows: orders,
    })
  }, [orders, visibleOrderDataColumns])

  const exportItems = useCallback(() => {
    if (!selectedOrder || items.length === 0) return
    const orderNo = String(
      selectedOrder.order_no || selectedOrder.id || 'order'
    )
      .trim()
      .replace(/[^\w.-]+/g, '-')
    downloadCSV({
      filename: `sales-order-items-${orderNo}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      columns: visibleItemDataColumns,
      rows: items,
    })
  }, [items, selectedOrder, visibleItemDataColumns])

  const activeOrderCount = useMemo(
    () =>
      orders.filter((order) => String(order.lifecycle_status) === 'active')
        .length,
    [orders]
  )
  const openLineCount = useMemo(
    () => items.filter((item) => String(item.line_status) === 'open').length,
    [items]
  )
  const selectedOrderDisplayText = useMemo(() => {
    if (!selectedOrder) return '请先选择销售订单'
    const customerName =
      selectedOrder.customer_snapshot?.name ||
      `客户 ID ${selectedOrder.customer_id}`
    return `${selectedOrder.order_no || selectedOrder.id} / ${customerName}`
  }, [selectedOrder])
  const selectedOrderSummaryItems = useMemo(() => {
    if (!selectedOrder) return []
    return [
      {
        key: 'status',
        label: '生命周期',
        value: statusText(
          selectedOrder.lifecycle_status,
          SALES_ORDER_STATUS_LABELS
        ),
      },
      {
        key: 'customer-order-no',
        label: '客户订单号',
        value: selectedOrder.customer_order_no || '-',
      },
      {
        key: 'planned-delivery-date',
        label: '计划交付',
        value: formatUnixDate(selectedOrder.planned_delivery_date),
      },
      {
        key: 'lines',
        label: '订单行',
        value: items.length,
      },
    ]
  }, [items.length, selectedOrder])

  return (
    <BusinessPageLayout className="erp-v1-sales-orders-page">
      <PageHeaderCard
        compact
        sectionTitle="销售链路"
        title="销售订单"
        description="销售订单只表示 Source Document / 客户订单承诺，不代表出货、库存扣减、应收、发票或收款已经发生。"
        tags={
          <div className="erp-business-module-chip-row">
            <Tag color="green">正式 sales_orders</Tag>
            <Tag>不写出货 / 库存 / 财务事实</Tag>
          </div>
        }
        stats={[
          { key: 'total', label: '总订单', value: total },
          { key: 'current', label: '当前结果', value: orders.length },
          { key: 'active', label: '已生效', value: activeOrderCount },
          { key: 'selected', label: '已选订单', value: selectedOrder ? 1 : 0 },
        ]}
      />

      <BusinessFilterPanel compact>
        <SearchInput
          placeholder="搜索订单号、客户订单号"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={loadOrders}
        />
        <SelectFilter
          className="erp-business-filter-control--status"
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </BusinessFilterPanel>

      <BusinessListToolbar
        stats={[
          { key: 'current', label: '当前结果', value: orders.length },
          { key: 'lines', label: '当前订单行', value: items.length },
          { key: 'selected', label: '已选订单', value: selectedOrder ? 1 : 0 },
        ]}
        actions={
          <>
            <ToolbarButton
              icon={<ReloadOutlined />}
              onClick={loadOrders}
              loading={loading}
            >
              刷新
            </ToolbarButton>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={orders.length === 0}
              onClick={exportOrders}
            >
              导出当前结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderTarget('orders')}
            >
              列顺序
            </ToolbarButton>
            {canCreateOrder ? (
              <ToolbarButton
                type="primary"
                className="erp-business-list-toolbar__primary-action"
                icon={<PlusOutlined />}
                onClick={openCreateOrder}
              >
                新建订单
              </ToolbarButton>
            ) : null}
          </>
        }
      />

      <SelectionActionBar
        selectedCount={selectedOrder ? 1 : 0}
        selectedLabel={selectedOrderDisplayText}
        summaryItems={selectedOrderSummaryItems}
        boundaryText="当前操作只维护客户订单承诺和订单行，不生成出货、库存、应收、发票或收款事实。"
      >
        <Button
          type="link"
          size="small"
          disabled={!selectedOrder}
          onClick={() => {
            setSelectedOrder(null)
            setItems([])
          }}
        >
          清空已选
        </Button>
        <Button
          size="small"
          disabled={!selectedOrder}
          onClick={() => setDetailOpen(true)}
        >
          查看详情
        </Button>
        {canUpdateOrder ? (
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!selectedOrder}
            onClick={() => openEditOrder(selectedOrder)}
          >
            编辑订单
          </Button>
        ) : null}
        {LIFECYCLE_ACTIONS.filter((action) =>
          hasActionPermission(adminProfile, action.permission)
        ).map((action) => (
          <Button
            key={action.key}
            size="small"
            disabled={!selectedOrder}
            onClick={() => runLifecycleAction(action, selectedOrder)}
          >
            {action.label}
          </Button>
        ))}
      </SelectionActionBar>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderColumns}
        dataSource={orders}
        scroll={{ x: 1240 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        emptyDescription="暂无销售订单"
        rowClassName={(record) =>
          record.id === selectedOrder?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedOrder(record),
        })}
      />

      <BusinessListToolbar
        stats={[
          {
            key: 'order',
            label: '明细订单',
            value: selectedOrder?.order_no || '未选择',
          },
          { key: 'lines', label: '订单行', value: items.length },
          { key: 'open-lines', label: '未关闭行', value: openLineCount },
        ]}
        actions={
          <>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={!selectedOrder || items.length === 0}
              onClick={exportItems}
            >
              导出订单行
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderTarget('items')}
            >
              订单行列顺序
            </ToolbarButton>
            {canCreateItem ? (
              <ToolbarButton
                icon={<PlusOutlined />}
                onClick={openCreateItem}
                disabled={!selectedOrder}
              >
                新增订单行
              </ToolbarButton>
            ) : null}
          </>
        }
      />
      <BusinessDataTable
        rowKey="id"
        loading={selectedOrder ? itemLoading : false}
        columns={itemColumns}
        dataSource={selectedOrder ? items : []}
        scroll={{ x: 1420 }}
        pagination={false}
        emptyDescription={
          selectedOrder ? '当前订单暂无订单行' : '尚未选择销售订单'
        }
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedOrder?.order_no || ''}
      />

      <ColumnOrderModal
        open={columnOrderTarget === 'orders'}
        moduleTitle="销售订单列表"
        columns={orderDataColumns}
        order={effectiveOrderColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) =>
          persistColumnOrder({
            moduleKey: SALES_ORDERS_MODULE_KEY,
            columns: orderDataColumns,
            nextOrder,
            setLocalOrder: setOrderColumnOrder,
          })
        }
        onReset={() =>
          persistColumnOrder({
            moduleKey: SALES_ORDERS_MODULE_KEY,
            columns: orderDataColumns,
            nextOrder: [],
            setLocalOrder: setOrderColumnOrder,
          })
        }
        onClose={() => setColumnOrderTarget(null)}
      />

      <ColumnOrderModal
        open={columnOrderTarget === 'items'}
        moduleTitle="销售订单行列表"
        columns={itemDataColumns}
        order={effectiveItemColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) =>
          persistColumnOrder({
            moduleKey: SALES_ORDER_ITEMS_MODULE_KEY,
            columns: itemDataColumns,
            nextOrder,
            setLocalOrder: setItemColumnOrder,
          })
        }
        onReset={() =>
          persistColumnOrder({
            moduleKey: SALES_ORDER_ITEMS_MODULE_KEY,
            columns: itemDataColumns,
            nextOrder: [],
            setLocalOrder: setItemColumnOrder,
          })
        }
        onClose={() => setColumnOrderTarget(null)}
      />

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
        <p className="erp-business-selection-action-bar__hint">
          当前页面不展示已发货数量，不生成出货、库存预留、库存流水、发票、应收或收款。出货事实后续由
          ShipmentUsecase 接入。
        </p>
      </Drawer>
    </BusinessPageLayout>
  )
}
