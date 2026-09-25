import React, { useRef, useState } from 'react'
import { Button, Popover } from 'antd'
import { DownOutlined, FilterOutlined } from '@ant-design/icons'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import {
  MOBILE_TASK_SORT_OPTIONS,
  MOBILE_TASK_STATUS_OPTIONS,
} from '../../utils/mobileTaskQueries.mjs'

export default function MobileTaskListOptions({
  contextLabel = '任务',
  sortKey,
  statusKey,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const filterCount = Number(sortKey !== 'newest') + Number(Boolean(statusKey))

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) triggerRef.current?.focus({ preventScroll: true })
      }}
      placement="bottomRight"
      arrow={false}
      autoAdjustOverflow
      classNames={{ root: 'mobile-task-filter-popover erp-mobile-controls' }}
      content={
        <div
          className="mobile-task-filter-dropdown"
          role="group"
          aria-label={`筛选${contextLabel}`}
          data-filter-context={contextLabel}
        >
          <fieldset>
            <legend>任务排序</legend>
            <SlidingSegmented
              block
              aria-label="任务排序"
              value={sortKey}
              options={MOBILE_TASK_SORT_OPTIONS}
              onChange={(value) => {
                onChange({ sortKey: value, statusKey })
                setOpen(false)
              }}
            />
          </fieldset>
          <fieldset>
            <legend>任务状态</legend>
            <SlidingSegmented
              block
              aria-label="任务状态筛选"
              value={statusKey}
              options={MOBILE_TASK_STATUS_OPTIONS}
              onChange={(value) => {
                onChange({ sortKey, statusKey: value })
                setOpen(false)
              }}
            />
          </fieldset>
          <Button
            type="text"
            block
            className="mobile-task-filter-dropdown__reset"
            onClick={() => {
              onChange({ sortKey: 'newest', statusKey: '' })
              setOpen(false)
            }}
          >
            重置筛选
          </Button>
        </div>
      }
    >
      <button
        ref={triggerRef}
        type="button"
        className="mobile-task-list-options__trigger erp-control-button"
        data-testid="mobile-task-list-filter-trigger"
        aria-label={
          filterCount
            ? `筛选${contextLabel}，已应用 ${filterCount} 项`
            : `筛选${contextLabel}`
        }
        aria-haspopup="true"
        aria-expanded={open}
        data-active={filterCount > 0}
      >
        <FilterOutlined aria-hidden="true" />
        <span>筛选</span>
        {filterCount > 0 && (
          <span className="erp-control-count">{filterCount}</span>
        )}
        <DownOutlined
          className="mobile-task-list-options__chevron"
          aria-hidden="true"
        />
      </button>
    </Popover>
  )
}
