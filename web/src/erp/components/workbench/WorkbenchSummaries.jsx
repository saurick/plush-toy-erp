import React from 'react'
import { Select } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import SalesOrderSummaryPanel from './SalesOrderSummaryPanel.jsx'
import EngineeringMaterialSummaryPanel from './EngineeringMaterialSummaryPanel.jsx'
import './workbenchSummaries.css'

function SummaryTypeControl({ options, selected, onChange }) {
  return (
    <div className="erp-workbench-summaries__heading">
      {options.length > 1 ? (
        <Select
          aria-label="汇总类型"
          value={selected}
          options={options}
          onChange={onChange}
        />
      ) : (
        <h4>{options[0].label}</h4>
      )}
    </div>
  )
}

export default function WorkbenchSummaries({ options, refreshRevision = 0 }) {
  const [params, setParams] = useSearchParams()
  const { adminProfile } = useOutletContext() || {}
  const selected =
    options.find(({ value }) => value === params.get('summary'))?.value ||
    options[0]?.value
  if (!selected) return null
  const accessKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  const summaryTypeControl = (
    <SummaryTypeControl
      inline
      options={options}
      selected={selected}
      onChange={(value) => {
        const next = new URLSearchParams(params)
        next.set('summary', value)
        setParams(next, { replace: true })
      }}
    />
  )
  return (
    <section
      className="erp-business-page-layout erp-workbench-summaries"
      aria-label="工作台汇总"
      data-table-scroll-scope
    >
      {selected === 'sales-orders' ? (
        <SalesOrderSummaryPanel
          key={`sales:${accessKey}`}
          refreshRevision={refreshRevision}
          summaryTypeControl={summaryTypeControl}
        />
      ) : (
        <EngineeringMaterialSummaryPanel
          key={`materials:${accessKey}`}
          refreshRevision={refreshRevision}
          summaryTypeControl={summaryTypeControl}
        />
      )}
    </section>
  )
}
