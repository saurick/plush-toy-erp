import React from 'react'
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { Button, Grid, Pagination, Select } from 'antd'
import { TASK_BOARD_PAGE_SIZE_OPTIONS } from '../../utils/workflowTaskBoard.mjs'
import './workflowTaskPagination.css'

function renderPageItem(page, type, element) {
  if (type !== 'prev' && type !== 'next') return element
  const previous = type === 'prev'
  return React.cloneElement(
    element,
    { 'aria-label': previous ? '上一页' : '下一页' },
    previous ? <ArrowLeftOutlined aria-hidden="true" /> : null,
    <span>{previous ? '上一页' : '下一页'}</span>,
    previous ? null : <ArrowRightOutlined aria-hidden="true" />
  )
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
  const screens = Grid.useBreakpoint()
  const compact = screens.md === false
  const availablePages = Math.max(1, Math.ceil(total / pageSize))
  const retainingPosition = Number.isSafeInteger(retainedPage) && retainedPage > availablePages
  const start = total > 0 ? (current - 1) * pageSize + 1 : 0
  const end = Math.min(current * pageSize, total)
  return (
    <nav className="erp-task-pagination" aria-label={`${recordLabel}分页`}>
      <div className="erp-task-pagination__summary">
        <span role="status">
          {loading
            ? `正在加载${recordLabel}…`
            : error
              ? `${recordLabel}加载失败`
              : retainingPosition
                ? `原第 ${retainedPage} 页位置，当前筛选共 ${total} ${unit}`
                : compact
                ? `${start}–${end} / ${total} ${unit}`
                : `第 ${start}–${end} ${unit}，共 ${total} ${unit}`}
        </span>
        <Select
          aria-label={`每页${recordLabel}数`}
          value={pageSize}
          disabled={loading}
          showSearch={false}
          options={pageSizeOptions.map((value) => ({
            value,
            label: `${value} ${unit} / 页`,
          }))}
          onChange={(size) => onChange(1, size)}
        />
      </div>
      {retainingPosition ? (
        <Button onClick={() => onChange(availablePages, pageSize)}>查看当前待办列表</Button>
      ) : <Pagination
        size="default"
        current={current}
        pageSize={pageSize}
        total={total}
        disabled={loading}
        showSizeChanger={false}
        showLessItems
        simple={compact}
        showQuickJumper={!compact && total > pageSize * 7}
        itemRender={renderPageItem}
        onChange={onChange}
      />}

    </nav>
  )
}
