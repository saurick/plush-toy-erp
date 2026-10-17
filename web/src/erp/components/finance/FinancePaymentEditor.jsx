import React from 'react'
import { Form, Input, Select } from 'antd'

import { FinancePaymentKind } from '../../../common/consts/statuses.generated.mjs'
import FinancePaymentSourceFields from './FinancePaymentSourceFields.jsx'

import ProcessSubmissionRoute from '../workflow/ProcessSubmissionRoute.jsx'

import BusinessFormSectionTitle from '../business-list/BusinessFormSectionTitle.jsx'

import { DateTimeInput } from '../business-list/BusinessListLayout.jsx'

import BusinessFormPage from '../business-list/BusinessFormPage.jsx'

import { BUSINESS_CURRENCY_OPTIONS } from '../../utils/masterDataOrderView.mjs'

import {
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

export function FinancePaymentEditor({
  adminProfile,
  customerKey,
  loading,
  referenceLoading,
  paymentOpen,
  setPaymentOpen,
  refundSource,
  paymentForm,
  paymentKind,
  partyIsCustomer,
  partyOptions,
  createPayment,
  sourceContext = null,
}) {
  return (
    <BusinessFormPage
      form={paymentForm}
      title="登记收付款"
      open={paymentOpen}
      loading={referenceLoading}
      okText="创建收付款记录"
      confirmLoading={loading}
      onCancel={() => !loading && setPaymentOpen(false)}
      onOk={createPayment}
    >
      <Form
        form={paymentForm}
        name="finance-payment-create"
        className="erp-business-action-form"
        layout="vertical"
        preserve={false}
        disabled={loading}
      >
        <Form.Item>
          <ProcessSubmissionRoute
            processKey="finance_payment_approval"
            customerKey={customerKey}
            open={paymentOpen}
          />
        </Form.Item>
        <BusinessFormSectionTitle>往来与金额</BusinessFormSectionTitle>
        {refundSource ? (
          <p className="erp-business-inline-note">
            退回原款 {refundSource.payment_no}；当前可退{' '}
            {refundSource.available_amount} {refundSource.currency}
            。实际退款须保留独立凭据。
          </p>
        ) : null}
        <Form.Item name="kind" label="款项用途" rules={[{ required: true }]}>
          <Select
            disabled={Boolean(refundSource || sourceContext)}
            options={
              refundSource
                ? [{ value: FinancePaymentKind.REFUND, label: '实际退款' }]
                : [
                    {
                      value: FinancePaymentKind.SETTLEMENT,
                      label: '应收应付结算',
                    },
                    {
                      value: FinancePaymentKind.ADVANCE,
                      label: '订单预收 / 预付（首款、分期款、发货前尾款）',
                    },
                  ]
            }
            onChange={() =>
              paymentForm.setFieldsValue({
                source_type: undefined,
                source_id: undefined,
                currency: undefined,
                purpose_note: undefined,
              })
            }
          />
        </Form.Item>
        <Form.Item
          name="direction"
          label="收付款方向"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: 'RECEIPT', label: '收款' },
              { value: 'DISBURSEMENT', label: '付款' },
            ]}
            disabled={Boolean(refundSource || sourceContext)}
            onChange={() =>
              paymentForm.setFieldsValue({
                counterparty_id: undefined,
                source_type: undefined,
                source_id: undefined,
                currency: undefined,
              })
            }
          />
        </Form.Item>
        <Form.Item
          name="counterparty_id"
          label={partyIsCustomer ? '客户' : '供应商'}
          rules={[{ required: true, message: '请选择往来方' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={referenceLoading}
            disabled={Boolean(refundSource || sourceContext)}
            onChange={() =>
              paymentForm.setFieldsValue({
                source_id: undefined,
                currency: undefined,
              })
            }
            options={partyOptions}
          />
        </Form.Item>
        <FinancePaymentSourceFields
          form={paymentForm}
          profile={adminProfile}
          open={paymentOpen}
          sourceContext={sourceContext}
        />
        <Form.Item
          name="purpose_note"
          label={refundSource ? '退款原因' : '款项说明'}
          rules={
            refundSource
              ? [
                  {
                    required: true,
                    whitespace: true,
                    message: '请填写退款原因',
                  },
                ]
              : []
          }
        >
          <Input
            maxLength={255}
            placeholder={
              refundSource
                ? '说明取消、退货或多收多付的原因'
                : '例如：订单首款、第二期款或发货前尾款'
            }
          />
        </Form.Item>
        <Form.Item
          name="payment_no"
          label="收付款单号"
          rules={[{ required: true, whitespace: true, message: '请填写单号' }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          name="amount"
          label="实收 / 实付金额"
          rules={[
            { required: true, message: '请填写金额' },
            {
              validator: (_, value) =>
                !isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                  ? Promise.reject(new Error('金额必须大于 0，最多六位小数'))
                  : refundSource &&
                      compareNumeric20Scale6Units(
                        numeric20Scale6Units(value),
                        numeric20Scale6Units(refundSource.available_amount)
                      ) === 1
                    ? Promise.reject(new Error('退款金额不能超过原款可用余额'))
                    : Promise.resolve(),
            },
          ]}
        >
          <Input inputMode="decimal" />
        </Form.Item>
        <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
          <Select
            disabled={paymentKind !== FinancePaymentKind.SETTLEMENT}
            options={BUSINESS_CURRENCY_OPTIONS}
          />
        </Form.Item>
        <Form.Item name="occurred_at" label="发生时间">
          <DateTimeInput />
        </Form.Item>
        <BusinessFormSectionTitle>账户与凭据</BusinessFormSectionTitle>
        <Form.Item
          name="account_ref"
          label="收付款账户摘要"
          rules={[
            { required: true, whitespace: true, message: '请填写账户摘要' },
          ]}
        >
          <Input maxLength={128} />
        </Form.Item>
        <Form.Item
          name="evidence_ref"
          label="业务凭据"
          rules={[
            {
              required: true,
              whitespace: true,
              message: '请填写回单或凭据摘要',
            },
          ]}
        >
          <Input maxLength={255} />
        </Form.Item>
      </Form>
    </BusinessFormPage>
  )
}
