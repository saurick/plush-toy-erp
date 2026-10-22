import React from 'react'
import './businessCellStack.css'

export default function BusinessCellStack({ primary, secondary }) {
  const first = String(primary ?? '').trim()
  const second = String(secondary ?? '').trim()
  return (
    <span className="erp-business-cell-stack">
      <span>{first || second || '-'}</span>
      {first && second ? (
        <span className="erp-business-cell-stack__secondary">{second}</span>
      ) : null}
    </span>
  )
}
