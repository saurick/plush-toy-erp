import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessFilterPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  listMaterials,
  listPurchaseOrderItems,
  listPurchaseOrders,
  listSuppliers,
  savePurchaseOrderWithItems,
  submitPurchaseOrder,
} from '../api/masterDataOrderApi.mjs'
import {
  PURCHASE_ORDER_STATUS_COLORS,
  PURCHASE_ORDER_STATUS_LABELS,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSupplierSnapshot,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已审核', value: 'approved' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

const SORT_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '采购日期新到旧', value: 'purchase_date:desc' },
  { label: '采购日期旧到新', value: 'purchase_date:asc' },
  { label: '预计到货新到旧', value: 'expected_arrival_date:desc' },
  { label: '预计到货旧到新', value: 'expected_arrival_date:asc' },
]

const LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'purchase.order.update',
    run: submitPurchaseOrder,
  },
  {
    key: 'approve',
    label: '审核',
    permission: 'purchase.order.approve',
    run: approvePurchaseOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'purchase.order.update',
    run: closePurchaseOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'purchase.order.update',
    run: cancelPurchaseOrder,
  },
]

const BUSINESS_FORM_MODAL_WIDTH = 'min(1040px, calc(100vw - 96px))'

function parseSortValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={PURCHASE_ORDER_STATUS_COLORS[key] || 'default'}>
      {statusText(key, PURCHASE_ORDER_STATUS_LABELS)}
    </Tag>
  )
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function createBlankLine(lineNo = 1) {
  return {
    line_no: lineNo,
    material_id: undefined,
    unit_id: undefined,
    material_code_snapshot: '',
    material_name_snapshot: '',
    color_snapshot: '',
    purchased_quantity: '',
    unit_price: '',
    amount: '',
    expected_arrival_date: '',
    note: '',
  }
}

function normalizeLine(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    material_id: item.material_id,
    unit_id: item.unit_id,
    material_code_snapshot: item.material_code_snapshot || '',
    material_name_snapshot: item.material_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    purchased_quantity: item.purchased_quantity || '',
    unit_price: item.unit_price || '',
    amount: item.amount || '',
    expected_arrival_date: unixToDateInputValue(item.expected_arrival_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

function supplierLabel(supplier = {}) {
  return [supplier.code, supplier.name].filter(Boolean).join(' / ')
}

function materialLabel(material = {}) {
  return [material.code, material.name].filter(Boolean).join(' / ')
}

export default function V1PurchaseOrdersPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [form] = Form.useForm()
  const canCreate = hasActionPermission(adminProfile, 'purchase.order.create')
  const canUpdate = hasActionPermission(adminProfile, 'purchase.order.update')

  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [editingOrder, setEditingOrder] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )

  const materialOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        label: materialLabel(item),
        item,
      })),
    [materials]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, materialData] = await Promise.all([
        listSuppliers({ active_only: true, limit: 200 }),
        listMaterials({ active_only: true, limit: 200 }),
      ])
      setSuppliers(supplierData?.suppliers || [])
      setMaterials(materialData?.materials || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购基础资料失败'))
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { sortBy, sortDirection } = parseSortValue(sortValue)
      const data = await listPurchaseOrders({
        keyword,
        lifecycle_status: status,
        sort_by: sortBy,
        sort_direction: sortDirection,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      })
      setOrders(data?.purchase_orders || [])
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购订单失败'))
    } finally {
      setLoading(false)
    }
  }, [keyword, pagination.current, pagination.pageSize, sortValue, status])

  const loadOrderItems = useCallback(async (order) => {
    if (!order?.id) {
      return []
    }
    setItemsLoading(true)
    try {
      const data = await listPurchaseOrderItems({
        purchase_order_id: order.id,
        limit: 200,
      })
      const nextItems = data?.purchase_order_items || []
      return nextItems
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购订单明细失败'))
      return []
    } finally {
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const openCreateModal = () => {
    setEditingOrder(null)
    form.setFieldsValue({
      purchase_order_no: '',
      supplier_id: undefined,
      supplier_purchase_order_no: '',
      purchase_date: todayInputValue(),
      expected_arrival_date: '',
      note: '',
      items: [createBlankLine(1)],
    })
    setModalOpen(true)
  }

  const openEditModal = async (record) => {
    const lines = await loadOrderItems(record)
    setEditingOrder(record)
    form.setFieldsValue({
      purchase_order_no: record.purchase_order_no || '',
      supplier_id: record.supplier_id,
      supplier_purchase_order_no: record.supplier_purchase_order_no || '',
      purchase_date: unixToDateInputValue(record.purchase_date),
      expected_arrival_date: unixToDateInputValue(record.expected_arrival_date),
      note: record.note || '',
      items:
        lines
          .filter((line) => line.line_status !== 'canceled')
          .map(normalizeLine).length > 0
          ? lines
              .filter((line) => line.line_status !== 'canceled')
              .map(normalizeLine)
          : [createBlankLine(1)],
    })
    setModalOpen(true)
  }

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
  }

  const handleMaterialChange = (fieldName, materialID) => {
    const material = materials.find((item) => item.id === materialID)
    if (!material) return
    form.setFieldValue(
      ['items', fieldName, 'unit_id'],
      material.default_unit_id
    )
    form.setFieldValue(
      ['items', fieldName, 'material_code_snapshot'],
      material.code
    )
    form.setFieldValue(
      ['items', fieldName, 'material_name_snapshot'],
      material.name
    )
    form.setFieldValue(
      ['items', fieldName, 'color_snapshot'],
      material.color || ''
    )
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const supplier = suppliers.find((item) => item.id === values.supplier_id)
      const params = buildPurchaseOrderParams(values, {
        id: editingOrder?.id,
        supplier_snapshot: buildSupplierSnapshot(supplier),
        items: (values.items || []).map((line, index) =>
          buildPurchaseOrderItemParams(line, {
            id: line.id,
            line_no: Number(line.line_no || index + 1),
          })
        ),
      })
      setSaving(true)
      const result = await savePurchaseOrderWithItems(params)
      const saved = result?.purchase_order
      if (saved) {
        setSelectedOrder(saved)
        await loadOrderItems(saved)
      }
      setModalOpen(false)
      message.success('采购订单已保存')
      await loadOrders()
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '保存采购订单失败'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, record) => {
    try {
      const updated = await action.run({ id: record.id })
      message.success(`采购订单已${action.label}`)
      await loadOrders()
      if (updated && selectedOrder?.id === updated.id) {
        setSelectedOrder(updated)
        await loadOrderItems(updated)
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, `${action.label}采购订单失败`))
    }
  }

  const columns = [
    {
      title: '采购单号',
      dataIndex: 'purchase_order_no',
      width: 180,
      fixed: 'left',
    },
    {
      title: '供应商',
      dataIndex: 'supplier_id',
      width: 160,
      render: (value, record) =>
        record?.supplier_snapshot?.name ||
        suppliers.find((item) => item.id === value)?.name ||
        value ||
        '-',
    },
    {
      title: '状态',
      dataIndex: 'lifecycle_status',
      width: 110,
      render: statusTag,
    },
    {
      title: '采购日期',
      dataIndex: 'purchase_date',
      width: 130,
      render: formatUnixDate,
    },
    {
      title: '预计到货',
      dataIndex: 'expected_arrival_date',
      width: 130,
      render: formatUnixDate,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 160,
      render: formatUnixDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6} wrap>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={
              !canUpdate ||
              ['closed', 'canceled'].includes(record.lifecycle_status)
            }
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          {LIFECYCLE_ACTIONS.map((action) => (
            <Button
              key={action.key}
              size="small"
              disabled={!hasActionPermission(adminProfile, action.permission)}
              onClick={() => runLifecycleAction(action, record)}
            >
              {action.label}
            </Button>
          ))}
        </Space>
      ),
    },
  ]

  const stats = [
    { key: 'total', label: '采购订单', value: total },
    {
      key: 'approved',
      label: '已审核',
      value: orders.filter((item) => item.lifecycle_status === 'approved')
        .length,
    },
    {
      key: 'open',
      label: '未关闭',
      value: orders.filter((item) =>
        ['draft', 'submitted', 'approved'].includes(item.lifecycle_status)
      ).length,
    },
  ]

  return (
    <BusinessPageLayout className="erp-v1-purchase-orders-page">
      <PageHeaderCard
        title="采购订单"
        description="维护供应商采购承诺；采购订单不写库存，不替代采购入库、退货、质检或应付事实。"
        stats={stats}
        tags={<Tag color="blue">Source Document</Tag>}
        compact
      />

      <BusinessFilterPanel
        actions={
          <Space wrap>
            <ToolbarButton icon={<ReloadOutlined />} onClick={loadOrders}>
              刷新
            </ToolbarButton>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canCreate}
              onClick={openCreateModal}
            >
              新建采购订单
            </Button>
          </Space>
        }
      >
        <SearchInput
          value={keyword}
          placeholder="搜索采购单号 / 供应商单号"
          onChange={(event) => {
            setPagination((current) => ({ ...current, current: 1 }))
            setKeyword(event.target.value)
          }}
          onSearch={loadOrders}
        />
        <SelectFilter
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setPagination((current) => ({ ...current, current: 1 }))
            setStatus(value)
          }}
        />
        <SelectFilter
          value={sortValue}
          options={SORT_OPTIONS}
          onChange={setSortValue}
        />
      </BusinessFilterPanel>

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={orders}
        scroll={{ x: 1200 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedOrder ? [selectedOrder.id] : [],
          onChange: (_keys, rows) => setSelectedOrder(rows[0] || null),
        }}
        onRow={(record) => ({
          onClick: () => setSelectedOrder(record),
          onDoubleClick: () => openEditModal(record),
        })}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
        emptyDescription="暂无采购订单"
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        open={modalOpen}
        title={
          <div className="erp-business-action-modal__title">
            <span>{editingOrder ? '编辑采购订单' : '新建采购订单'}</span>
            <small>只维护采购承诺，不在此写库存、质检或应付事实。</small>
          </div>
        }
        okText="保存"
        confirmLoading={saving || itemsLoading}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          className="erp-business-action-form"
        >
          <Form.Item name="supplier_snapshot" hidden>
            <Input />
          </Form.Item>
          <div className="erp-business-form-grid erp-business-form-grid--three">
            <Form.Item
              name="purchase_order_no"
              label="采购单号"
              rules={[{ required: true, message: '请输入采购单号' }]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item
              name="supplier_id"
              label="供应商"
              rules={[{ required: true, message: '请选择供应商' }]}
            >
              <Select
                showSearch
                options={supplierOptions}
                optionFilterProp="label"
                onChange={handleSupplierChange}
              />
            </Form.Item>
            <Form.Item name="supplier_purchase_order_no" label="供应商单号">
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item
              name="purchase_date"
              label="采购日期"
              rules={[{ required: true, message: '请选择采购日期' }]}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expected_arrival_date" label="预计到货">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input maxLength={255} />
            </Form.Item>
          </div>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space>
                  <strong>采购明细</strong>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => add(createBlankLine(fields.length + 1))}
                  >
                    添加行
                  </Button>
                </Space>
                {fields.map((field) => (
                  <div className="erp-business-form-grid" key={field.key}>
                    <Form.Item name={[field.name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'line_no']}
                      label="行号"
                      rules={[{ required: true, message: '请输入行号' }]}
                    >
                      <InputNumber
                        min={1}
                        precision={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'material_id']}
                      label="材料"
                      rules={[{ required: true, message: '请选择材料' }]}
                    >
                      <Select
                        showSearch
                        options={materialOptions}
                        optionFilterProp="label"
                        onChange={(value) =>
                          handleMaterialChange(field.name, value)
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'unit_id']}
                      label="单位ID"
                      rules={[{ required: true, message: '请输入单位ID' }]}
                    >
                      <InputNumber
                        min={1}
                        precision={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'material_code_snapshot']}
                      label="材料编码快照"
                    >
                      <Input maxLength={64} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'material_name_snapshot']}
                      label="材料名称快照"
                    >
                      <Input maxLength={255} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'color_snapshot']}
                      label="颜色快照"
                    >
                      <Input maxLength={64} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'purchased_quantity']}
                      label="采购数量"
                      rules={[{ required: true, message: '请输入采购数量' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'unit_price']} label="单价">
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'amount']} label="金额">
                      <Input placeholder="留空时按数量和单价派生" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'expected_arrival_date']}
                      label="预计到货"
                    >
                      <Input type="date" />
                    </Form.Item>
                    <Form.Item name={[field.name, 'note']} label="备注">
                      <Input maxLength={255} />
                    </Form.Item>
                    <Form.Item label="操作">
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        disabled={fields.length <= 1}
                        onClick={() => remove(field.name)}
                      >
                        删除行
                      </Button>
                    </Form.Item>
                  </div>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
