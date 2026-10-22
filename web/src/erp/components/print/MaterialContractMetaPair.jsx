import React from 'react'

export default function MaterialContractMetaPair({ left, right }) {
  return (
    <div className="erp-material-contract-meta__pair">
      <div className="erp-material-contract-meta__cell erp-material-contract-meta__cell--left">
        {left}
      </div>
      <div className="erp-material-contract-meta__cell erp-material-contract-meta__cell--right">
        {right}
      </div>
    </div>
  )
}
