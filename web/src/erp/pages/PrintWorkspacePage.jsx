import React from 'react'
import { Navigate, useParams } from 'react-router-dom'
import MaterialPurchaseContractPrintWorkspacePage from './MaterialPurchaseContractPrintWorkspacePage.jsx'
import ProcessingContractPrintWorkspacePage from './ProcessingContractPrintWorkspacePage.jsx'

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
