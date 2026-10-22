import React from 'react'
import AppPagination from '@/common/components/pagination/AppPagination'

export const BUSINESS_DETAILS_PAGE_SIZE = 10

export default function BusinessDetailsPagination({
  current,
  pageSize,
  total,
  onChange,
  contentRef,
}) {
  const changePage = (page, nextPageSize) => {
    onChange(nextPageSize === pageSize ? page : 1, nextPageSize)
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  return (
    <AppPagination
      aria-label="明细分页"
      className="erp-business-details-pagination"
      current={current}
      disabled={total === 0}
      pageSize={pageSize}
      pageSizeOptions={[10, 20, 50]}
      showSizeChanger={{ 'aria-label': '每页明细条数', showSearch: false, virtual: false }}
      total={total}
      onChange={changePage}
    />
  )
}
