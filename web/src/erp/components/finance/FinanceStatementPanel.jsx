import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space } from 'antd'
import { getFinanceStatement } from '../../api/operationalFactApi.mjs'
import { listAllCustomers, listAllSuppliers } from '../../api/masterDataOrderApi.mjs'
import { BusinessDataTable, BusinessOperationPanel, SelectFilter } from '../business-list/BusinessListLayout.jsx'
import { DateRangeFilter } from '../business-list/BusinessDateInputs.jsx'
import { downloadBusinessListCSV } from '../business-list/BusinessListToolbarActions.jsx'
import { BUSINESS_CURRENCY_OPTIONS } from '../../utils/masterDataOrderView.mjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import { financeStatementKindLabel } from '../../utils/financePaymentFilters.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { partyOption } from './financePaymentPresentation.jsx'

const columns = [
  { title: '记账日期', dataIndex: 'date', width: 130 },
  { title: '业务类型', dataIndex: 'kind', width: 140, render: financeStatementKindLabel, exportValue: (row) => financeStatementKindLabel(row.kind) },
  { title: '业务单号', dataIndex: 'number', width: 230 },
  { title: '增减金额', dataIndex: 'amount', width: 150, align: 'right' },
  { title: '往来余额', dataIndex: 'balance', width: 150, align: 'right' },
]

export default function FinanceStatementPanel({ canReadReceivables, canReadPayables }) {
  const today = currentBusinessDate()
  const [filter, setFilter] = useState({ counterparty_type: canReadReceivables ? 'CUSTOMER' : 'SUPPLIER', currency: 'CNY', date_from: `${today.slice(0, 7)}-01`, date_to: today })
  const [parties, setParties] = useState({ CUSTOMER: [], SUPPLIER: [] })
  const [statement, setStatement] = useState(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const controller = useRef(null)
  const [exporting, setExporting] = useState(false)
  const statementPartyName = statement ? parties[statement.counterparty_type]?.find((item) => Number(item.id) === statement.counterparty_id)?.name || '已选往来方' : ''
  useEffect(() => {
    const abort = new AbortController()
    Promise.allSettled([
      canReadReceivables ? listAllCustomers({}, { signal: abort.signal }) : Promise.resolve({ customers: [] }),
      canReadPayables ? listAllSuppliers({}, { signal: abort.signal }) : Promise.resolve({ suppliers: [] }),
    ]).then(([customers, suppliers]) => {
      if (abort.signal.aborted) return
      setParties({ CUSTOMER: customers.status === 'fulfilled' ? customers.value.customers || [] : [], SUPPLIER: suppliers.status === 'fulfilled' ? suppliers.value.suppliers || [] : [] })
      const failed = [customers, suppliers].find((result) => result.status === 'rejected')
      if (failed) setError(getActionErrorMessage(failed.reason, '加载往来方'))
    })
    return () => { abort.abort(); controller.current?.abort(); request.current += 1 }
  }, [canReadReceivables, canReadPayables])
  const change = (patch) => {
    request.current += 1
    controller.current?.abort()
    setBusy(false)
    setFilter((current) => ({ ...current, ...patch }))
    setStatement(null)
    setPage(1)
    setError('')
  }
  const load = async (nextPage = 1, refresh = false) => {
    const revision = ++request.current
    controller.current?.abort()
    controller.current = new AbortController()
    setBusy(true); setError('')
    try {
      const result = await getFinanceStatement({ ...filter, ...(!refresh && statement ? { snapshot_at: statement.snapshot_at } : {}), limit: 20, offset: (nextPage - 1) * 20 }, { signal: controller.current.signal })
      if (revision !== request.current) return
      if (!result || !Array.isArray(result.entries)) throw new Error('对账结果不完整')
      setStatement(result); setPage(nextPage)
    } catch (err) { if (revision === request.current) { setStatement(null); setError(getActionErrorMessage(err, '查询期间对账')) } }
    finally { if (revision === request.current) setBusy(false) }
  }
  const exportRows = async () => {
    if (!statement || exporting) return
    const captured = statement
    const revision = request.current
    setExporting(true); setError('')
    try {
      const rows = []
      for (let offset = 0; offset < captured.total; offset += 200) {
        const result = await getFinanceStatement({ ...filter, snapshot_at: captured.snapshot_at, limit: 200, offset })
        if (revision !== request.current) return
        if (!result || !Array.isArray(result.entries) || result.total !== captured.total || result.entries.length === 0) throw new Error('对账明细发生变化，请重新查询后导出')
        rows.push(...result.entries)
      }
      const summary = [
        { date: `${captured.date_from} 至 ${captured.date_to}`, number: `${statementPartyName}（${captured.currency}）` },
        { date: captured.date_from, number: '期初余额', balance: captured.opening },
        ...rows,
        { date: captured.date_to, number: '本期增加', amount: captured.increase },
        { date: captured.date_to, number: '本期减少', amount: captured.decrease },
        { date: captured.date_to, number: '期末余额', balance: captured.closing },
      ]
      downloadBusinessListCSV({ filename: `期间对账-${captured.counterparty_type}-${captured.counterparty_id}-${captured.currency}-${captured.date_from}-${captured.date_to}.csv`, columns, rows: summary })
    } catch (err) { if (revision === request.current) setError(getActionErrorMessage(err, '导出期间对账')) }
    finally { setExporting(false) }
  }
  const options = [canReadReceivables && { value: 'CUSTOMER', label: '客户' }, canReadPayables && { value: 'SUPPLIER', label: '供应商' }].filter(Boolean)
  if (!options.length) return <Alert type="info" message="查看期间对账需要对应的应收或应付查看权限。" />
  return (
    <>
      <BusinessOperationPanel
        filters={(
          <>
            <SelectFilter aria-label="对账往来类型" allowClear={false /* 不可清空：查询须明确客户或供应商 */} value={filter.counterparty_type} options={options} onChange={(value) => change({ counterparty_type: value, counterparty_id: undefined })} />
            <SelectFilter aria-label="对账往来方" placeholder="选择往来方" showSearch optionFilterProp="label" value={filter.counterparty_id} options={parties[filter.counterparty_type].map((item) => partyOption(item, '往来方'))} onChange={(value) => change({ counterparty_id: value })} />
            <SelectFilter aria-label="对账币种" allowClear={false /* 不可清空：不同币种不能合并为一个余额 */} value={filter.currency} options={BUSINESS_CURRENCY_OPTIONS} onChange={(value) => change({ currency: value })} />
            <DateRangeFilter options={[{ value: 'posted', label: '记账日期' }]} value="posted" startValue={filter.date_from} endValue={filter.date_to} onStartChange={(value) => change({ date_from: value })} onEndChange={(value) => change({ date_to: value })} />
          </>
        )}
        primaryAction={<Button type="primary" loading={busy} disabled={!filter.counterparty_id || !filter.date_from || !filter.date_to || filter.date_from > filter.date_to} onClick={() => load(1, true)}>查询对账</Button>}
        actions={<Button disabled={!statement || busy} loading={exporting} onClick={exportRows}>导出对账单</Button>}
      />
      <p className="erp-business-inline-note">按中国日期、财务确认入账时间计算，含预收预付、退款和冲销。正数为应收或应付，负数为预收或预付净额。未录入的期初账款不在本表内。</p>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {statement ? <p className="erp-business-inline-note">{statementPartyName} · {statement.currency} · {statement.date_from} 至 {statement.date_to}</p> : null}
      {statement ? <Space wrap aria-label="期间对账汇总"><span>期初 {statement.opening}</span><span>本期增加 {statement.increase}</span><span>本期减少 {statement.decrease}</span><strong>期末 {statement.closing} {statement.currency}</strong></Space> : null}
      <BusinessDataTable rowKey="key" columns={columns} dataSource={statement?.entries || []} loading={busy} pagination={{ current: page, pageSize: 20, total: statement?.total || 0, showSizeChanger: false, onChange: (nextPage) => load(nextPage) }} emptyDescription={statement ? '本期无业务发生，余额见上方汇总' : '选择往来方和期间后查询'} scroll={{ x: 850 }} />
    </>
  )
}
