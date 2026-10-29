import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import { FinanceAdjustmentDirection } from '@/common/consts/statuses.generated.mjs'
import { listFinanceSourceAdjustments, createFinanceSourceAdjustment } from '../../api/operationalFactApi.mjs'
import { BusinessDataTable, BusinessOperationPanel } from '../business-list/BusinessListLayout.jsx'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { compareNumeric20Scale6Units, numeric20Scale6Units, isPositiveNumeric20Scale6Units } from '../../utils/numeric20Scale6.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'

export default function FinanceSourceAdjustmentsPanel({ customerKey, canCreate, attemptsRef, onChanged }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [retryPending, setRetryPending] = useState(false)
  const [form] = Form.useForm()
  const beginLatestRequest = useLatestRequestCoordinator()
  const load = useCallback(async () => {
    const request = beginLatestRequest('finance-source-adjustments')
    setLoading(true); setError('')
    try {
      const result = await listFinanceSourceAdjustments({ limit: 20, offset: (page - 1) * 20 }, { signal: request.signal })
      if (!request.isCurrent()) return
      setRows(result.adjustments || []); setTotal(result.total || 0)
    } catch (err) { if (request.isCurrent()) { setRows([]); setTotal(0); setError(getActionErrorMessage(err, '读取采购待调整')) } }
    finally { if (request.isCurrent()) setLoading(false); request.finish() }
  }, [beginLatestRequest, page])
  useEffect(() => { load() }, [load])
  const needsUnallocation = (row) => row.balance_direction === FinanceAdjustmentDirection.DECREASE && compareNumeric20Scale6Units(numeric20Scale6Units(row.amount), numeric20Scale6Units(row.outstanding_amount)) === 1
  const open = (row) => {
    setSelected(row)
    const saved = attemptsRef.current.peek(`finance-source-adjustment:${row.source_type}:${row.source_id}`)
    setRetryPending(Boolean(saved))
    form.setFieldsValue(saved?.params || { credit_note_no: `ADJ-${row.source_no}`.slice(0, 64), reason: row.source_type === 'PURCHASE_RETURN' ? '采购退货冲减应付' : '采购入库数量调整' })
  }
  const save = async () => {
    let values
    try { values = await form.validateFields() } catch { return }
    const scope = `finance-source-adjustment:${selected.source_type}:${selected.source_id}`
    let attempt
    try {
      attempt = attemptsRef.current.prepare(scope, { customer_key: customerKey, source_type: selected.source_type, source_id: selected.source_id, credit_note_no: values.credit_note_no.trim(), reason: values.reason.trim() })
      setSaving(true)
      const result = await createFinanceSourceAdjustment(attempt.params)
      if (!result?.id) throw Object.assign(new Error('调整结果暂时无法确认'), { isInvalidResponse: true })
      attemptsRef.current.settle(scope, attempt, null)
      setSelected(null); message.success('采购差额已计入应付，原账款和付款记录已保留')
      await load(); await onChanged?.()
    } catch (err) {
      const retained = attempt && attemptsRef.current.settle(scope, attempt, err)
      setRetryPending(Boolean(retained))
      message[retained ? 'warning' : 'error'](retained ? '结果暂时无法确认，请保持内容不变后重试' : getActionErrorMessage(err, '确认采购差额'))
    } finally { setSaving(false) }
  }
  const columns = [
    { title: '来源单号', dataIndex: 'source_no', width: 210 },
    { title: '应付单号', dataIndex: 'finance_fact_no', width: 210 },
    { title: '供应商', dataIndex: 'counterparty_name', width: 170 },
    { title: '调整方向', dataIndex: 'balance_direction', width: 110, render: (value) => value === FinanceAdjustmentDirection.INCREASE ? '增加应付' : '减少应付' },
    { title: '差额', dataIndex: 'amount', width: 130, align: 'right' },
    { title: '币种', dataIndex: 'currency', width: 80 },
    { title: '处理', key: 'action', width: 215, render: (_, row) => needsUnallocation(row) ? '先在收付款记录撤销相应核销' : !isPositiveNumeric20Scale6Units(numeric20Scale6Units(row.amount)) ? '金额未变化，无需调整' : <Button disabled={!canCreate} onClick={() => open(row)}>确认差额</Button> },
  ]
  return (
    <>
      <BusinessOperationPanel actions={<Button onClick={load} loading={loading}>刷新待调整</Button>} />
      <p className="erp-business-inline-note">应付形成后的采购退货和数量变化在此确认。差额来自已过账来源；已付部分先撤销核销，再冲减应付并登记实际退款。原应付已包含的来源不重复调整。</p>
      {error ? <Alert type="error" message={error} showIcon /> : null}
      <BusinessDataTable columns={columns} dataSource={rows} rowKey={(row) => `${row.source_type}:${row.source_id}`} loading={loading} pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: setPage }} emptyDescription="暂无采购待调整差额" scroll={{ x: 1125 }} />
      <BusinessFormModal open={Boolean(selected)} title="确认采购应付差额" onCancel={() => !saving && setSelected(null)} onOk={save} confirmLoading={saving} okText="确认调整" cancelText="取消" maskClosable={!saving} keyboard={!saving}>
        <p>{selected?.source_no}：{selected?.balance_direction === FinanceAdjustmentDirection.INCREASE ? '增加' : '减少'}应付 {selected?.amount} {selected?.currency}</p>
        {retryPending ? <Alert type="warning" showIcon message="上次结果尚未确认，请重试原内容。确认结果后才能发起新的调整。" /> : null}
        <Form form={form} layout="vertical" disabled={saving || retryPending}>
          <Form.Item name="credit_note_no" label="调整单号" rules={[{ required: true, whitespace: true, message: '请填写调整单号' }]}><Input maxLength={64} /></Form.Item>
          <Form.Item name="reason" label="调整原因" rules={[{ required: true, whitespace: true, message: '请填写调整原因' }]}><Input.TextArea maxLength={255} rows={3} /></Form.Item>
        </Form>
      </BusinessFormModal>
    </>
  )
}
