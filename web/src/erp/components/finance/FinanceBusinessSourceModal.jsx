import React from 'react'
import { Alert, Descriptions, Form, Input, Modal } from 'antd'

import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  financeBusinessSourceActionConfig,
  localFinanceDateTimeInputValue,
  suggestedFinanceBusinessNo,
} from '../../utils/financeBusinessSourceAction.mjs'
import { outsourcingFactProductSKUText } from '../../utils/outsourcingFactDisplay.mjs'

const FINANCE_FACT_TYPE_LABELS = Object.freeze({
  RECEIVABLE: '应收',
  PAYABLE: '应付',
  INVOICE: '发票',
})

function sourceNo(action, source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  return action === FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE
    ? record.receipt_no || '采购入库单待核对'
    : record.fact_no || '业务记录待核对'
}

function sourcePartner(action, source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  if (action === FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE) {
    return record.supplier_name || '供应商由入库单确定'
  }
  if (action === FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE) {
    return record.supplier_name || '加工厂由委外订单确定'
  }
  const type = String(record.counterparty_type || '').toUpperCase()
  if (type === 'CUSTOMER') return '客户已关联'
  if (type === 'SUPPLIER') return '供应商已关联'
  return '往来方已关联'
}

function sourceSummaryItems(action, source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  const items = [
    {
      key: 'source',
      label:
        action === FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE
          ? '采购入库'
          : action ===
              FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE
            ? '委外回货'
            : '待核对记录',
      children: sourceNo(action, record),
    },
    {
      key: 'partner',
      label:
        action === FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION
          ? '往来方'
          : '供应商',
      children: sourcePartner(action, record),
    },
  ]
  if (action === FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION) {
    const factType = String(record.fact_type || '').toUpperCase()
    items.push(
      {
        key: 'type',
        label: '记录类型',
        children: FINANCE_FACT_TYPE_LABELS[factType] || '财务记录',
      },
      {
        key: 'amount',
        label: '账面金额',
        children: `${record.amount || '0'} ${record.currency || 'CNY'}`,
      }
    )
  } else if (
    action === FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE
  ) {
    items.push(
      {
        key: 'product_sku',
        label: '产品规格',
        children: outsourcingFactProductSKUText(record),
      },
      {
        key: 'quantity',
        label: '回货数量',
        children: record.quantity || '-',
      }
    )
  }
  return items
}

export default function FinanceBusinessSourceModal({
  action,
  open,
  source,
  initialValues,
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const effectiveAction =
    action || FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE
  const config = financeBusinessSourceActionConfig(effectiveAction)
  const formInitialValues = {
    fact_no: suggestedFinanceBusinessNo(effectiveAction, source),
    occurred_at: localFinanceDateTimeInputValue(),
    note: '',
    ...(initialValues || {}),
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      await onSubmit?.(values)
    } catch (error) {
      if (!error?.errorFields) throw error
    }
  }

  const isReconciliation =
    effectiveAction ===
    FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION

  return (
    <Modal
      title={config.title}
      open={open}
      width={620}
      okText={config.okText}
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      destroyOnHidden
      keyboard={!loading}
      maskClosable={!loading}
      afterOpenChange={(visible) => {
        if (!visible) form.resetFields()
      }}
      onCancel={() => {
        if (!loading) onCancel?.()
      }}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message={
          isReconciliation
            ? '本次只核对一条已确认记录；往来方、金额和币种由系统沿用，不是多单据核销。'
            : '来源、供应商、金额和币种由系统核算；提交后只生成待确认草稿。'
        }
      />
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={sourceSummaryItems(effectiveAction, source)}
      />
      <Form
        key={`${effectiveAction}:${source?.id || 'closed'}`}
        name="finance_business_source"
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={formInitialValues}
        disabled={loading}
      >
        <Form.Item
          name="fact_no"
          label="业务编号"
          rules={[
            { required: true, whitespace: true, message: '请填写业务编号' },
            { max: 64, message: '业务编号不能超过 64 个字符' },
          ]}
        >
          <Input autoComplete="off" maxLength={64} showCount />
        </Form.Item>
        <Form.Item name="occurred_at" label="发生时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
