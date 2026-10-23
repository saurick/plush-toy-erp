import React, { useMemo } from 'react'
import { Tag } from 'antd'

import { FinanceAllocationStatus } from '../../../common/consts/statuses.generated.mjs'

import { formatUnixDateTime } from '../../utils/masterDataOrderView.mjs'

import {
  paymentStatus,
  paymentStatusLabel,
  creditStatusLabel,
  financeFactTypeLabel,
  paymentAllocationExportValue,
  paymentSourceReference,
} from './financePaymentPresentation.jsx'

export default function useFinancePaymentColumns({ customers, suppliers }) {
  const paymentColumns = useMemo(() => {
    const counterpartyLabel = (record) => {
      const source =
        record?.counterparty_type === 'CUSTOMER' ? customers : suppliers
      return (
        source.find(
          (item) => Number(item.id) === Number(record?.counterparty_id)
        )?.name || '往来方已关联'
      )
    }

    return [
      {
        defaultPriority: 10,
        title: '收付款单号',
        dataIndex: 'payment_no',
        copyable: { label: '收付款单号' },
        detailCopyable: true,
        width: 200,
      },
      {
        defaultPriority: 40,
        title: '方向',
        dataIndex: 'direction',
        width: 100,
        render: (value) => (value === 'RECEIPT' ? '收款' : '付款'),
        exportValue: (record) =>
          record?.direction ? record.direction === 'RECEIPT' ? '收款' : '付款' : '',
      },
      {
        align: 'right',
        defaultPriority: 50,
        title: '金额',
        dataIndex: 'amount',
        width: 140,
      },
      { defaultPriority: 60, title: '币种', dataIndex: 'currency', width: 90 },
      {
        defaultPriority: 65,
        title: '款项用途',
        dataIndex: 'kind',
        width: 150,
        render: (value) =>
          ({
            SETTLEMENT: '结算款',
            ADVANCE: '订单预收 / 预付',
            REFUND: '实际退款',
          })[value] || '用途待核对',
        exportValue: (row) =>
          ({
            SETTLEMENT: '结算款',
            ADVANCE: '订单预收 / 预付',
            REFUND: '实际退款',
          })[row.kind] || (row.kind ? '用途待核对' : ''),
      },
      {
        defaultPriority: 66,
        title: '关联来源',
        dataIndex: 'source_no',
        width: 190,
        render: (_value, record) => paymentSourceReference(record),
        exportValue: (record) => paymentSourceReference(record, { emptyText: '' }),
      },
      {
        defaultHidden: true,
        title: '原收付款单',
        dataIndex: 'refund_of_payment_no',
        width: 190,
      },
      {
        defaultHidden: true,
        title: '已抵扣',
        dataIndex: 'allocated_amount',
        width: 130,
        align: 'right',
      },
      {
        defaultHidden: true,
        title: '已退款',
        dataIndex: 'refunded_amount',
        width: 130,
        align: 'right',
      },
      {
        defaultPriority: 67,
        title: '待抵扣 / 可退余额',
        dataIndex: 'available_amount',
        width: 170,
        align: 'right',
      },
      {
        defaultHidden: true,
        title: '款项说明',
        dataIndex: 'purpose_note',
        width: 220,
      },
      {
        align: 'left',
        defaultPriority: 30,
        title: '往来方',
        key: 'counterparty',
        copyable: {
          label: '往来方',
          resolveValue: (_value, record) => counterpartyLabel(record),
        },
        width: 200,
        detailValue: counterpartyLabel,
        render: (_, record) => counterpartyLabel(record),
        exportValue: (record) => record?.counterparty_id ? counterpartyLabel(record) : '',
      },
      {
        defaultPriority: 20,
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: paymentStatus,
        exportValue: (record) => record?.status ? paymentStatusLabel(record?.status) : '',
      },
      {
        align: 'left',
        defaultPriority: 80,
        defaultHidden: true,
        title: '核销明细',
        dataIndex: 'allocations',
        width: 110,
        render: (items) => `${Array.isArray(items) ? items.length : 0} 笔`,
        exportValue: paymentAllocationExportValue,
      },
      {
        align: 'left',
        defaultHidden: true,
        title: '账户摘要',
        dataIndex: 'account_ref',
        copyable: { label: '账户摘要' },
        width: 200,
      },
      {
        align: 'left',
        defaultHidden: true,
        title: '业务凭据',
        dataIndex: 'evidence_ref',
        copyable: { label: '业务凭据' },
        width: 200,
      },
      {
        defaultPriority: 70,
        title: '发生时间',
        dataIndex: 'occurred_at',
        width: 170,
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.occurred_at, { emptyText: '' }),
      },
    ]
  }, [customers, suppliers])

  const creditColumns = useMemo(
    () => [
      {
        defaultPriority: 10,
        title: '红冲单号',
        dataIndex: 'credit_note_no',
        copyable: { label: '红冲单号' },
        detailCopyable: true,
        width: 200,
      },
      {
        defaultPriority: 30,
        title: '来源财务记录',
        dataIndex: 'finance_fact_no',
        copyable: { label: '来源财务记录' },
        detailCopyable: true,
        width: 190,
        render: (value) => value || '已关联财务记录',
        exportValue: (record) => record?.finance_fact_no || (record?.finance_fact_id ? '已关联财务记录' : ''),
      },
      {
        defaultPriority: 40,
        title: '来源类型',
        dataIndex: 'finance_fact_type',
        width: 110,
        render: financeFactTypeLabel,
        exportValue: (record) =>
          record?.finance_fact_type ? financeFactTypeLabel(record?.finance_fact_type) : '',
      },
      {
        align: 'right',
        defaultPriority: 50,
        title: '红冲金额',
        dataIndex: 'amount',
        width: 140,
      },
      { defaultPriority: 60, title: '币种', dataIndex: 'currency', width: 90 },
      {
        align: 'right',
        defaultPriority: 80,
        title: '来源原金额',
        dataIndex: 'finance_fact_original_amount',
        width: 140,
      },
      {
        align: 'right',
        defaultPriority: 70,
        title: '红冲后未核销',
        dataIndex: 'finance_fact_outstanding_amount',
        width: 150,
      },
      {
        defaultPriority: 20,
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (value) => (
          <Tag
            color={
              value === FinanceAllocationStatus.REVERSED ? 'magenta' : 'gold'
            }
          >
            {creditStatusLabel(value)}
          </Tag>
        ),
        exportValue: (record) => record?.status ? creditStatusLabel(record?.status) : '',
      },
      { align: 'left', title: '原因', dataIndex: 'reason', width: 260 },
    ],
    []
  )

  return { paymentColumns, creditColumns }
}
