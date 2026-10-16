import React, { useEffect, useState } from 'react'
import { Form, Select } from 'antd'
import { FinancePaymentKind } from '@/common/consts/statuses.generated.mjs'
import {
  listAllSalesOrders,
  listAllPurchaseOrders,
  listAllOutsourcingOrders,
} from '../../api/masterDataOrderApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { PermissionCode } from '@/common/consts/permissions.generated.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

const sources = {
  sales_order: {
    label: '销售订单',
    list: listAllSalesOrders,
    key: 'sales_orders',
    number: 'order_no',
    status: 'active',
    party: 'customer_id',
    permission: PermissionCode.SALES_ORDER_READ,
  },
  purchase_order: {
    label: '采购订单',
    list: listAllPurchaseOrders,
    key: 'purchase_orders',
    number: 'purchase_order_no',
    status: 'approved',
    party: 'supplier_id',
    permission: PermissionCode.PURCHASE_ORDER_READ,
  },
  outsourcing_order: {
    label: '委外合同',
    list: listAllOutsourcingOrders,
    key: 'outsourcing_orders',
    number: 'outsourcing_order_no',
    status: 'confirmed',
    party: 'supplier_id',
    permission: PermissionCode.OUTSOURCING_ORDER_READ,
  },
}

export default function FinancePaymentSourceFields({ form, profile, open }) {
  const kind = Form.useWatch('kind', form)
  const direction = Form.useWatch('direction', form)
  const party = Form.useWatch('counterparty_id', form)
  const sourceType = Form.useWatch('source_type', form)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const source = sources[sourceType]
    setOrders([])
    setError('')
    setLoading(false)
    if (!open || kind !== FinancePaymentKind.ADVANCE || !source || !party) {
      return () => controller.abort()
    }
    if (!hasActionPermission(profile, source.permission)) {
      setError('当前账号不能读取该类订单，请由有权经办人办理')
      return () => controller.abort()
    }
    setLoading(true)
    source
      .list(
        { lifecycle_status: source.status, [source.party]: Number(party) },
        { signal: controller.signal }
      )
      .then((result) => {
        if (!controller.signal.aborted) {
          setOrders(
            (result?.[source.key] || []).filter(
              (row) =>
                Number(row[source.party]) === Number(party) &&
                row.lifecycle_status === source.status
            )
          )
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && !isRpcAbortError(err)) {
          setError(getActionErrorMessage(err, '读取可收付订单'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, kind, sourceType, party, profile])
  if (kind !== FinancePaymentKind.ADVANCE) return null
  return (
    <>
      <Form.Item
        name="source_type"
        label="关联单据"
        rules={[{ required: true, message: '请选择单据类型' }]}
      >
        <Select
          options={Object.entries(sources)
            .filter(([key]) =>
              direction === 'RECEIPT'
                ? key === 'sales_order'
                : key !== 'sales_order'
            )
            .map(([value, source]) => ({ value, label: source.label }))}
          onChange={() =>
            form.setFieldsValue({ source_id: undefined, currency: undefined })
          }
        />
      </Form.Item>
      <Form.Item
        name="source_id"
        label="订单 / 合同"
        rules={[{ required: true, message: '请选择已生效的订单或合同' }]}
        validateStatus={error ? 'error' : undefined}
        help={error || '首款、分期款及发货前尾款均关联原订单；币种随订单带入。'}
      >
        <Select
          showSearch
          optionFilterProp="label"
          loading={loading}
          disabled={!party || !sourceType}
          options={orders.map((row) => ({
            value: row.id,
            label: `${row[sources[sourceType]?.number]} · ${row.currency}`,
          }))}
          onChange={(id) =>
            form.setFieldsValue({
              currency: orders.find((row) => row.id === id)?.currency,
            })
          }
        />
      </Form.Item>
    </>
  )
}
