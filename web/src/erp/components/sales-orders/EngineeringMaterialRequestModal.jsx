import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Space, Spin, Table, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import {
  getEngineeringMaterialRequest,
  submitEngineeringMaterialRequest,
  reviewEngineeringMaterialRequest,
} from '../../api/masterDataOrderApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { bomLossRateToPercent } from '../../utils/bomMaterialGroups.mjs'
import { numeric20Scale6Units } from '../../utils/numeric20Scale6.mjs'

const STATUS = {
  PREVIEW: '待提交',
  SUBMITTED: '待老板审核',
  BOSS_APPROVED: '待财务核价',
  APPROVED: '已批准采购',
  REJECTED: '已退回',
}
const validNumber = (_, value) =>
  numeric20Scale6Units(String(value ?? '')) !== null
    ? Promise.resolve()
    : Promise.reject(new Error('请输入非负数，最多六位小数'))

const partColumns = [
  { title: '订单行', dataIndex: 'line_no' },
  { title: '产品', dataIndex: 'product_name' },
  { title: 'BOM', dataIndex: 'bom_version' },
  { title: '部位', dataIndex: 'position' },
  { title: '片数', dataIndex: 'piece_count' },
  { title: '单位用量', dataIndex: 'unit_usage' },
  { title: '损耗 %', dataIndex: 'loss_rate', render: bomLossRateToPercent },
  { title: '生产数量', dataIndex: 'production_quantity' },
  { title: '应需数量', dataIndex: 'total_usage' },
]

function materialPartsTable(item, request) {
  return (
    <Table
      size="small"
      rowKey={(part) => `${part.sales_order_item_id}:${part.bom_item_id}`}
      dataSource={request.sources.filter(
        (part) =>
          part.material_id === item.material_id && part.unit_id === item.unit_id
      )}
      columns={partColumns}
      pagination={false}
      scroll={{ x: 850 }}
    />
  )
}

export default function EngineeringMaterialRequestModal({
  orderID,
  permissions,
  onCancel,
  onChanged,
}) {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState({ key: 0, preview: false })
  const install = useCallback(
    (value) => {
      setRequest(value)
      form.setFieldsValue({
        note: '',
        items: value.items.map((item) => ({
          id: item.id,
          purchase_quantity: item.purchase_quantity ?? item.required_quantity,
          unit_price: item.unit_price ?? '',
          expected_arrival_date: item.expected_arrival_date?.slice(0, 10) ?? '',
          note: item.note ?? '',
        })),
      })
    },
    [form]
  )
  useEffect(() => {
    if (!orderID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setRequest(null)
    getEngineeringMaterialRequest(
      { sales_order_id: orderID, preview: reload.preview },
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) install(value)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(cause, '读取工程用料汇总'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [orderID, reload, install])

  const canFinance = request?.status === 'BOSS_APPROVED' && permissions.finance
  const canBoss = request?.status === 'SUBMITTED' && permissions.boss
  const canSubmit = request?.status === 'PREVIEW' && permissions.submit
  const act = async (action) => {
    if (saving || loading || !request) return
    let values = form.getFieldsValue(true)
    if (action === 'FINANCE_APPROVE') {
      try {
        values = await form.validateFields()
      } catch {
        return
      }
    }
    if (action === 'REJECT' && !String(values.note || '').trim()) {
      message.warning('请填写退回原因')
      return
    }
    setSaving(true)
    setError('')
    try {
      const value =
        action === 'SUBMIT'
          ? await submitEngineeringMaterialRequest({
              sales_order_id: orderID,
              expected_version: request.source_order_version,
              expected_source_hash: request.source_hash,
            })
          : await reviewEngineeringMaterialRequest(
              {
                id: request.id,
                expected_version: request.version,
                action,
                note: values.note || null,
                ...(action === 'FINANCE_APPROVE'
                  ? {
                      items: values.items.map((item, index) => ({
                        ...item,
                        id: request.items[index].id,
                        purchase_quantity: String(item.purchase_quantity)
                          .replace(/,/gu, '')
                          .trim(),
                        unit_price: String(item.unit_price)
                          .replace(/,/gu, '')
                          .trim(),
                      })),
                    }
                  : {}),
              },
              canBoss ? 'boss' : 'finance'
            )
      install(value)
      onChanged()
      message.success(
        action === 'FINANCE_APPROVE'
          ? value.purchase_orders.length
            ? `已批准，已生成 ${value.purchase_orders.length} 张采购订单`
            : '已批准，本次无需采购'
          : '用料审批已更新'
      )
    } catch (cause) {
      setError(getActionErrorMessage(cause, '办理工程用料审批'))
    } finally {
      setSaving(false)
    }
  }

  const field = (index, key, label, options = {}) => {
    const Control = key === 'note' ? BusinessTextArea : Input
    return (
      <Form.Item name={['items', index, key]} rules={options.rules} noStyle>
        <Control
          aria-label={`${label} ${index + 1}`}
          disabled={!canFinance || saving}
          {...options.input}
        />
      </Form.Item>
    )
  }
  const columns = [
    { title: '物料名称', dataIndex: 'material_name', width: 145 },
    {
      title: '厂商 / 料号 / 色号',
      key: 'identity',
      width: 185,
      render: (_, item) =>
        [item.supplier_name, item.supplier_item_no, item.color]
          .filter(Boolean)
          .join(' / ') || '待补厂商',
    },
    { title: '规格', dataIndex: 'spec', width: 90 },
    { title: '单位', dataIndex: 'unit_name', width: 60 },
    { title: '应需数量', dataIndex: 'required_quantity', width: 95 },
    ...(canFinance || request?.status === 'APPROVED'
      ? [
          {
            title: '实购数量',
            width: 110,
            render: (_, item, index) =>
              canFinance
                ? field(index, 'purchase_quantity', '实购数量', {
                    rules: [{ validator: validNumber }],
                    input: { inputMode: 'decimal' },
                  })
                : item.purchase_quantity,
          },
          {
            title: '单价（元）',
            width: 105,
            render: (_, item, index) =>
              canFinance
                ? field(index, 'unit_price', '单价', {
                    rules: [{ validator: validNumber }],
                    input: { inputMode: 'decimal' },
                  })
                : (item.unit_price ?? '—'),
          },
          {
            title: '到货日期',
            width: 150,
            render: (_, item, index) =>
              canFinance
                ? field(index, 'expected_arrival_date', '到货日期', {
                    rules: [{ required: true, message: '请填写到货日期' }],
                    input: { type: 'date' },
                  })
                : item.expected_arrival_date?.slice(0, 10),
          },
          {
            title: '调整原因 / 备注',
            width: 180,
            render: (_, item, index) =>
              canFinance
                ? field(index, 'note', '调整原因', {
                    input: {
                      maxLength: 255,
                      placeholder: '实购不同于应需时必填',
                    },
                  })
                : item.note,
          },
        ]
      : []),
  ]
  return (
    <BusinessFormModal
      title={`材料汇总与审批${request?.order_no ? ` · ${request.order_no}` : ''}`}
      description="工程提交用料，老板审核，财务核价后按厂商生成采购订单。展开材料可核对产品与部位用量。"
      width={1320}
      open={Boolean(orderID)}
      onCancel={() => {
        if (!saving) onCancel()
      }}
      footer={
        <Space wrap>
          <Button disabled={saving} onClick={onCancel}>
            关闭
          </Button>
          <Button
            disabled={saving || loading}
            onClick={() => setReload({ key: reload.key + 1, preview: false })}
          >
            重新读取
          </Button>
          {request?.status === 'REJECTED' && permissions.submit ? (
            <Button
              disabled={saving}
              onClick={() => setReload({ key: reload.key + 1, preview: true })}
            >
              按当前资料重新整理
            </Button>
          ) : null}
          {canSubmit ? (
            <Button
              type="primary"
              loading={saving}
              disabled={request.issues.length > 0}
              onClick={() => act('SUBMIT')}
            >
              提交老板审核
            </Button>
          ) : null}
          {canBoss || canFinance ? (
            <Button danger disabled={saving} onClick={() => act('REJECT')}>
              退回工程
            </Button>
          ) : null}
          {canBoss ? (
            <Button
              type="primary"
              loading={saving}
              onClick={() => act('BOSS_APPROVE')}
            >
              审核通过，交财务
            </Button>
          ) : null}
          {canFinance ? (
            <Button
              type="primary"
              loading={saving}
              onClick={() => act('FINANCE_APPROVE')}
            >
              批准并生成采购订单
            </Button>
          ) : null}
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          className="erp-engineering-material-review"
        >
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {request ? (
            <>
              <Space wrap>
                <Tag>{STATUS[request.status] || request.status}</Tag>
                <span>{request.items.length} 种材料</span>
                <span>应需数量包含船头样和部位损耗</span>
              </Space>
              {request.issues.length ? (
                <Alert
                  type="warning"
                  message="提交前请补齐"
                  description={
                    <ul>
                      {[...new Set(request.issues)].map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  }
                />
              ) : null}
              {canFinance ? (
                <Alert
                  type="info"
                  message="核对实购数量、人民币单价和到货日期。调整数量请说明库存抵扣或增购原因；此处不会自动扣减或预占库存。采购付款及开票约定沿用厂商档案。"
                />
              ) : null}
              <Table
                size="small"
                rowKey={(item) => `${item.material_id}:${item.unit_id}`}
                columns={columns}
                dataSource={request.items}
                pagination={false}
                scroll={{
                  x: canFinance || request.status === 'APPROVED' ? 1280 : 780,
                }}
                expandable={{
                  expandedRowRender: (item) =>
                    materialPartsTable(item, request),
                }}
              />
              {request.review_note ? (
                <p>审批备注：{request.review_note}</p>
              ) : null}
              {request.boss_reviewed_at ? (
                <p>
                  老板审核：{request.boss_reviewed_at.slice(0, 10)}{' '}
                  {request.boss_review_note || ''} · 操作人 #
                  {request.boss_reviewed_by}
                </p>
              ) : null}
              {request.finance_reviewed_at ? (
                <p>
                  财务批准：{request.finance_reviewed_at.slice(0, 10)}{' '}
                  {request.finance_review_note || ''} · 操作人 #
                  {request.finance_reviewed_by}
                </p>
              ) : null}
              {canBoss || canFinance ? (
                <Form.Item label="审批备注 / 退回原因" name="note">
                  <BusinessTextArea
                    maxLength={255}
                    minRows={2}
                    disabled={saving}
                  />
                </Form.Item>
              ) : null}
              {request.purchase_orders.length ? (
                <Space wrap>
                  {request.purchase_orders.map((po) => (
                    <Button
                      key={po.id}
                      disabled={saving || !permissions.purchaseRead}
                      onClick={() => {
                        onCancel()
                        navigate(
                          `/erp/purchase/accessories?purchase_order_id=${po.id}`
                        )
                      }}
                    >
                      {po.purchase_order_no}
                    </Button>
                  ))}
                </Space>
              ) : null}
            </>
          ) : null}
        </Form>
      </Spin>
    </BusinessFormModal>
  )
}
