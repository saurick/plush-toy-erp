import React from 'react'
import { Button } from 'antd'
import { BusinessProgressSort } from '@/common/consts/statuses.generated.mjs'
import ProgressSortHeader from './ProgressSortHeader.jsx'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import { ProgressDelivery, ProgressLineProduct, ProgressLineRemaining, ProgressLineStatus } from './ProgressCompactContent.jsx'

const labels = ['订单 / 客户', '产品', '交付日期', '已出货 / 订购', '剩余待交', '交付状态']

export default function ProgressDeliveryLines({ rows, snapshotAt, onOpen, selectedID, query, onSort }) {
  return (
    <table className="erp-progress-table erp-progress-table--delivery" data-table-lines="appearance" aria-label="交付明细">
      <thead>
        <tr>
          <ProgressSortHeader field={BusinessProgressSort.ORDER_NO} query={query} onSort={onSort} label="订单号">{labels[0]}</ProgressSortHeader>
          <ProgressSortHeader field={BusinessProgressSort.PRODUCT} query={query} onSort={onSort}>{labels[1]}</ProgressSortHeader>
          <ProgressSortHeader field={BusinessProgressSort.DUE_DATE} query={query} onSort={onSort}>{labels[2]}</ProgressSortHeader>
          {labels.slice(3).map((label) => <th key={label} scope="col">{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`erp-progress-row erp-progress-line-row${selectedID === row.id ? ' is-selected' : ''}`}
            data-progress-line-id={row.id}
            data-row-action
            onClick={(event) => openWorkflowTaskRow(event, () => {
              event.currentTarget.querySelector('[data-task-entry]')?.focus({ preventScroll: true })
              onOpen(row, 'lines')
            })}
          >
            <td className="erp-progress-line-identity">
              <div className="erp-progress-identity">
                <Button
                  type="link"
                  size="small"
                  className="erp-progress-line-open"
                  data-task-entry
                  aria-label={`查看 ${row.order_no} · ${row.product} · 第 ${row.line.line_no} 行进度`}
                  aria-haspopup="dialog"
                  onClick={() => onOpen(row, 'lines')}
                >
                  {row.order_no}
                </Button>
                <span className="erp-progress-customer">{row.customer || '客户未填写'}</span>
              </div>
            </td>
            <td className="erp-progress-line-product"><ProgressLineProduct row={row} /></td>
            <td data-label={labels[2]}>{row.due_date || '未排交期'}</td>
            <td data-label={labels[3]}><ProgressDelivery row={row} showLabel={false} showProgress /></td>
            <td data-label={labels[4]}><ProgressLineRemaining row={row} /></td>
            <td data-label={labels[5]}><ProgressLineStatus row={row} snapshotAt={snapshotAt} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
