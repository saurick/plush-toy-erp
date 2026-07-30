import React, { useMemo } from 'react'
import {
  Alert,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'

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
  warehouseOptions,
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
    <Modal
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
                ? '将按服务端权威的剩余可生成数量生成入库草稿'
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
                下方进度由采购订单、已过账入库及现有入库草稿统一计算；保存时系统仍会再次校验，库存仅在入库过账后更新。
              </Text>
            </Space>
          }
        />
        <Table
          aria-label="采购订单生成入库来源明细"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 1160 }}
          size="small"
        />
      </Space>
      <Form
        form={form}
        layout="vertical"
        disabled={!referenceDataReady}
        className="erp-business-form"
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="receipt_no"
          label="入库单号"
          rules={[{ required: true, message: '请输入入库单号' }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          name="warehouse_id"
          label="入库仓库"
          rules={[{ required: true, message: '请选择入库仓库' }]}
        >
          <Select
            allowClear
            optionFilterProp="label"
            options={warehouseOptions}
            placeholder="请选择入库仓库"
            showSearch
          />
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
    </Modal>
  )
}
