import React from 'react'
import { Select } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import SalesOrderSummaryPanel from './SalesOrderSummaryPanel.jsx'
import EngineeringMaterialSummaryPanel from './EngineeringMaterialSummaryPanel.jsx'
import './workbenchSummaries.css'

export default function WorkbenchSummaries({ options }) {
  const [params, setParams] = useSearchParams()
  const { adminProfile } = useOutletContext() || {}
  const selected =
    options.find(({ value }) => value === params.get('summary'))?.value ||
    options[0]?.value
  if (!selected) return null
  const accessKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  return (
    <section className="erp-workbench-summaries" aria-label="工作台汇总">
      <div className="erp-workbench-summaries__heading">
        {options.length > 1 ? (
          <Select
            aria-label="汇总类型"
            value={selected}
            options={options}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('summary', value)
              setParams(next, { replace: true })
            }}
          />
        ) : (
          <h4>{options[0].label}</h4>
        )}
      </div>
      {selected === 'sales-orders' ? (
        <SalesOrderSummaryPanel key={`sales:${accessKey}`} />
      ) : (
        <EngineeringMaterialSummaryPanel key={`materials:${accessKey}`} />
      )}
    </section>
  )
}
