import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  CollaborationTaskPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
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
  formatUnixDateTime,
  hasActionPermission,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
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
const OPEN_LINE_STATUS = 'open'
const BUSINESS_FORM_MODAL_WIDTH = 'min(960px, calc(100vw - 96px))'

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
          icon={<MoreOutlined />}
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

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0)
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

function createBlankOrderLine(lineNo = 1) {
  return {
    line_no: lineNo,
    product_id: undefined,
    unit_id: undefined,
    product_code_snapshot: '',
    product_name_snapshot: '',
    color_snapshot: '',
    ordered_quantity: '',
    unit_price: '',
    amount: '',
    planned_delivery_date: '',
    note: '',
  }
}

function normalizeSalesOrderItemFormValue(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    product_id: item.product_id,
    unit_id: item.unit_id,
    product_code_snapshot: item.product_code_snapshot || '',
    product_name_snapshot: item.product_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    ordered_quantity: item.ordered_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    planned_delivery_date: unixToDateInputValue(item.planned_delivery_date),
    note: item.note || '',
  }
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function SalesOrderFormFields({ customers }) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="订单号"
        name="order_no"
        rules={[{ required: true, message: '请填写订单号' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
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
      <Form.Item
        className="erp-business-action-form__field"
        label="客户订单号"
        name="customer_order_no"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="订单日期"
        name="order_date"
        rules={[{ required: true, message: '请选择订单日期' }]}
      >
        <Input type="date" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="计划交付日期"
        name="planned_delivery_date"
      >
        <Input type="date" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

function SalesOrderItemsFormSection({
  form,
  canCreateItem,
  canUpdateItem,
  canCancelItem,
}) {
  return (
    <section className="erp-sales-order-lines-form">
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            <div className="erp-sales-order-lines-form__head">
              <div>
                <strong>订单行</strong>
                <span>同一个销售订单内维护多条客户承诺明细。</span>
              </div>
              <Button
                icon={<PlusOutlined />}
                disabled={!canCreateItem}
                onClick={() => {
                  const currentLines = form.getFieldValue('items') || []
                  add(createBlankOrderLine(getNextLineNo(currentLines)))
                }}
              >
                新增一行
              </Button>
            </div>
            {fields.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无订单行，可在同一表单内新增"
              />
            ) : (
              <div className="erp-sales-order-lines-form__list">
                {fields.map((field, index) => {
                  const lineId = form.getFieldValue(['items', field.name, 'id'])
                  const isExistingLine = Boolean(lineId)
                  const canEditLine = isExistingLine
                    ? canUpdateItem
                    : canCreateItem
                  const canRemoveLine = isExistingLine
                    ? canCancelItem
                    : canCreateItem

                  return (
                    <div
                      key={field.key}
                      className="erp-sales-order-lines-form__row"
                    >
                      <div className="erp-sales-order-lines-form__row-head">
                        <Space wrap size={8}>
                          <strong>第 {index + 1} 行</strong>
                          {isExistingLine ? <Tag>已保存</Tag> : <Tag>新增</Tag>}
                        </Space>
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={!canRemoveLine}
                          onClick={() => remove(field.name)}
                        >
                          移除
                        </Button>
                      </div>
                      <div className="erp-sales-order-lines-form__grid">
                        <Form.Item name={[field.name, 'id']} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          label="行号"
                          name={[field.name, 'line_no']}
                          rules={[{ required: true, message: '请填写行号' }]}
                        >
                          <InputNumber
                            min={1}
                            precision={0}
                            disabled={!canEditLine}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Form.Item
                          label="产品 ID"
                          name={[field.name, 'product_id']}
                          rules={[{ required: true, message: '请填写产品 ID' }]}
                        >
                          <InputNumber
                            min={1}
                            precision={0}
                            disabled={!canEditLine}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Form.Item
                          label="单位 ID"
                          name={[field.name, 'unit_id']}
                          rules={[{ required: true, message: '请填写单位 ID' }]}
                        >
                          <InputNumber
                            min={1}
                            precision={0}
                            disabled={!canEditLine}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Form.Item
                          label="产品编号快照"
                          name={[field.name, 'product_code_snapshot']}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item
                          label="产品名称快照"
                          name={[field.name, 'product_name_snapshot']}
                          rules={[
                            {
                              required: true,
                              message: '请填写产品名称快照',
                            },
                          ]}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item
                          label="颜色快照"
                          name={[field.name, 'color_snapshot']}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item
                          label="订单数量"
                          name={[field.name, 'ordered_quantity']}
                          rules={[
                            { required: true, message: '请填写订单数量' },
                          ]}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                            placeholder="decimal，如 120.5"
                          />
                        </Form.Item>
                        <Form.Item
                          label="单价"
                          name={[field.name, 'unit_price']}
                        >
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item label="金额" name={[field.name, 'amount']}>
                          <Input
                            allowClear
                            autoComplete="off"
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                        <Form.Item
                          label="计划交付日期"
                          name={[field.name, 'planned_delivery_date']}
                        >
                          <Input type="date" disabled={!canEditLine} />
                        </Form.Item>
                        <Form.Item
                          className="erp-sales-order-lines-form__field--full"
                          label="备注"
                          name={[field.name, 'note']}
                        >
                          <Input.TextArea
                            allowClear
                            rows={2}
                            showCount
                            maxLength={300}
                            disabled={!canEditLine}
                          />
                        </Form.Item>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Form.List>
    </section>
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
  const [detailOpen, setDetailOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [orderFormOriginalItems, setOrderFormOriginalItems] = useState([])
  const [orderColumnOrder, setOrderColumnOrder] = useState(null)
  const [itemColumnOrder, setItemColumnOrder] = useState(null)
  const [columnOrderTarget, setColumnOrderTarget] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteReason, setBatchDeleteReason] = useState('')
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [recycleSelectedRowKeys, setRecycleSelectedRowKeys] = useState([])
  const [orderForm] = Form.useForm()

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
    setOrderFormOriginalItems([])
    orderForm.resetFields()
    orderForm.setFieldsValue({
      order_date: new Date().toISOString().slice(0, 10),
      items: [],
    })
    setOrderModalOpen(true)
  }

  const openEditOrder = async (order) => {
    if (!order?.id) return
    setSelectedOrder(order)
    setDetailOpen(false)
    setEditingOrder(order)
    orderForm.setFieldsValue({
      ...order,
      order_date: unixToDateInputValue(order.order_date),
      planned_delivery_date: unixToDateInputValue(order.planned_delivery_date),
      items: [],
    })
    setOrderModalOpen(true)
    setItemLoading(true)
    try {
      const result = await listSalesOrderItems({
        sales_order_id: order.id,
        limit: 200,
      })
      const nextItems = Array.isArray(result?.sales_order_items)
        ? result.sales_order_items
        : []
      setItems(nextItems)
      const openItems = nextItems.filter(
        (item) => String(item?.line_status) === OPEN_LINE_STATUS
      )
      setOrderFormOriginalItems(openItems)
      orderForm.setFieldsValue({
        ...order,
        order_date: unixToDateInputValue(order.order_date),
        planned_delivery_date: unixToDateInputValue(
          order.planned_delivery_date
        ),
        items: openItems.map(normalizeSalesOrderItemFormValue),
      })
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载订单行'))
      setOrderFormOriginalItems([])
    } finally {
      setItemLoading(false)
    }
  }

  const syncOrderFormItems = async (orderId, formItems = []) => {
    const submittedItems = Array.isArray(formItems) ? formItems : []
    const existingOpenItems = Array.isArray(orderFormOriginalItems)
      ? orderFormOriginalItems
      : []
    const submittedIds = new Set()

    for (const item of submittedItems) {
      const itemId = Number(item?.id || 0)
      const params = buildSalesOrderItemParams(item, {
        sales_order_id: orderId,
      })
      if (itemId > 0) {
        submittedIds.add(itemId)
        if (canUpdateItem) {
          await updateSalesOrderItem({ ...params, id: itemId })
        }
      } else if (canCreateItem) {
        await addSalesOrderItem(params)
      }
    }

    if (!canCancelItem) {
      return
    }

    for (const existingItem of existingOpenItems) {
      if (!submittedIds.has(existingItem.id)) {
        await removeSalesOrderItem({ id: existingItem.id })
      }
    }
  }

  const saveOrder = async () => {
    const values = await orderForm.validateFields()
    const customer = customers.find((item) => item.id === values.customer_id)
    setSaving(true)
    let saved = null
    try {
      const params = buildSalesOrderParams(
        {
          ...values,
          customer_snapshot: buildCustomerSnapshot(customer),
        },
        editingOrder?.id ? { id: editingOrder.id } : {}
      )
      saved = editingOrder?.id
        ? await updateSalesOrder(params)
        : await createSalesOrder(params)
      if (saved?.id) {
        await syncOrderFormItems(saved.id, values.items)
      }
      message.success(
        editingOrder?.id ? '销售订单与订单行已更新' : '销售订单已创建'
      )
      setOrderModalOpen(false)
      setSelectedOrder(saved || selectedOrder)
      await loadOrders()
      await loadItems(saved || selectedOrder)
    } catch (error) {
      message.error(
        getActionErrorMessage(
          error,
          saved ? '销售订单已保存，订单行保存失败' : '保存销售订单'
        )
      )
      if (saved?.id) {
        setSelectedOrder(saved)
        await loadOrders()
        await loadItems(saved)
      }
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
        sorter: (a, b) => compareText(a?.order_no, b?.order_no),
      },
      {
        title: '客户',
        exportTitle: '客户',
        dataIndex: 'customer_snapshot',
        width: 180,
        sorter: (a, b) =>
          compareText(a?.customer_snapshot?.name, b?.customer_snapshot?.name),
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
        sorter: (a, b) =>
          compareText(a?.customer_order_no, b?.customer_order_no),
        render: (value) => value || '-',
      },
      {
        title: '订单日期',
        exportTitle: '订单日期',
        dataIndex: 'order_date',
        width: 120,
        sorter: (a, b) => compareNumber(a?.order_date, b?.order_date),
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.order_date),
      },
      {
        title: '计划交付',
        exportTitle: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        sorter: (a, b) =>
          compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
      },
      {
        title: '生命周期',
        exportTitle: '生命周期',
        dataIndex: 'lifecycle_status',
        width: 120,
        sorter: (a, b) => compareText(a?.lifecycle_status, b?.lifecycle_status),
        render: salesOrderStatusTag,
        exportValue: (record) =>
          statusText(record?.lifecycle_status, SALES_ORDER_STATUS_LABELS),
      },
      {
        title: '创建时间',
        exportTitle: '创建时间',
        dataIndex: 'created_at',
        width: 160,
        sorter: (a, b) => compareNumber(a?.created_at, b?.created_at),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.created_at),
      },
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 160,
        sorter: (a, b) => compareNumber(a?.updated_at, b?.updated_at),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.updated_at),
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

  const orderColumns = useMemo(
    () =>
      visibleOrderDataColumns.map((column) => ({
        ...column,
        title: renderColumnHeader(column, () => setColumnOrderTarget('orders')),
      })),
    [visibleOrderDataColumns]
  )

  const itemDataColumns = useMemo(
    () => [
      {
        title: '行号',
        exportTitle: '行号',
        dataIndex: 'line_no',
        width: 80,
        sorter: (a, b) => compareNumber(a?.line_no, b?.line_no),
      },
      {
        title: '产品 ID',
        exportTitle: '产品 ID',
        dataIndex: 'product_id',
        width: 90,
        sorter: (a, b) => compareNumber(a?.product_id, b?.product_id),
      },
      {
        title: '单位 ID',
        exportTitle: '单位 ID',
        dataIndex: 'unit_id',
        width: 90,
        sorter: (a, b) => compareNumber(a?.unit_id, b?.unit_id),
      },
      {
        title: '产品编号',
        exportTitle: '产品编号',
        dataIndex: 'product_code_snapshot',
        width: 140,
        sorter: (a, b) =>
          compareText(a?.product_code_snapshot, b?.product_code_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '产品名称',
        exportTitle: '产品名称',
        dataIndex: 'product_name_snapshot',
        width: 180,
        sorter: (a, b) =>
          compareText(a?.product_name_snapshot, b?.product_name_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '颜色',
        exportTitle: '颜色',
        dataIndex: 'color_snapshot',
        width: 100,
        sorter: (a, b) => compareText(a?.color_snapshot, b?.color_snapshot),
        render: (value) => value || '-',
      },
      {
        title: '订单数量',
        exportTitle: '订单数量',
        dataIndex: 'ordered_quantity',
        width: 120,
        sorter: (a, b) =>
          compareNumber(a?.ordered_quantity, b?.ordered_quantity),
      },
      {
        title: '单价',
        exportTitle: '单价',
        dataIndex: 'unit_price',
        width: 100,
        sorter: (a, b) => compareNumber(a?.unit_price, b?.unit_price),
        render: (value) => value || '-',
      },
      {
        title: '金额',
        exportTitle: '金额',
        dataIndex: 'amount',
        width: 100,
        sorter: (a, b) => compareNumber(a?.amount, b?.amount),
        render: (value) => value || '-',
      },
      {
        title: '计划交付',
        exportTitle: '计划交付',
        dataIndex: 'planned_delivery_date',
        width: 120,
        sorter: (a, b) =>
          compareNumber(a?.planned_delivery_date, b?.planned_delivery_date),
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record?.planned_delivery_date),
      },
      {
        title: '行状态',
        exportTitle: '行状态',
        dataIndex: 'line_status',
        width: 100,
        sorter: (a, b) => compareText(a?.line_status, b?.line_status),
        render: lineStatusTag,
        exportValue: (record) =>
          statusText(record?.line_status, SALES_ORDER_ITEM_STATUS_LABELS),
      },
      {
        title: '创建时间',
        exportTitle: '创建时间',
        dataIndex: 'created_at',
        width: 160,
        sorter: (a, b) => compareNumber(a?.created_at, b?.created_at),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.created_at),
      },
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 160,
        sorter: (a, b) => compareNumber(a?.updated_at, b?.updated_at),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.updated_at),
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

  const readonlyItemColumns = useMemo(
    () =>
      visibleItemDataColumns.map((column) => ({
        ...column,
        title: getColumnLabel(column),
      })),
    [visibleItemDataColumns]
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
  return (
    <BusinessPageLayout className="erp-v1-sales-orders-page">
      <PageHeaderCard
        compact
        title="销售订单"
        description="维护客户订单承诺和订单行；出货、库存、应收、发票和收款在对应业务模块处理。"
        stats={[
          { key: 'total', label: '总订单', value: total },
          { key: 'current', label: '当前结果', value: orders.length },
          { key: 'active', label: '已生效', value: activeOrderCount },
          { key: 'selected', label: '已选订单', value: selectedOrder ? 1 : 0 },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
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
          </>
        }
        actions={
          <Space wrap>
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
            <ToolbarButton
              icon={<DeleteOutlined />}
              danger
              disabled={!selectedOrder}
              onClick={() => setBatchDeleteOpen(true)}
            >
              批量删除
            </ToolbarButton>
            <ToolbarButton
              icon={<InboxOutlined />}
              onClick={() => setRecycleOpen(true)}
            >
              回收站
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          canCreateOrder ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreateOrder}
            >
              新建订单
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedOrder ? 1 : 0}
          selectedLabel={selectedOrderDisplayText}
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
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!selectedOrder || items.length === 0}
            onClick={exportItems}
          >
            导出订单行
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
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!selectedOrder}
            onClick={() => setBatchDeleteOpen(true)}
          >
            删除
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderColumns}
        dataSource={orders}
        scroll={{ x: 1560 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        emptyDescription="暂无销售订单"
        rowSelection={{
          selectedRowKeys: selectedOrder?.id ? [selectedOrder.id] : [],
          onSelect: (record, selected) => {
            setSelectedOrder(selected ? record : null)
          },
          onSelectAll: (_selected, selectedRows) => {
            setSelectedOrder(selectedRows[0] || null)
          },
        }}
        rowClassName={(record) =>
          record.id === selectedOrder?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedOrder(record),
          onDoubleClick: () => {
            if (canUpdateOrder) {
              openEditOrder(record)
            }
          },
        })}
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
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        title={
          <div className="erp-business-action-modal__title">
            <span>{editingOrder?.id ? '编辑销售订单' : '新建销售订单'}</span>
            <small>只维护客户订单承诺，不在此写出货、库存或财务事实。</small>
          </div>
        }
        open={orderModalOpen}
        onOk={saveOrder}
        onCancel={() => setOrderModalOpen(false)}
        maskClosable={false}
        confirmLoading={saving}
        centered
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={orderForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <SalesOrderFormFields customers={customers} />
          <SalesOrderItemsFormSection
            form={orderForm}
            canCreateItem={canCreateItem}
            canUpdateItem={canUpdateItem}
            canCancelItem={canCancelItem}
          />
        </Form>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--confirm erp-business-batch-delete-modal"
        width={560}
        title="批量删除记录"
        open={batchDeleteOpen}
        onCancel={() => setBatchDeleteOpen(false)}
        onOk={() => {
          setBatchDeleteOpen(false)
          setBatchDeleteReason('')
          message.info('销售订单当前保留生命周期状态，不执行批量物理删除')
        }}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !selectedOrder }}
        centered
        destroyOnHidden
      >
        <Space
          direction="vertical"
          size={12}
          className="erp-business-batch-delete-modal__content"
        >
          <span>
            已选择 <strong>{selectedOrder ? 1 : 0}</strong>{' '}
            条记录，将进入回收站。
          </span>
          <Input.TextArea
            className="erp-business-batch-delete-modal__reason"
            value={batchDeleteReason}
            onChange={(event) => setBatchDeleteReason(event.target.value)}
            rows={3}
            maxLength={255}
            showCount
            placeholder="请输入删除原因（可选）"
          />
        </Space>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--recycle"
        title="回收站"
        open={recycleOpen}
        onCancel={() => {
          setRecycleOpen(false)
          setRecycleSelectedRowKeys([])
        }}
        footer={null}
        width={980}
        centered
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Button
              icon={<RollbackOutlined />}
              disabled={recycleSelectedRowKeys.length === 0}
            >
              批量恢复
            </Button>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <span>已选择 {recycleSelectedRowKeys.length} 条回收站记录</span>
          </Space>
          <Table
            rowKey="id"
            size="small"
            rowSelection={{
              selectedRowKeys: recycleSelectedRowKeys,
              onChange: (keys) => setRecycleSelectedRowKeys(keys),
            }}
            columns={[
              { title: '单据编号', dataIndex: 'code', width: 180 },
              { title: '标题', dataIndex: 'name', width: 260 },
              { title: '业务状态', dataIndex: 'status', width: 140 },
              { title: '删除时间', dataIndex: 'deleted_at', width: 160 },
              { title: '删除原因', dataIndex: 'delete_reason', width: 180 },
              {
                title: '操作',
                key: 'actions',
                width: 110,
                render: () => (
                  <Button type="link" size="small" disabled>
                    恢复
                  </Button>
                ),
              },
            ]}
            dataSource={[]}
            pagination={{
              pageSize: 8,
              showSizeChanger: false,
              showTotal: (totalCount) => `共 ${totalCount} 条`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="回收站暂无记录"
                />
              ),
            }}
            scroll={{ x: 900 }}
          />
        </Space>
      </Modal>

      <Drawer
        title="销售订单详情"
        width={920}
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
            <Descriptions.Item label="创建时间">
              {formatUnixDateTime(selectedOrder.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatUnixDateTime(selectedOrder.updated_at)}
            </Descriptions.Item>
            <Descriptions.Item label="备注">
              {selectedOrder.note || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
        <div className="erp-sales-order-detail-lines">
          <div className="erp-sales-order-detail-lines__head">
            <strong>订单行</strong>
            <Space wrap size={8}>
              <Tag>共 {items.length} 行</Tag>
              <Tag>未关闭 {openLineCount} 行</Tag>
              <Button
                size="small"
                icon={<SettingOutlined />}
                onClick={() => setColumnOrderTarget('items')}
              >
                列顺序
              </Button>
            </Space>
          </div>
          <Table
            rowKey="id"
            size="small"
            loading={selectedOrder ? itemLoading : false}
            columns={readonlyItemColumns}
            dataSource={selectedOrder ? items : []}
            pagination={false}
            scroll={{ x: 1740 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    selectedOrder ? '当前订单暂无订单行' : '尚未选择销售订单'
                  }
                />
              ),
            }}
          />
        </div>
        <p className="erp-business-selection-action-bar__hint">
          当前页面不展示已发货数量，不生成出货、库存预留、库存流水、发票、应收或收款。出货事实后续由
          ShipmentUsecase 接入。
        </p>
      </Drawer>
    </BusinessPageLayout>
  )
}
