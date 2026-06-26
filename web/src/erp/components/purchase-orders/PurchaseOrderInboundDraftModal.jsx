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

export default function PurchaseOrderInboundDraftModal({
  open,
  form,
  order,
  rows,
  loading,
  submitting,
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
        width: 110,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '已入库',
        dataIndex: 'receivedQuantity',
        width: 110,
        render: (value, row) => `${formatQuantity(value)} ${row.unit}`,
      },
      {
        title: '剩余数量',
        dataIndex: 'remainingQuantity',
        width: 110,
        render: (value, row) => {
          const text = `${formatQuantity(value)} ${row.unit}`
          return value > 0 ? (
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
          row.remainingQuantity > 0 ? (
            <Tag color="blue">
              {`${formatQuantity(row.remainingQuantity)} ${row.unit}`}
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
      width={920}
      okText="生成草稿"
      cancelText="取消"
      confirmLoading={submitting}
      okButtonProps={{
        disabled: loading || !hasRemaining,
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
                ? '将按采购订单剩余数量生成入库草稿'
                : '当前采购订单没有可生成的剩余明细'
          }
          description={
            <Space direction="vertical" size={2}>
              <Text>
                {`来源采购订单：${
                  order?.purchase_order_no || order?.id || '-'
                }；供应商：${resolveSupplierName(order)}`}
              </Text>
              <Text type="secondary">
                下方只是生成前预览；后端会在保存时按采购订单状态、来源行和剩余数量重新校验，不由前端直接写库存事实。
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
          scroll={{ x: 760 }}
          size="small"
        />
      </Space>
      <Form
        form={form}
        layout="vertical"
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
        <Form.Item name="note" label="备注">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
