import React from 'react'
import { Button } from 'antd'
import AppPagination from '@/common/components/pagination/AppPagination'
import { formatPaginationTotal } from '@/common/utils/pagination.mjs'
import { TASK_BOARD_PAGE_SIZE_OPTIONS } from '../../utils/workflowTaskBoard.mjs'
import './workflowTaskPagination.css'

function renderTaskPaginationTotal(statusText, count, range) {
  return <span role="status">{statusText || formatPaginationTotal(count, range)}</span>
}

export default function WorkflowTaskPagination({
  total,
  current,
  pageSize,
  loading = false,
  error = false,
  onChange,
  recordLabel = '任务',
  unit = '项',
  retainedPage = null,
  pageSizeOptions = TASK_BOARD_PAGE_SIZE_OPTIONS,
}) {
  const availablePages = Math.max(1, Math.ceil(total / pageSize))
  const retainingPosition = Number.isSafeInteger(retainedPage) && retainedPage > availablePages
  const statusText = loading ? `正在加载${recordLabel}…` : error ? `${recordLabel}加载失败` : null

  return (
    <nav className="erp-task-pagination" aria-label={`${recordLabel}分页`}>
      {retainingPosition ? (
        <div className="erp-task-pagination__recovery">
          <span role="status">{statusText || `原第 ${retainedPage} 页位置，当前筛选共 ${total} ${unit}`}</span>
          <Button disabled={loading} onClick={() => onChange(availablePages, pageSize)}>查看当前待办列表</Button>
        </div>
      ) : (
        <AppPagination
          current={current}
          pageSize={pageSize}
          total={total}
          disabled={loading}
          showSizeChanger={{ 'aria-label': `每页${recordLabel}数`, showSearch: false }}
          pageSizeOptions={pageSizeOptions}
          showTotal={(count, range) => renderTaskPaginationTotal(statusText, count, range)}
          onChange={(page, nextPageSize) => onChange(nextPageSize === pageSize ? page : 1, nextPageSize)}
        />
      )}
    </nav>
  )
}
