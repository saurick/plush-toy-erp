import React from 'react'
import { Form, Input } from 'antd'
import Select from '@/common/components/select/AppSelect'

import { FinanceAllocationStatus } from '../../../common/consts/statuses.generated.mjs'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'

export function FinanceAllocationReversalModal({
  currentPayment,
  loading,
  unallocateOpen,
  setUnallocateOpen,
  unallocateForm,
  reverseAllocation,
}) {
  return (
    <BusinessFormModal
      title="撤销抵扣"
      open={unallocateOpen}
      confirmLoading={loading}
      onCancel={() => !loading && setUnallocateOpen(false)}
      onOk={reverseAllocation}
      okText="确认撤销抵扣"
    >
      <p className="erp-business-inline-note">
        只恢复应收应付和款项可用余额；实际退款另行登记并审批。
      </p>
      <Form form={unallocateForm} layout="vertical" preserve={false}>
        <Form.Item
          name="allocation_id"
          label="已抵扣记录"
          rules={[{ required: true }]}
        >
          <Select
            placeholder="请选择已抵扣记录"
            options={(currentPayment?.allocations || [])
              .filter(
                (a) =>
                  a.status === FinanceAllocationStatus.POSTED &&
                  !(currentPayment?.allocations || []).some(
                    (r) => r.reversal_of_allocation_id === a.id
                  )
              )
              .map((a) => ({
                value: a.id,
                label: `${a.finance_fact_no} · ${a.amount} ${a.currency}`,
              }))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="撤销原因"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea maxLength={255} />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
export function FinancePaymentCancelModal({
  loading,
  cancelOpen,
  setCancelOpen,
  cancelForm,
  cancelPayment,
}) {
  return (
    <BusinessFormModal
      title="取消收付款"
      size="confirm"
      description="取消不会删除收付款记录；已发生的流程效果仍保留恢复审计。"
      open={cancelOpen}
      okText="确认取消"
      cancelText="返回"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      maskClosable={!loading}
      onCancel={() => !loading && setCancelOpen(false)}
      onOk={cancelPayment}
    >
      <Form
        form={cancelForm}
        name="finance-payment-cancel"
        className="erp-business-action-form"
        layout="vertical"
        preserve={false}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="reason"
          label="取消原因"
          rules={[
            { required: true, whitespace: true, message: '请填写取消原因' },
          ]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
export function FinancePaymentReversalModal({
  loading,
  reverseOpen,
  setReverseOpen,
  reverseForm,
  reversePayment,
}) {
  return (
    <BusinessFormModal
      title="冲销收付款"
      size="confirm"
      description="冲销会恢复原核销金额并保留原收付款及核销记录。"
      open={reverseOpen}
      okText="确认冲销"
      cancelText="返回"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      maskClosable={!loading}
      onCancel={() => !loading && setReverseOpen(false)}
      onOk={reversePayment}
    >
      <Form
        form={reverseForm}
        name="finance-payment-reverse"
        className="erp-business-action-form"
        layout="vertical"
        preserve={false}
      >
        <Form.Item
          name="reason"
          label="冲销原因"
          rules={[
            { required: true, whitespace: true, message: '请填写冲销原因' },
          ]}
        >
          <Input.TextArea rows={3} maxLength={255} showCount />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
