import { PROCESSING_CONTRACT_TEMPLATE_KEY } from '../data/processingContractTemplate.mjs'

export const MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY =
  'material-purchase-contract'

export const PROCESSING_CONTRACT_WORKSPACE_PATH = `/erp/print-workspace/${PROCESSING_CONTRACT_TEMPLATE_KEY}`
export const MATERIAL_PURCHASE_CONTRACT_WORKSPACE_PATH = `/erp/print-workspace/${MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY}`

export function isSupportedPrintWorkspaceTemplate(templateKey) {
  return new Set([
    PROCESSING_CONTRACT_TEMPLATE_KEY,
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  ]).has(String(templateKey || '').trim())
}

export function buildPrintWorkspaceURL(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY
) {
  const normalizedTemplateKey = String(templateKey || '').trim()
  const targetPath = `/erp/print-workspace/${normalizedTemplateKey}`
  return new URL(targetPath, window.location.origin).toString()
}

export function openPrintWorkspaceWindow(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY
) {
  const popup = window.open(
    buildPrintWorkspaceURL(templateKey),
    '_blank',
    'width=1440,height=920'
  )

  if (!popup) {
    throw new Error('浏览器拦截了弹窗，请允许弹窗后重试')
  }

  popup.focus()
  return popup
}
