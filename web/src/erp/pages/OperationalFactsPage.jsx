import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addShipmentItem,
  cancelFinanceFact,
  cancelOutsourcingFact,
  cancelProductionFact,
  cancelShipment,
  consumeStockReservation,
  createFinanceFact,
  createOutsourcingFact,
  createProductionFact,
  createShipment,
  createStockReservation,
  listFinanceFacts,
  listOutsourcingFacts,
  listProductionFacts,
  listShipments,
  listStockReservations,
  postFinanceFact,
  postOutsourcingFact,
  postProductionFact,
  releaseStockReservation,
  settleFinanceFact,
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
  { label: '已过账', value: 'POSTED' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已结清', value: 'SETTLED' },
  { label: '生效中', value: 'ACTIVE' },
  { label: '已释放', value: 'RELEASED' },
  { label: '已消耗', value: 'CONSUMED' },
  { label: '已取消', value: 'CANCELLED' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  SHIPPED: '已发货',
  SETTLED: '已结清',
  ACTIVE: '生效中',
  RELEASED: '已释放',
  CONSUMED: '已消耗',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'green',
  SHIPPED: 'blue',
  SETTLED: 'purple',
  ACTIVE: 'cyan',
  RELEASED: 'gold',
  CONSUMED: 'geekblue',
  CANCELLED: 'red',
})

const FACT_SUBJECT_OPTIONS = [
  { label: '材料 MATERIAL', value: 'MATERIAL' },
  { label: '产品 PRODUCT', value: 'PRODUCT' },
]

const PRODUCTION_FACT_TYPES = [
  { label: '发料 MATERIAL_ISSUE', value: 'MATERIAL_ISSUE' },
  { label: '成品入库 FINISHED_GOODS_RECEIPT', value: 'FINISHED_GOODS_RECEIPT' },
  { label: '返工 REWORK', value: 'REWORK' },
]

const OUTSOURCING_FACT_TYPES = [
  { label: '委外发料 MATERIAL_ISSUE', value: 'MATERIAL_ISSUE' },
  { label: '委外回料 RETURN_RECEIPT', value: 'RETURN_RECEIPT' },
]

const FINANCE_FACT_TYPES = [
  { label: '应收 RECEIVABLE', value: 'RECEIVABLE' },
  { label: '应付 PAYABLE', value: 'PAYABLE' },
  { label: '发票 INVOICE', value: 'INVOICE' },
  { label: '收付款 PAYMENT', value: 'PAYMENT' },
  { label: '对账 RECONCILIATION', value: 'RECONCILIATION' },
]

const COUNTERPARTY_TYPES = [
  { label: '客户 CUSTOMER', value: 'CUSTOMER' },
  { label: '供应商 SUPPLIER', value: 'SUPPLIER' },
  { label: '其他 OTHER', value: 'OTHER' },
]

const ACTION_PERMISSIONS = Object.freeze({
  productionWrite: ['pmc.plan.update', 'warehouse.adjustment.create'],
  outsourcingWrite: ['purchase.order.update', 'warehouse.adjustment.create'],
  shipmentWrite: ['shipment.create'],
  shipmentConfirm: ['shipment.ship', 'shipment.cancel'],
  reservationWrite: ['sales_order.update', 'warehouse.outbound.confirm'],
  financeWrite: ['finance.receivable.confirm', 'finance.payable.confirm'],
})

function hasAnyPermission(adminProfile, permissions = []) {
  if (adminProfile?.is_super_admin === true) {
    return true
  }
  return permissions.some((permission) =>
    hasActionPermission(adminProfile, permission)
  )
}

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
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

function dateValue(value) {
  return trimOptional(value)
}

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}`
}

function buildFactParams(values = {}) {
  return compactParams({
    fact_no: trimOptional(values.fact_no),
    fact_type: trimOptional(values.fact_type),
    subject_type: trimOptional(values.subject_type),
    subject_id: requiredInt(values.subject_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    supplier_id: positiveInt(values.supplier_id),
    supplier_name: trimOptional(values.supplier_name),
    source_type: trimOptional(values.source_type),
    source_id: positiveInt(values.source_id),
    source_line_id: positiveInt(values.source_line_id),
    idempotency_key: trimOptional(values.idempotency_key),
    occurred_at: dateValue(values.occurred_at),
    note: trimOptional(values.note),
  })
}

function buildShipmentParams(values = {}) {
  return compactParams({
    shipment_no: trimOptional(values.shipment_no),
    sales_order_id: positiveInt(values.sales_order_id),
    customer_id: positiveInt(values.customer_id),
    customer_snapshot: trimOptional(values.customer_snapshot),
    idempotency_key: trimOptional(values.idempotency_key),
    planned_ship_at: dateValue(values.planned_ship_at),
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

function buildReservationParams(values = {}) {
  return compactParams({
    reservation_no: trimOptional(values.reservation_no),
    sales_order_id: positiveInt(values.sales_order_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    idempotency_key: trimOptional(values.idempotency_key),
    reserved_at: dateValue(values.reserved_at),
    note: trimOptional(values.note),
  })
}

function buildFinanceParams(values = {}) {
  return compactParams({
    fact_no: trimOptional(values.fact_no),
    fact_type: trimOptional(values.fact_type),
    counterparty_type: trimOptional(values.counterparty_type),
    counterparty_id: positiveInt(values.counterparty_id),
    amount: trimOptional(values.amount),
    currency: trimOptional(values.currency),
    source_type: trimOptional(values.source_type),
    source_id: positiveInt(values.source_id),
    source_line_id: positiveInt(values.source_line_id),
    idempotency_key: trimOptional(values.idempotency_key),
    occurred_at: dateValue(values.occurred_at),
    note: trimOptional(values.note),
  })
}

function FactFormFields({ typeOptions, includeSupplier = false }) {
  return (
    <>
      <Form.Item label="事实单号" name="fact_no" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="事实类型" name="fact_type" rules={[{ required: true }]}>
        <Select options={typeOptions} />
      </Form.Item>
      <Form.Item
        label="对象类型"
        name="subject_type"
        rules={[{ required: true }]}
      >
        <Select options={FACT_SUBJECT_OPTIONS} />
      </Form.Item>
      <Form.Item label="对象 ID" name="subject_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="仓库 ID"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="批次 ID" name="lot_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="单位 ID" name="unit_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="数量" name="quantity" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      {includeSupplier ? (
        <>
          <Form.Item label="供应商 ID" name="supplier_id">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="供应商快照" name="supplier_name">
            <Input allowClear autoComplete="off" />
          </Form.Item>
        </>
      ) : null}
      <Form.Item label="来源类型" name="source_type">
        <Input allowClear autoComplete="off" placeholder="如 SALES_ORDER" />
      </Form.Item>
      <Form.Item label="来源 ID" name="source_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="来源行 ID" name="source_line_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="发生日期" name="occurred_at">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

function ShipmentFormFields() {
  return (
    <>
      <Form.Item
        label="出货单号"
        name="shipment_no"
        rules={[{ required: true }]}
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
        rules={[{ required: true }]}
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
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="销售订单行 ID" name="sales_order_item_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="产品 ID" name="product_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="仓库 ID"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="批次 ID" name="lot_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="单位 ID" name="unit_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="数量" name="quantity" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

function ReservationFormFields() {
  return (
    <>
      <Form.Item
        label="预留单号"
        name="reservation_no"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="销售订单 ID" name="sales_order_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="销售订单行 ID" name="sales_order_item_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="产品 ID" name="product_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="仓库 ID"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="批次 ID" name="lot_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="单位 ID" name="unit_id" rules={[{ required: true }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="数量" name="quantity" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="预留日期" name="reserved_at">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

function FinanceFormFields() {
  return (
    <>
      <Form.Item label="事实单号" name="fact_no" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="事实类型" name="fact_type" rules={[{ required: true }]}>
        <Select options={FINANCE_FACT_TYPES} />
      </Form.Item>
      <Form.Item
        label="往来方类型"
        name="counterparty_type"
        rules={[{ required: true }]}
      >
        <Select options={COUNTERPARTY_TYPES} />
      </Form.Item>
      <Form.Item label="往来方 ID" name="counterparty_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="金额" name="amount" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item label="币种" name="currency" rules={[{ required: true }]}>
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="来源类型" name="source_type">
        <Input allowClear autoComplete="off" placeholder="如 SHIPMENT" />
      </Form.Item>
      <Form.Item label="来源 ID" name="source_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="来源行 ID" name="source_line_id">
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="发生日期" name="occurred_at">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export default function OperationalFactsPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [activeKey, setActiveKey] = useState('production')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowsByKey, setRowsByKey] = useState({})
  const [totalByKey, setTotalByKey] = useState({})
  const [createTarget, setCreateTarget] = useState(null)
  const [createForm] = Form.useForm()
  const [shipmentItemOpen, setShipmentItemOpen] = useState(false)
  const [shipmentItemForm] = Form.useForm()

  const configs = useMemo(
    () => ({
      production: {
        title: '生产事实',
        listKey: 'production_facts',
        createLabel: '新建生产事实',
        createPrefix: 'prod',
        list: listProductionFacts,
        create: createProductionFact,
        post: postProductionFact,
        cancel: cancelProductionFact,
        writePermissions: ACTION_PERMISSIONS.productionWrite,
        buildParams: buildFactParams,
        renderForm: () => (
          <FactFormFields typeOptions={PRODUCTION_FACT_TYPES} />
        ),
        initialValues: {
          fact_type: 'MATERIAL_ISSUE',
          subject_type: 'MATERIAL',
        },
      },
      outsourcing: {
        title: '委外事实',
        listKey: 'outsourcing_facts',
        createLabel: '新建委外事实',
        createPrefix: 'outsource',
        list: listOutsourcingFacts,
        create: createOutsourcingFact,
        post: postOutsourcingFact,
        cancel: cancelOutsourcingFact,
        writePermissions: ACTION_PERMISSIONS.outsourcingWrite,
        buildParams: buildFactParams,
        renderForm: () => (
          <FactFormFields
            typeOptions={OUTSOURCING_FACT_TYPES}
            includeSupplier
          />
        ),
        initialValues: {
          fact_type: 'MATERIAL_ISSUE',
          subject_type: 'MATERIAL',
        },
      },
      shipments: {
        title: '出货事实',
        listKey: 'shipments',
        createLabel: '新建出货单',
        createPrefix: 'shipment',
        list: listShipments,
        create: createShipment,
        post: shipShipment,
        cancel: cancelShipment,
        writePermissions: ACTION_PERMISSIONS.shipmentWrite,
        confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
        buildParams: buildShipmentParams,
        renderForm: () => <ShipmentFormFields />,
        initialValues: {},
      },
      reservations: {
        title: '库存预留',
        listKey: 'stock_reservations',
        createLabel: '新建库存预留',
        createPrefix: 'reserve',
        list: listStockReservations,
        create: createStockReservation,
        release: releaseStockReservation,
        consume: consumeStockReservation,
        writePermissions: ACTION_PERMISSIONS.reservationWrite,
        confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
        buildParams: buildReservationParams,
        renderForm: () => <ReservationFormFields />,
        initialValues: {},
      },
      finance: {
        title: '财务事实',
        listKey: 'finance_facts',
        createLabel: '新建财务事实',
        createPrefix: 'finance',
        list: listFinanceFacts,
        create: createFinanceFact,
        post: postFinanceFact,
        settle: settleFinanceFact,
        cancel: cancelFinanceFact,
        writePermissions: ACTION_PERMISSIONS.financeWrite,
        buildParams: buildFinanceParams,
        renderForm: () => <FinanceFormFields />,
        initialValues: {
          fact_type: 'RECEIVABLE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
        },
      },
    }),
    []
  )

  const activeConfig = configs[activeKey] || configs.production
  const activeRows = rowsByKey[activeKey] || []
  const activeTotal = totalByKey[activeKey] || 0
  const canWriteActive = hasAnyPermission(
    adminProfile,
    activeConfig.writePermissions
  )

  const loadRows = useCallback(
    async (key = activeKey) => {
      const config = configs[key]
      if (!config) {
        return
      }
      setLoading(true)
      try {
        const data = await config.list(
          compactParams({ status: statusFilter, limit: 100, offset: 0 })
        )
        setRowsByKey((prev) => ({
          ...prev,
          [key]: Array.isArray(data?.[config.listKey])
            ? data[config.listKey]
            : [],
        }))
        setTotalByKey((prev) => ({ ...prev, [key]: Number(data?.total || 0) }))
      } catch (error) {
        message.error(getActionErrorMessage(error, `加载${config.title}`))
      } finally {
        setLoading(false)
      }
    },
    [activeKey, configs, statusFilter]
  )

  useEffect(() => {
    loadRows(activeKey)
  }, [activeKey, loadRows])

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10)
    const nextTarget = activeKey
    const config = configs[nextTarget]
    setCreateTarget(nextTarget)
    createForm.setFieldsValue({
      ...config.initialValues,
      idempotency_key: idempotencyKey(config.createPrefix),
      occurred_at: today,
      reserved_at: today,
    })
  }

  const closeCreate = () => {
    setCreateTarget(null)
    createForm.resetFields()
  }

  const submitCreate = async () => {
    const config = configs[createTarget]
    if (!config) {
      return
    }
    try {
      const values = await createForm.validateFields()
      setSaving(true)
      await config.create(config.buildParams(values))
      message.success(`${config.createLabel}已保存`)
      closeCreate()
      await loadRows(createTarget)
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, config.createLabel))
    } finally {
      setSaving(false)
    }
  }

  const runRowAction = async (config, row, actionKey, actionLabel) => {
    const action = config[actionKey]
    if (!action || !row?.id) {
      return
    }
    try {
      setSaving(true)
      await action({ id: row.id })
      message.success(`${actionLabel}已完成`)
      await loadRows(activeKey)
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
    } finally {
      setSaving(false)
    }
  }

  const openShipmentItem = (shipment) => {
    shipmentItemForm.setFieldsValue({ shipment_id: shipment?.id })
    setShipmentItemOpen(true)
  }

  const closeShipmentItem = () => {
    setShipmentItemOpen(false)
    shipmentItemForm.resetFields()
  }

  const submitShipmentItem = async () => {
    try {
      const values = await shipmentItemForm.validateFields()
      setSaving(true)
      await addShipmentItem(buildShipmentItemParams(values))
      message.success('出货行已保存')
      closeShipmentItem()
      await loadRows('shipments')
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '保存出货行'))
    } finally {
      setSaving(false)
    }
  }

  const baseColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 72,
      fixed: 'left',
    },
    {
      title: '单号',
      dataIndex:
        activeKey === 'shipments'
          ? 'shipment_no'
          : activeKey === 'reservations'
            ? 'reservation_no'
            : 'fact_no',
      width: 180,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: statusTag,
    },
  ]

  const quantityColumns = [
    {
      title: '对象',
      width: 150,
      render: (_, record) =>
        `${record.subject_type || 'PRODUCT'} #${
          record.subject_id || record.product_id || '-'
        }`,
    },
    {
      title: '仓库/批次/单位',
      width: 180,
      render: (_, record) =>
        `W${record.warehouse_id || '-'} / L${record.lot_id || '-'} / U${
          record.unit_id || '-'
        }`,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 120,
    },
  ]

  const sourceColumns = [
    {
      title: '来源',
      width: 180,
      render: (_, record) =>
        record.source_type
          ? `${record.source_type} #${record.source_id || '-'}`
          : '-',
    },
    {
      title: '日期',
      width: 120,
      render: (_, record) =>
        formatUnixDate(
          record.occurred_at || record.planned_ship_at || record.reserved_at
        ),
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

  const columnsByKey = {
    production: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 170 },
      ...quantityColumns,
      ...sourceColumns,
    ],
    outsourcing: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 160 },
      {
        title: '供应商',
        width: 150,
        render: (_, record) =>
          record.supplier_name ||
          (record.supplier_id ? `#${record.supplier_id}` : '-'),
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    shipments: [
      ...baseColumns,
      { title: '销售订单', dataIndex: 'sales_order_id', width: 120 },
      { title: '客户', dataIndex: 'customer_id', width: 100 },
      {
        title: '行数',
        width: 90,
        render: (_, record) => record.items?.length || 0,
      },
      ...sourceColumns,
    ],
    reservations: [
      ...baseColumns,
      { title: '销售订单', dataIndex: 'sales_order_id', width: 120 },
      ...quantityColumns,
      ...sourceColumns,
    ],
    finance: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 150 },
      {
        title: '往来方',
        width: 150,
        render: (_, record) =>
          `${record.counterparty_type || '-'} #${record.counterparty_id || '-'}`,
      },
      { title: '金额', dataIndex: 'amount', width: 120 },
      { title: '币种', dataIndex: 'currency', width: 90 },
      ...sourceColumns,
    ],
  }

  const actionColumn = {
    title: '操作',
    width: 260,
    fixed: 'right',
    render: (_, record) => {
      const config = configs[activeKey]
      const canConfirm = hasAnyPermission(
        adminProfile,
        config.confirmPermissions || config.writePermissions
      )
      return (
        <Space wrap>
          {activeKey === 'shipments' && record.status === 'DRAFT' ? (
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={!canWriteActive || saving}
              onClick={() => openShipmentItem(record)}
            >
              加行
            </Button>
          ) : null}
          {['production', 'outsourcing', 'finance'].includes(activeKey) &&
          record.status === 'DRAFT' ? (
            <Popconfirm
              title="确认过账？"
              onConfirm={() => runRowAction(config, record, 'post', '过账')}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={!canConfirm || saving}
              >
                过账
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'shipments' && record.status === 'DRAFT' ? (
            <Popconfirm
              title="确认发货并写出库流水？"
              onConfirm={() => runRowAction(config, record, 'post', '发货')}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={!canConfirm || saving}
              >
                发货
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'reservations' && record.status === 'ACTIVE' ? (
            <>
              <Popconfirm
                title="确认释放库存预留？"
                onConfirm={() =>
                  runRowAction(config, record, 'release', '释放预留')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  icon={<RollbackOutlined />}
                  disabled={!canWriteActive || saving}
                >
                  释放
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认消耗库存预留？"
                onConfirm={() =>
                  runRowAction(config, record, 'consume', '消耗预留')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!canConfirm || saving}
                >
                  消耗
                </Button>
              </Popconfirm>
            </>
          ) : null}
          {activeKey === 'finance' && record.status === 'POSTED' ? (
            <Popconfirm
              title="确认结清财务事实？"
              onConfirm={() => runRowAction(config, record, 'settle', '结清')}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                disabled={!canConfirm || saving}
              >
                结清
              </Button>
            </Popconfirm>
          ) : null}
          {['production', 'outsourcing', 'finance'].includes(activeKey) &&
          record.status === 'POSTED' ? (
            <Popconfirm
              title="确认取消并按后端规则处理冲正？"
              onConfirm={() => runRowAction(config, record, 'cancel', '取消')}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={!canConfirm || saving}
              >
                取消
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'shipments' && record.status === 'SHIPPED' ? (
            <Popconfirm
              title="确认取消并写出库冲正？"
              onConfirm={() =>
                runRowAction(config, record, 'cancel', '取消发货')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={!canConfirm || saving}
              >
                取消
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      )
    },
  }

  const createConfig = createTarget ? configs[createTarget] : null
  const tableColumns = [...(columnsByKey[activeKey] || []), actionColumn]

  return (
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" size={8}>
          <Title level={2} className="erp-dashboard-title">
            业务事实处理
          </Title>
          <Paragraph className="erp-dashboard-summary">
            统一承接生产、委外、出货、库存预留和财务事实的最小运行入口。页面只提交动作，库存流水、冲正和状态边界由后端
            usecase 处理。
          </Paragraph>
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
                style={{ width: 160 }}
                onChange={setStatusFilter}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadRows(activeKey)}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canWriteActive}
              onClick={openCreate}
            >
              {activeConfig.createLabel}
            </Button>
          </Space>

          <Tabs
            activeKey={activeKey}
            onChange={setActiveKey}
            items={Object.entries(configs).map(([key, config]) => ({
              key,
              label: config.title,
            }))}
          />

          <Text type="secondary">当前结果 {activeTotal} 条</Text>
          <Table
            rowKey="id"
            columns={tableColumns}
            dataSource={activeRows}
            loading={loading}
            locale={{
              emptyText: <Empty description="暂无业务事实记录" />,
            }}
            pagination={false}
            scroll={{ x: 1480 }}
          />
        </Space>
      </Card>

      <Modal
        title={createConfig?.createLabel || '新建事实'}
        open={Boolean(createConfig)}
        onCancel={closeCreate}
        onOk={submitCreate}
        confirmLoading={saving}
        forceRender
        width={720}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          {createConfig?.renderForm?.()}
        </Form>
      </Modal>

      <Modal
        title="新增出货行"
        open={shipmentItemOpen}
        onCancel={closeShipmentItem}
        onOk={submitShipmentItem}
        confirmLoading={saving}
        forceRender
        width={640}
      >
        <Form form={shipmentItemForm} layout="vertical" preserve={false}>
          <ShipmentItemFormFields />
        </Form>
      </Modal>
    </Space>
  )
}
