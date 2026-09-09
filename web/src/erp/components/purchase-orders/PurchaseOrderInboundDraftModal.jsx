import React, { useMemo } from 'react'
import { Alert, Form, Input, Select, Space, Table, Tag, Typography } from 'antd'
import { materialStockCategoryLabel } from '../../utils/warehouseClassification.mjs'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import { formatQuantity } from '../../utils/businessLineItems.mjs'

const { Text } = Typography

function purchaseOrderLabel(order) {
  if (order?.purchase_order_no) return order.purchase_order_no
  if (order?.id) return '采购订单已关联'
  return '-'
}

export default function PurchaseOrderInboundDraftModal({
  open,
  form,
  order,
  rows,
  loading,
  submitting,
  referenceDataReady = false,
  hasRemaining,
  resolveSupplierName,
  onOk,
  onCancel,
}) {
  const columns = useMemo(
    () => [
      {
        title: '来源行',
        dataIndex: 'lineNo',
        width: 88,
        render: (value) => value || '-',
      },
      {
        title: '材料',
        dataIndex: 'material',
        width: 180,
      },
      {
        title: '库存类别',
        key: 'stockCategory',
        width: 100,
        render: (_, row) => materialStockCategoryLabel(row.stockCategory),
      },
      {
        title: '入库仓库',
        key: 'warehouse',
        width: 230,
        render: (_, row) =>
          row.canGenerate ? (
            <Form.Item
              name={['item_warehouses', String(row.key)]}
              rules={[{ required: true, message: '请选择本行入库仓' }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                aria-label={`第${row.lineNo}行入库仓库`}
                showSearch
                optionFilterProp="label"
                allowClear
                options={row.warehouseOptions || []}
                placeholder={
                  row.stockCategory && row.stockCategory !== 'UNCLASSIFIED'
                    ? '确认入库仓'
                    : '请先补齐材料库存类别'
                }
              />
            </Form.Item>
          ) : (
            '-'
          ),
      },
      {
        title: '采购数量',
        dataIndex: 'purchasedQuantity',
        width: 120,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '已过账入库',
        dataIndex: 'effectiveReceivedQuantity',
        width: 130,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '草稿占用',
        dataIndex: 'draftReservedQuantity',
        width: 120,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '剩余可收',
        dataIndex: 'remainingReceivableQuantity',
        width: 120,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '剩余可生成',
        dataIndex: 'remainingGeneratableQuantity',
        width: 130,
        render: (value, row) => {
          const text = `${formatQuantity(value)} ${row.unit}`
          return row.canGenerate ? (
            <Text strong>{text}</Text>
          ) : (
            <Text type="secondary">{text}</Text>
          )
        },
      },
      {
        title: '本次生成',
        key: 'nextInbound',
        width: 120,
        render: (_, row) =>
          row.canGenerate ? (
            <Tag color="blue">
              {`${formatQuantity(row.remainingGeneratableQuantity)} ${row.unit}`}
            </Tag>
          ) : (
            <Tag>不生成</Tag>
          ),
      },
      {
        title: '不可生成原因',
        dataIndex: 'disabledReason',
        width: 140,
        render: (value) =>
          value ? <Text type="secondary">{value}</Text> : '可生成',
      },
    ],
    []
  )

  return (
    <BusinessFormModal
      title="生成采购入库草稿"
      open={open}
      centered
      width={1080}
      okText="生成草稿"
      cancelText="取消"
      confirmLoading={submitting}
      okButtonProps={{
        disabled: loading || !referenceDataReady || !hasRemaining,
      }}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          showIcon
          type={loading || hasRemaining ? 'info' : 'warning'}
          message={
            loading
              ? '正在加载采购订单来源明细'
              : hasRemaining
                ? '按扣除已收货及草稿占用后的数量生成入库草稿'
                : '当前采购订单没有可生成的剩余明细'
          }
          description={
            <Space direction="vertical" size={2}>
              <Text>
                {`来源采购订单：${purchaseOrderLabel(
                  order
                )}；供应商：${resolveSupplierName(order)}`}
              </Text>
              <Text type="secondary">
                本次仅生成待验收的入库草稿，完成质检和入库确认后才增加库存。
              </Text>
            </Space>
          }
        />
      </Space>
      <Form
        form={form}
        layout="vertical"
        disabled={!referenceDataReady}
        className="erp-business-action-form"
        style={{ marginTop: 16 }}
      >
        <Form.Item className="erp-business-action-form__field--full">
          <Table
            aria-label="采购订单生成入库来源明细"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            scroll={{ x: 1460 }}
            size="small"
          />
        </Form.Item>
        <Form.Item
          name="receipt_no"
          label="入库单号"
          rules={[{ required: true, message: '请输入入库单号' }]}
        >
          <Input maxLength={64} />
        </Form.Item>

        <Form.Item
          name="received_at"
          label="入库日期"
          rules={[{ required: true, message: '请选择入库日期' }]}
        >
          <DateInput />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field--full"
          name="note"
          label="备注"
        >
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
