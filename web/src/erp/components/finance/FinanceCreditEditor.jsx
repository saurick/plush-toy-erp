import React from 'react'
import { Form, Input } from 'antd'
import Select from '@/common/components/select/AppSelect'

import { OperationalFactStatus } from '../../../common/consts/statuses.generated.mjs'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'

import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

export function FinanceCreditEditor({
  financeFacts,
  loading,
  referenceLoading,
  creditOpen,
  setCreditOpen,
  creditForm,
  submitCredit,
}) {
  const isCreatingCredit = creditOpen !== 'reverse'

  const CreditEditor = isCreatingCredit ? BusinessFormPage : BusinessFormModal

  return (
    <CreditEditor
      {...(isCreatingCredit
        ? { form: creditForm }
        : {
            size: 'localAction',
            cancelText: '取消',
            description: '冲销会恢复该红冲对未核销金额的影响。',
          })}
      title={creditOpen === 'reverse' ? '冲销红冲记录' : '登记红冲'}
      open={Boolean(creditOpen)}
      okText={creditOpen === 'reverse' ? '确认冲销' : '确认红冲'}
      confirmLoading={loading}
      onCancel={() => !loading && setCreditOpen(false)}
      onOk={() => submitCredit(creditOpen === 'reverse')}
    >
      <Form
        form={creditForm}
        name="finance-credit-note"
        className="erp-business-action-form"
        layout="vertical"
        preserve={false}
        disabled={loading}
      >
        {creditOpen !== 'reverse' ? (
          <Form.Item
            name="finance_fact_id"
            label="来源应收 / 应付"
            rules={[{ required: true, message: '请选择来源财务记录' }]}
          >
            <Select
              placeholder="请选择来源应收 / 应付"
              showSearch
              optionFilterProp="label"
              loading={referenceLoading}
              options={financeFacts
                .filter(
                  (fact) =>
                    fact.status === OperationalFactStatus.POSTED &&
                    isPositiveNumeric20Scale6Units(
                      numeric20Scale6Units(fact.outstanding_amount)
                    )
                )
                .map((fact) => ({
                  value: fact.id,
                  label: `${fact.fact_no || '财务记录'} / 未核销 ${
                    fact.outstanding_amount || '0'
                  } / 原金额 ${fact.amount || '-'} ${fact.currency || ''}`,
                }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          name="credit_note_no"
          label={creditOpen === 'reverse' ? '冲销单号' : '红冲单号'}
          rules={[{ required: true, whitespace: true, message: '请填写单号' }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        {creditOpen !== 'reverse' ? (
          <Form.Item
            name="amount"
            label="红冲金额"
            rules={[
              { required: true, message: '请填写红冲金额' },
              {
                validator: (_, value) =>
                  isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                    ? Promise.resolve()
                    : Promise.reject(new Error('金额必须大于 0')),
              },
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
        ) : null}
        <Form.Item
          name="reason"
          label="原因"
          rules={[{ required: true, whitespace: true, message: '请填写原因' }]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </CreditEditor>
  )
}
