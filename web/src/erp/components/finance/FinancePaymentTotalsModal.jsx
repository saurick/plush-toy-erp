import React, { useMemo } from 'react'
import { Alert } from 'antd'
import Table from '@/common/components/table/AppTable'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { FinancePaymentDirection, FinancePaymentStatus } from '../../../common/consts/statuses.generated.mjs'
import { formatNumeric20Scale6Summary } from '../../utils/numeric20Scale6.mjs'
import { PAYMENT_DIRECTION_OPTIONS, paymentStatus } from './financePaymentPresentation.jsx'

const statusOrder = [
  FinancePaymentStatus.POSTED, FinancePaymentStatus.APPROVED, FinancePaymentStatus.DRAFT,
  FinancePaymentStatus.REJECTED, FinancePaymentStatus.CANCELLED, FinancePaymentStatus.REVERSED,
]

function groupRows(totals) {
  const rows = totals.map((item) => ({ ...item, currencySpan: 0, directionSpan: 0 }))
  rows.sort((a, b) => a.currency.localeCompare(b.currency)
    || Number(b.direction === FinancePaymentDirection.RECEIPT) - Number(a.direction === FinancePaymentDirection.RECEIPT)
    || statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))
  let currencyHead
  let directionHead
  for (const row of rows) {
    const currencyChanged = currencyHead?.currency !== row.currency
    if (currencyChanged) currencyHead = row
    if (currencyChanged || directionHead?.direction !== row.direction) directionHead = row
    currencyHead.currencySpan += 1
    directionHead.directionSpan += 1
  }
  return rows
}

const columns = [
  { title: '币种', dataIndex: 'currency', onCell: (row) => ({ rowSpan: row.currencySpan }) },
  {
    title: '收付方向',
    dataIndex: 'direction',
    onCell: (row) => ({ rowSpan: row.directionSpan }),
    render: (value) => PAYMENT_DIRECTION_OPTIONS.find((option) => option.value === value)?.label,
  },
  { title: '状态', dataIndex: 'status', render: paymentStatus },
  { title: '笔数', dataIndex: 'count', align: 'right' },
  { title: '金额', dataIndex: 'amount', align: 'right', render: (value) => formatNumeric20Scale6Summary(value, 2) },
]

export default function FinancePaymentTotalsModal({ open, onClose, totals, total, filterLabels, loading }) {
  const rows = useMemo(() => totals ? groupRows(totals) : [], [totals])
  return (
    <BusinessModal open={open} onCancel={onClose} title="金额汇总" size="columnOrder" closable={{ 'aria-label': '关闭金额汇总' }} footer={null}>
      {totals === null && !loading ? (
        <Alert type="error" showIcon message="金额汇总暂不可用，请刷新收付款记录后重试" />
      ) : (
        <>
          <p className="erp-business-inline-note">
            {[...filterLabels, '全部页', loading ? '正在读取' : `共 ${total} 笔`].filter(Boolean).join(' · ')}
          </p>
          <Table
            size="small"
            rowKey={(row) => `${row.currency}:${row.direction}:${row.status}`}
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            locale={{ emptyText: '当前筛选下没有可汇总的金额' }}
          />
        </>
      )}
    </BusinessModal>
  )
}
