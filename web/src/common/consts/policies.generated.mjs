// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。
// 真源：server/internal/biz/business_pagination.go、server/internal/biz/work_center_pagination.go、server/internal/biz/admin_password.go、server/internal/biz/bom_source_snapshot.go、server/internal/biz/help_content.go、server/internal/biz/sales_order_export.go、server/internal/server/template_pdf.go、server/internal/server/template_pdf_security.go。
export const AdminPasswordPolicy = Object.freeze({
  maxBytes: 72,
  maxCharacters: 20,
  minCharacters: 8,
})

export const BOMSourcePolicy = Object.freeze({
  formulaCharacters: 512,
  maxRow: 1048576,
  numberCharacters: 384,
  scale: 324,
  textCharacters: 255,
})

export const BusinessPaginationPolicy = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 500,
})

export const HelpContentPolicy = Object.freeze({
  feedbackMaxCharacters: 3000,
  feedbackMinCharacters: 5,
  markdownMaxCharacters: 20000,
  quoteMaxCharacters: 2000,
  responseMaxCharacters: 1000,
  summaryMaxCharacters: 300,
})

export const PrintPolicy = Object.freeze({
  fontBytes: 262144,
  fontCount: 128,
  fontTotalBytes: 2097152,
  htmlBytes: 25165824,
  imageBytes: 5242880,
  imageCount: 32,
  imageTotalBytes: 16777216,
})

export const SalesOrderExportPolicy = Object.freeze({
  maxBytes: 8388608,
  maxRows: 5000,
})

export const WorkCenterPaginationPolicy = Object.freeze({
  defaultPageSize: 20,
  maxPageSize: 100,
})
