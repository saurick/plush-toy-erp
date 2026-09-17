import React from 'react'
import { Pagination } from 'antd'

export default function BusinessDetailsPagination({
  current,
  pageSize,
  total,
  onChange,
  contentRef,
}) {
  return (
    <>
      <span className="erp-business-details-total">共 {total} 条</span>
      {total > pageSize ? (
        <Pagination
          aria-label="明细分页"
          current={current}
          pageSize={pageSize}
          responsive
          showLessItems
          showSizeChanger={false}
          size="small"
          total={total}
          onChange={(page) => {
            onChange(page)
            requestAnimationFrame(() => {
              contentRef.current?.scrollIntoView({ block: 'start' })
            })
          }}
        />
      ) : null}
    </>
  )
}
