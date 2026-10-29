import React from 'react'

import { FinanceAllocationStatus } from '../../../common/consts/statuses.generated.mjs'

import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessDetailsModal from '../business-list/BusinessDetailsModal.jsx'

export function FinancePaymentDetails({
  canUploadEvidence = false,
  canWithdrawEvidence = false,
  paymentDetail,
  setPaymentDetail,
  creditDetail,
  setCreditDetail,
  paymentColumns,
  creditColumns,
}) {
  const paymentDetailLineItems = {
    title: '核销明细',
    items: Array.isArray(paymentDetail?.allocations)
      ? paymentDetail.allocations
      : [],
    emptyDescription: '当前收付款尚未形成核销明细',
    getItemKey: (item) => item?.id,
    getItemLabel: (_item, { index }) => `明细 ${index + 1}`,
    getItemFields: (item) => [
      {
        key: 'source',
        label: '来源单号',
        value: item?.finance_fact_no,
        strong: true,
        wide: true,
      },
      {
        key: 'type',
        label: '来源类型',
        value: item?.finance_fact_type === 'RECEIVABLE' ? '应收' : '应付',
      },
      {
        key: 'status',
        label: '核销状态',
        value:
          item?.status === FinanceAllocationStatus.REVERSED
            ? '已冲销'
            : '已过账',
      },
      { key: 'amount', label: '核销金额', value: item?.amount },
      { key: 'currency', label: '币种', value: item?.currency },
      {
        key: 'reason',
        label: '撤销原因',
        value: item?.reason || '-',
        wide: true,
      },
      {
        key: 'original',
        label: '来源原金额',
        value: item?.finance_fact_original_amount || '-',
        rowStart: true,
      },
      {
        key: 'outstanding',
        label: '当前未核销',
        value: item?.finance_fact_outstanding_amount ?? '-',
      },
    ],
  }

  return (
    <>
      <BusinessDetailsModal
        descriptionInHelp
        open={Boolean(paymentDetail)}
        title="收付款详情"
        description="收付款来源、核销明细与当前状态均以系统最新记录为准。"
        record={paymentDetail}
        columns={paymentColumns}
        lineItems={paymentDetailLineItems}
        onClose={() => setPaymentDetail(null)}
      >
        {paymentDetail?.id ? <BusinessAttachmentPanel ownerType="finance_payment" ownerId={paymentDetail.id} canUpload={canUploadEvidence} canWithdraw={canWithdrawEvidence} title="收付款凭据" /> : null}
      </BusinessDetailsModal>
      <BusinessDetailsModal
        open={Boolean(creditDetail)}
        title="账款调整详情"
        description="调整保留来源应收或应付、原金额、调整方向和当前未核销金额。"
        record={creditDetail}
        columns={creditColumns}
        onClose={() => setCreditDetail(null)}
      />
    </>
  )
}
