import React from 'react'
import { Grid, Pagination, Select } from 'antd'

const PAGE_SIZE_OPTIONS = [10, 20, 50].map((value) => ({
  label: `${value} 条/页`,
  value,
}))

export default function BusinessDetailsPagination({
  current,
  pageSize,
  total,
  onChange,
  contentRef,
}) {
  const screens = Grid.useBreakpoint()
  const changePage = (page, nextPageSize) => {
    onChange(page, nextPageSize)
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  return (
    <>
      <span className="erp-business-details-total">共 {total} 条</span>
      <Select
        aria-label="每页明细条数"
        className="erp-business-details-page-size"
        disabled={total === 0}
        options={PAGE_SIZE_OPTIONS}
        showSearch={false}
        virtual={false}
        value={pageSize}
        onChange={(nextPageSize) => changePage(1, nextPageSize)}
      />
      <Pagination
        aria-label="明细分页"
        className="erp-business-details-pagination"
        current={current}
        disabled={total === 0}
        pageSize={pageSize}
        responsive={false}
        showLessItems
        showSizeChanger={false}
        simple={screens.sm ? false : { readOnly: true }}
        size="default"
        total={total}
        onChange={(page) => changePage(page, pageSize)}
      />
    </>
  )
}
