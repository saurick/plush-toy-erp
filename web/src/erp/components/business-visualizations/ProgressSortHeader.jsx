import React from 'react'
import { CaretDownFilled, CaretUpFilled } from '@ant-design/icons'

export default function ProgressSortHeader({ field, query, onSort, label, children }) {
  const direction = query.sort_by === field ? query.sort_direction : ''
  const next = direction === 'asc' ? 'desc' : direction === 'desc' ? '' : 'asc'
  const action = next ? `按${label || children}${next === 'asc' ? '升序' : '降序'}排列` : '恢复默认排序'
  return (
    <th scope="col" aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        className="erp-progress-sort"
        type="button"
        title={action}
        aria-label={action}
        onClick={() => onSort({ sort_by: next ? field : '', sort_direction: next })}
      >
        {children}
        <span className="erp-progress-sort-icons" aria-hidden="true">
          <CaretUpFilled /><CaretDownFilled />
        </span>
      </button>
    </th>
  )
}
