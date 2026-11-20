import { SalesOrderExportPolicy } from '../../common/consts/policies.generated.mjs'

export function validateSalesOrderExport(data) {
  const rows = data?.sales_orders
  if (
    !Array.isArray(rows) || !Number.isSafeInteger(data?.total) ||
    data.total !== rows.length || data.total > SalesOrderExportPolicy.maxRows ||
    rows.some((row) => !Number.isSafeInteger(row?.id) || row.id <= 0) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new TextEncoder().encode(JSON.stringify(data)).byteLength > SalesOrderExportPolicy.maxBytes
  ) {
    const error = new Error('销售订单导出内容不完整，请重新读取')
    error.isInvalidResponse = true
    throw error
  }
  return rows
}
