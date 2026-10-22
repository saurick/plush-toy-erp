import { cloneElement, createElement } from 'react'

export function formatPaginationTotal(count, range) {
  return `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`
}

function PaginationArrow({ element, label, disabled, paginationDisabled }) {
  // 底层按首尾页重写 disabled；同时保留整个分页的加载锁定。
  return cloneElement(element, {
    'aria-label': label,
    disabled: disabled || paginationDisabled,
  })
}

function renderPaginationItem(_page, type, element, disabled) {
  if (type !== 'prev' && type !== 'next') return element
  return createElement(PaginationArrow, {
    element,
    label: type === 'prev' ? '上一页' : '下一页',
    paginationDisabled: disabled,
  })
}

export function resolveAppPagination(pagination, compact = false) {
  if (pagination === false) return false
  return {
    showTotal: formatPaginationTotal,
    itemRender: (page, type, element) => renderPaginationItem(page, type, element, pagination?.disabled),
    ...pagination,
    size: 'small',
    simple: pagination?.simple ?? (compact ? { readOnly: true } : false),
    className: ['app-pagination', pagination?.className].filter(Boolean).join(' '),
  }
}
