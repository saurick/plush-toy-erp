import React, { useEffect, useState } from 'react'
import { Alert, Button } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listSalesOrderSummaryFilterOptions } from '../../api/masterDataOrderApi.mjs'
import { savedTextFilterValue, withSavedTextFilter } from '../../utils/businessFilterPresentation.mjs'
import { customerOption } from '../../utils/referenceSelectOptions.mjs'
import { SelectFilter } from '../business-list/BusinessListLayout.jsx'

export default function SalesOrderSummaryPartyFilters({ filters, update, refreshRevision }) {
  const [options, setOptions] = useState({ customers: [], owners: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listSalesOrderSummaryFilterOptions({ signal: controller.signal })
      .then(({ customers, sales_owners }) => {
        if (controller.signal.aborted) return
        setOptions({
          customers: customers.map((customer) => {
            const option = customerOption(customer)
            return { ...option, searchText: [option.label, ...customer.previous_names].join(' ').toLowerCase() }
          }),
          owners: sales_owners.map((name) => ({ label: name, value: name })),
        })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(getActionErrorMessage(cause, '读取客户和跟单业务人员'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [refreshRevision, retry])

  return (
    <>
      <SelectFilter
        label="客户"
        placeholder="请选择客户"
        showSearch
        loading={loading}
        options={withSavedTextFilter(options.customers, filters.customer)}
        filterOption={(input, option) => (option.searchText || option.label.toLowerCase()).includes(input.trim().toLowerCase())}
        value={filters.customer_id || (filters.customer ? savedTextFilterValue : '')}
        onChange={(id) => update({ customer_id: id, customer: '' })}
      />
      <SelectFilter
        label="跟单业务人员"
        placeholder="请选择跟单业务人员"
        showSearch
        loading={loading}
        options={withSavedTextFilter(options.owners, filters.sales_owner)}
        value={filters.sales_owner_name || (filters.sales_owner ? savedTextFilterValue : '')}
        onChange={(name) => update({ owner_name: name, owner: '' })}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>}
        />
      )}
    </>
  )
}
