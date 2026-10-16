import React from 'react'
import { Alert, Form, Input } from 'antd'

import { FinancePaymentStatus } from '../../../common/consts/statuses.generated.mjs'

import BusinessCompactFieldTable, {
  BusinessCompactFieldRow,
} from '../business-list/BusinessCompactFieldTable.jsx'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'

import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'

import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

export function FinanceAllocationEditor({
  currentPayment,
  loading,
  allocationOpen,
  setAllocationOpen,
  allocationForm,
  attemptsRef,
  allocationCandidates,
  initializeAllocationForm,
  postPayment,
}) {
  return (
    <BusinessFormModal
      className="erp-business-action-modal--operational-fact"
      title="选择核销记录"
      description={
        currentPayment?.status === FinancePaymentStatus.POSTED
          ? `可抵扣余额 ${currentPayment.available_amount} ${currentPayment.currency}；可分批抵扣，剩余款项继续保留。`
          : '本次核销合计必须精确等于收付款金额，且每笔不得超过来源记录的当前未核销金额。'
      }
      open={allocationOpen}
      size="localAction"
      okText={
        currentPayment?.status === FinancePaymentStatus.POSTED
          ? '确认抵扣'
          : '过账并核销'
      }
      cancelText="取消"
      confirmLoading={loading}
      maskClosable={!loading}
      okButtonProps={{
        disabled:
          allocationCandidates.length === 0 &&
          !attemptsRef.current.peek(`finance-allocation:${currentPayment?.id}`),
      }}
      afterOpenChange={initializeAllocationForm}
      onCancel={() => !loading && setAllocationOpen(false)}
      onOk={() => postPayment(false)}
    >
      <div className="erp-business-inline-note" role="note">
        仅显示与当前收付款方向、往来方和币种一致的已过账记录；提交时会再次核对可核销余额。
      </div>
      {allocationCandidates.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="当前没有可核销的应收或应付记录"
        />
      ) : null}
      <Form
        form={allocationForm}
        name="finance-payment-allocation"
        className="erp-business-action-form"
        layout="vertical"
        disabled={loading}
      >
        <Form.List name="allocations">
          {(fields) => (
            <BusinessCompactFieldTable
              label="核销明细"
              showSequence
              columns={[
                { label: '应收 / 应付' },
                { label: '未核销余额', width: 180 },
                {
                  label: (
                    <BusinessHelpLabel
                      itemKey="allocation-amount"
                      label="本次核销金额"
                      pageKey="finance-payments"
                    />
                  ),
                  width: 180,
                },
              ]}
            >
              {fields.map((field) => (
                <BusinessCompactFieldRow
                  key={field.key}
                  label={`核销明细 ${field.name + 1}`}
                  sequence={field.name + 1}
                  cells={[
                    <>
                      <Form.Item name={[field.name, 'finance_fact_id']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'label']}
                        label="应收 / 应付"
                      >
                        <Input disabled />
                      </Form.Item>
                    </>,
                    <Form.Item
                      name={[field.name, 'outstanding_amount']}
                      label="未核销余额"
                    >
                      <Input disabled />
                    </Form.Item>,
                    <Form.Item
                      name={[field.name, 'amount']}
                      label="本次核销金额"
                      rules={[
                        {
                          validator: (_, value) =>
                            !String(value || '').trim() ||
                            isPositiveNumeric20Scale6Units(
                              numeric20Scale6Units(value)
                            )
                              ? Promise.resolve()
                              : Promise.reject(new Error('金额必须大于 0')),
                        },
                      ]}
                    >
                      <Input inputMode="decimal" />
                    </Form.Item>,
                  ]}
                />
              ))}
            </BusinessCompactFieldTable>
          )}
        </Form.List>
      </Form>
    </BusinessFormModal>
  )
}
