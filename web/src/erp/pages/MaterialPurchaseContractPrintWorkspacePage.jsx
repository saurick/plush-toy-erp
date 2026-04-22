import React, { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import MaterialPurchaseContractWorkbench from '../components/print/MaterialPurchaseContractWorkbench.jsx'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'

const MATERIAL_PURCHASE_DRAFT_STORAGE_KEY =
  '__plush_erp_material_purchase_contract_print_draft__'

export default function MaterialPurchaseContractPrintWorkspacePage() {
  const template = getPrintTemplateByKey('material-purchase-contract')

  useEffect(() => {
    document.title = '采购合同打印窗口'
  }, [])

  if (!template) {
    return <Navigate to="/erp/print-center" replace />
  }

  return (
    <MaterialPurchaseContractWorkbench
      template={template}
      draftStorageKey={MATERIAL_PURCHASE_DRAFT_STORAGE_KEY}
    />
  )
}
