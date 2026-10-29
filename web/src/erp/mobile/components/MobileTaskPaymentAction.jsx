import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { getSalesOrder, getPurchaseOrder, getOutsourcingOrder } from '../../api/masterDataOrderApi.mjs'
import { getShipment } from '../../api/operationalFactApi.mjs'
import { getPurchaseReceipt } from '../../api/purchaseApi.mjs'
import useFinancePaymentCreation from '../../components/finance/useFinancePaymentCreation.mjs'
import { FinancePaymentEditor } from '../../components/finance/FinancePaymentEditor.jsx'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

const SOURCES = Object.freeze({
  sales_order: { get: getSalesOrder, party: 'customer_id', direction: 'RECEIPT', kind: 'ADVANCE', status: 'active', number: 'order_no' },
  purchase_order: { get: getPurchaseOrder, party: 'supplier_id', direction: 'DISBURSEMENT', kind: 'ADVANCE', status: 'approved', number: 'purchase_order_no' },
  outsourcing_order: { get: getOutsourcingOrder, party: 'supplier_id', direction: 'DISBURSEMENT', kind: 'ADVANCE', status: 'confirmed', number: 'outsourcing_order_no' },
  shipment: { get: getShipment, party: 'customer_id', direction: 'RECEIPT', kind: 'SETTLEMENT', status: 'SHIPPED', number: 'shipment_no' },
  purchase_receipt: { get: getPurchaseReceipt, party: 'supplier_id', direction: 'DISBURSEMENT', kind: 'SETTLEMENT', status: 'POSTED', number: 'receipt_no' },
})
const noRefresh = async () => {}

export default function MobileTaskPaymentAction({ task, profile }) {
  const [sourceState, setSourceState] = useState({ context: null, error: '' })
  const [loading, setLoading] = useState(false)
  const [payment, setPayment] = useState(null)
  const [retry, setRetry] = useState(0)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const spec = SOURCES[task.source_type]
  const [kind, setKind] = useState(spec.kind)
  useEffect(() => {
    const controller = new AbortController()
    setSourceState({ context: null, error: '' })
    spec.get({ id: task.source_id }, { signal: controller.signal }).then((record) => {
      if (controller.signal.aborted) return
      if (record?.id !== task.source_id || !Number.isSafeInteger(record[spec.party]) || (spec.kind === 'ADVANCE' && !record.currency) ||
          (record.lifecycle_status || record.status) !== spec.status) {
        setSourceState({ context: null, error: '来源订单或单据尚未生效，不能登记本次收付' })
        return
      }
      setSourceState({ context: {
        record,
        values: { kind: spec.kind,
direction: spec.direction,
currency: record.currency || 'CNY',
          counterparty_id: record[spec.party],
...(spec.kind === 'ADVANCE' ? { source_type: task.source_type, source_id: record.id } : {}) },
      },
error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setSourceState({ context: null, error: getActionErrorMessage(error, '读取收付款来源') })
    })
    return () => controller.abort()
  }, [spec, task.source_type, task.source_id, retry])
  const { error } = sourceState
  const context = useMemo(() => sourceState.context ? {
    ...sourceState.context,
    values: {
      ...sourceState.context.values,
      kind,
      source_type: kind === 'ADVANCE' ? task.source_type : undefined,
      source_id: kind === 'ADVANCE' ? task.source_id : undefined,
    },
  } : null, [sourceState.context, kind, task.source_type, task.source_id])
  const partyID = context?.values.counterparty_id
  const customer = spec.party === 'customer_id'
  const rememberPayment = useCallback((record) => setPayment(record), [])
  const creation = useFinancePaymentCreation({
    customerKey: profile.effective_session?.customer?.key || '',
    currentPayment: null,
    customers: customer && partyID ? [{ id: partyID, name: context.record.customer_name || context.record.customer_snapshot?.name || '来源单据客户' }] : [],
    suppliers: !customer && partyID ? [{ id: partyID, name: context.record.supplier_name || context.record.supplier_snapshot?.name || '来源单据供应商' }] : [],
    setLoading,
attemptsRef,
rememberPayment,
loadReferences: noRefresh,
sourceContext: context,
  })
  return (
    <section className="erp-mobile-card mobile-detail-section" data-testid="mobile-task-payment-entry">
      <h2>登记本次实际收付</h2>
      {error ? (
        <Alert type="warning" showIcon message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} />
      ) : !context ? <Spin /> : (
        <>
          <p>关联单据：{context.record[spec.number]}</p>
          <p>登记后先审批，由财务确认实际收付；本次登记不会直接更新账款余额。</p>
          {spec.kind === 'ADVANCE' ? (
            <label className="mobile-task-payment-kind">
              本次收付款用途
              <Select
                allowClear={false /* 不可清空：收付用途决定登记单据合同，必须明确预收预付或结算。 */}
                placeholder="本次收付款用途"
                aria-label="本次收付款用途"
                value={kind}
                disabled={loading}
                onChange={setKind}
                options={[{ value: 'ADVANCE', label: '订单预收 / 预付' }, { value: 'SETTLEMENT', label: '应收 / 应付结算' }]}
              />
            </label>
          ) : null}
          {payment ? <p role="status">{payment.payment_no} 已登记，待审批及财务确认。</p> : null}
          <Button type="primary" disabled={loading} onClick={creation.openPayment}>填写收付款</Button>
        </>
      )}
      <FinancePaymentEditor
        {...creation}
        adminProfile={profile}
        customerKey={profile.effective_session?.customer?.key || ''}
        loading={loading}
        referenceLoading={!context}
        sourceContext={context}
      />
    </section>
  )
}
