import React, { useEffect, useRef, useState } from 'react'
import { Form, InputNumber, Spin } from 'antd'
import Table from '@/common/components/table/AppTable.jsx'
import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import {
  completePurchaseOrderTerms,
  getPurchaseOrder,
  listAllPurchaseOrderItems,
} from '../../api/masterDataOrderApi.mjs'
import { unixToDateInputValue } from '../../utils/masterDataOrderView.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'

const dateParam = (value) =>
  value ? Date.parse(`${value}T00:00:00Z`) / 1000 : null

export default function PurchaseOrderTermsModal({
  order,
  customerKey,
  unitOptions = [],
  onClose,
  onChanged,
}) {
  const [form] = Form.useForm()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const attempts = useRef(createSourceBusinessActionAttemptStore())
  const orderID = Number(order?.id || 0)

  useEffect(() => {
    if (!orderID) return undefined
    const controller = new AbortController()
    setContext(null)
    setLoading(true)
    const load = async () => {
      const options = { signal: controller.signal }
      const current = await getPurchaseOrder({ id: orderID }, options)
      if (
        !current?.id ||
        !['approved', 'closed'].includes(current.lifecycle_status)
      ) {
        throw new Error('当前采购单状态已变化，请刷新后重试')
      }
      const result = await listAllPurchaseOrderItems(
        {
          purchase_order_id: orderID,
          expected_version: current.version,
        },
        options
      )
      return { current, items: result.purchase_order_items }
    }
    load()
      .then(({ current, items }) => {
        if (controller.signal.aborted) return
        const lines = items.filter((item) => item.line_status !== 'canceled')
        if (!lines.length) throw new Error('当前采购单没有可补齐的明细')
        setContext({ order: current, items: lines })
        form.setFieldsValue({
          expected_arrival_date: unixToDateInputValue(
            current.expected_arrival_date
          ),
          supplier_confirmed_arrival_date: unixToDateInputValue(
            current.supplier_confirmed_arrival_date
          ),
          items: lines.map((item) => ({
            unit_price: item.unit_price ?? '',
            expected_arrival_date: unixToDateInputValue(
              item.expected_arrival_date
            ),
          })),
        })
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRpcAbortError(error)) {
          message.error(getActionErrorMessage(error, '读取采购补价资料'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [form, orderID])

  const submit = async () => {
    const values = await form.validateFields()
    if (!context || saving) return
    const payload = {
      customer_key: customerKey || undefined,
      id: context.order.id,
      expected_version: context.order.version,
      expected_arrival_date: dateParam(values.expected_arrival_date),
      supplier_confirmed_arrival_date: dateParam(
        values.supplier_confirmed_arrival_date
      ),
      items: context.items.map((item, index) => ({
        id: item.id,
        unit_price: String(values.items[index].unit_price),
        expected_arrival_date: dateParam(
          values.items[index].expected_arrival_date
        ),
      })),
    }
    const scope = `purchase-terms:${orderID}`
    let attempt
    setSaving(true)
    try {
      attempt = attempts.current.prepare(scope, payload)
      const updated = await completePurchaseOrderTerms(attempt.params)
      if (
        updated?.id !== context.order.id ||
        Number(updated.version) <= Number(context.order.version)
      ) {
        throw Object.assign(new Error('采购补价结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attempts.current.settle(scope, attempt, null)
      message.success('采购价格与交期已保存')
      onClose?.()
      try {
        await onChanged?.()
      } catch {
        message.warning('保存已完成，请刷新采购订单查看最新资料')
      }
    } catch (error) {
      const retained = attempt && attempts.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '补齐采购价格与交期')
      )
    } finally {
      setSaving(false)
    }
  }

  const closed = context?.order.lifecycle_status === 'closed'
  return (
    <BusinessModal
      open={Boolean(orderID)}
      title={`补齐价格与交期${order?.purchase_order_no ? ` · ${order.purchase_order_no}` : ''}`}
      size="localAction"
      form={form}
      okText="保存"
      onOk={submit}
      onCancel={onClose}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || !context }}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" disabled={saving}>
          <p>
            采购数量沿用批准结果。已确认价格保持锁定，晚补价用于缺价收货的结算。
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            <Form.Item name="expected_arrival_date" label="预计到货日期">
              <DateInput disabled={closed} />
            </Form.Item>
            <Form.Item
              name="supplier_confirmed_arrival_date"
              label="供应商确认到货日期"
            >
              <DateInput disabled={closed} />
            </Form.Item>
          </div>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={context?.items || []}
            columns={[
              {
                title: '物料',
                key: 'material',
                render: (_, item) =>
                  [item.material_code_snapshot, item.material_name_snapshot]
                    .filter(Boolean)
                    .join(' ') || '采购物料',
              },
              {
                title: '采购数量',
                key: 'quantity',
                width: 130,
                render: (_, item) =>
                  `${item.purchased_quantity} ${referenceLabel(unitOptions, item.unit_id, '单位')}`,
              },
              {
                title: context?.order.currency
                  ? `单价（${context.order.currency}）`
                  : '单价',
                key: 'price',
                width: 170,
                render: (_, item, index) => (
                  <Form.Item
                    name={['items', index, 'unit_price']}
                    rules={[{ required: true, message: '请填写单价' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      aria-label={`第${index + 1}行单价`}
                      min="0"
                      stringMode
                      disabled={item.unit_price != null}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                ),
              },
              {
                title: '明细预计到货',
                key: 'arrival',
                width: 170,
                render: (_, item, index) => (
                  <Form.Item
                    name={['items', index, 'expected_arrival_date']}
                    style={{ marginBottom: 0 }}
                  >
                    <DateInput
                      aria-label={`第${index + 1}行预计到货日期`}
                      disabled={closed}
                    />
                  </Form.Item>
                ),
              },
            ]}
            scroll={{ x: 680 }}
          />
        </Form>
      </Spin>
    </BusinessModal>
  )
}
