import React from 'react'
import { BusinessProgressSort } from '@/common/consts/statuses.generated.mjs'
import ProgressSortHeader from './ProgressSortHeader.jsx'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import { ProgressDelivery, ProgressLineProduct, ProgressLineRemaining, ProgressLineStatus, ProgressOpenButton } from './ProgressCompactContent.jsx'

const labels = ['订单 / 客户', '产品', '交付日期', '已出货 / 订购', '剩余待交', '交付状态']

export default function ProgressDeliveryLines({ rows, snapshotAt, onOpen, selectedID, query, onSort }) {
  return (
    <table className="erp-progress-table erp-progress-table--delivery" data-table-lines="appearance" aria-label="交付明细">
      <thead>
        <tr>
          <ProgressSortHeader field={BusinessProgressSort.ORDER_NO} query={query} onSort={onSort} label="订单号">{labels[0]}</ProgressSortHeader>
          <ProgressSortHeader field={BusinessProgressSort.PRODUCT} query={query} onSort={onSort}>{labels[1]}</ProgressSortHeader>
          <ProgressSortHeader field={BusinessProgressSort.DUE_DATE} query={query} onSort={onSort}>{labels[2]}</ProgressSortHeader>
          {labels.slice(3, 5).map((label) => <th key={label} scope="col">{label}</th>)}
          <th scope="col" className="erp-progress-line-status-cell">{labels[5]}</th>
          <th scope="col" className="erp-progress-action-cell">操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`erp-progress-row erp-progress-line-row${selectedID === row.id ? ' is-selected' : ''}`}
            data-progress-line-id={row.id}
            onDoubleClick={(event) => openWorkflowTaskRow(event, () => onOpen(row, 'lines'))}
          >
            <td className="erp-progress-line-identity">
              <div className="erp-progress-identity">
                <span className="erp-progress-reference">{row.order_no}</span>
                <span className="erp-progress-customer">{row.customer || '客户未填写'}</span>
              </div>
            </td>
            <td className="erp-progress-line-product"><ProgressLineProduct row={row} /></td>
            <td data-label={labels[2]}>{row.due_date || '未排交期'}</td>
            <td data-label={labels[3]}><ProgressDelivery row={row} showLabel={false} showProgress /></td>
            <td data-label={labels[4]}><ProgressLineRemaining row={row} /></td>
            <td data-label={labels[5]}><ProgressLineStatus row={row} snapshotAt={snapshotAt} /></td>
            <td className="erp-progress-action-cell">
              <ProgressOpenButton row={row} onOpen={() => onOpen(row, 'lines')} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
