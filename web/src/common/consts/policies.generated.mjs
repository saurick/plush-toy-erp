// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。
// 真源：server/internal/biz/admin_password.go、server/internal/server/template_pdf.go、server/internal/server/template_pdf_security.go。
export const AdminPasswordPolicy = Object.freeze({
  maxBytes: 72,
  maxCharacters: 20,
  minCharacters: 8,
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
