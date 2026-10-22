import { cloneElement } from 'react'

export function formatPaginationTotal(count, range) {
  return `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`
}

function renderPaginationItem(_page, type, element) {
  if (type !== 'prev' && type !== 'next') return element
  return cloneElement(element, { 'aria-label': type === 'prev' ? '上一页' : '下一页' })
}

export function resolveAppPagination(pagination, compact = false) {
  if (pagination === false) return false
  return {
    showTotal: formatPaginationTotal,
    itemRender: renderPaginationItem,
    ...pagination,
    size: 'small',
    simple: pagination?.simple ?? (compact ? { readOnly: true } : false),
    className: ['app-pagination', pagination?.className].filter(Boolean).join(' '),
  }
}
