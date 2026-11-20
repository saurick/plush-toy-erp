import React from 'react'
import { CONTRACT_PAPER_MIN_ROWS } from '../../utils/contractPaperPresentation.mjs'

export default function ContractBlankRows({ lineCount, columns }) {
  return Array.from(
    { length: Math.max(0, CONTRACT_PAPER_MIN_ROWS - lineCount) },
    (_, index) => (
      <tr key={`blank-${index}`} data-print-layout-row="" aria-hidden="true">
        {columns.map(({ key }) => (
          <td key={key} />
        ))}
      </tr>
    )
  )
}
