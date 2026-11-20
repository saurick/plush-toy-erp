import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'

import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { BusinessOperationPanel } from '../business-list/BusinessListLayout.jsx'
import Select from '@/common/components/select/AppSelect'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import SalesOrderSummaryPanel from './SalesOrderSummaryPanel.jsx'
import EngineeringMaterialSummaryPanel from './EngineeringMaterialSummaryPanel.jsx'
import FinancePaymentSummaryPanel from './FinancePaymentSummaryPanel.jsx'
import './workbenchSummaries.css'

const summaryPanels = {
  'sales-orders': SalesOrderSummaryPanel,
  materials: EngineeringMaterialSummaryPanel,
  payments: FinancePaymentSummaryPanel,
}

function SummaryTypeControl({ options, selected, onChange }) {
  return (
    <div className="erp-workbench-summaries__heading">
      {options.length > 1 || !selected ? (
        <Select
          label="汇总类型"
          placeholder="汇总类型"
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
  const { adminProfile } = useBusinessPageContext() || {}
  const selected = params.get('summary') === '' ? undefined :
    options.find(({ value }) => value === params.get('summary'))?.value ||
    options[0]?.value
  if (!options.length) return null
  const accessKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  const Panel = summaryPanels[selected]
  const summaryTypeControl = (
    <SummaryTypeControl
      inline
      options={options}
      selected={selected}
      onChange={(value) => {
        const next = new URLSearchParams(params)
        next.set('summary', value ?? '')
        setParams(next, { replace: true })
      }}
    />
  )
  return (
    <section
      className="erp-business-toolbar-workspace erp-workbench-summaries"
      aria-label="工作台汇总"
      data-page-table-region
      data-table-scroll-scope
    >
      {!Panel ? (
        <>
          <BusinessOperationPanel compact filters={summaryTypeControl} />
          <Card><Empty description="请选择汇总类型" /></Card>
        </>
      ) : (
        <Panel
          key={`${selected}:${accessKey}`}
          refreshRevision={refreshRevision}
          summaryTypeControl={summaryTypeControl}
        />
      )}
    </section>
  )
}
