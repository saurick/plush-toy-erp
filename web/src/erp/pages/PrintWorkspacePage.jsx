import React, { lazy } from 'react'
import { Navigate, useParams } from 'react-router-dom'

const MaterialPurchaseContractPrintWorkspacePage = lazy(
  () => import('./MaterialPurchaseContractPrintWorkspacePage.jsx')
)
const ProcessingContractPrintWorkspacePage = lazy(
  () => import('./ProcessingContractPrintWorkspacePage.jsx')
)

export default function PrintWorkspacePage() {
  const { templateKey } = useParams()

  if (templateKey === 'material-purchase-contract') {
    return <MaterialPurchaseContractPrintWorkspacePage />
  }

  if (templateKey === 'processing-contract') {
    return <ProcessingContractPrintWorkspacePage />
  }

  return <Navigate to="/erp/print-center" replace />
}
