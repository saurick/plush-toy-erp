import { formatPaginationTotal } from '../../common/utils/pagination.mjs'

export const DEV_PAGINATION = Object.freeze({
  className: 'erp-dev-pagination',
  size: 'default',
  showSizeChanger: false,
  showTotal: formatPaginationTotal,
})
