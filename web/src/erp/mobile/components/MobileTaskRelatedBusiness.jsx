import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Select, Spin } from 'antd'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getSalesOrder, listAllSalesOrderItems } from '../../api/masterDataOrderApi.mjs'
import { getPurchaseReceipt } from '../../api/purchaseApi.mjs'
import { listAllProductionFacts } from '../../api/operationalFactApi.mjs'
import { mobileTaskBusinessPath } from '../utils/mobileTaskBusiness.mjs'
import { workflowTaskNavigationState } from '../../utils/workflowTaskNavigation.mjs'

export default function MobileTaskRelatedBusiness({ kind }) {
  const context = useOutletContext()
  const navigate = useNavigate()
  const location = useLocation()
  const { roleKey } = useParams()
  const { task } = context.mobileTaskBusiness
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [lineID, setLineID] = useState(null)
  const pageUIState = useMemo(() => ({ generation: `${retry}:${lineID || ''}`, values: new Map() }), [retry, lineID])
  useEffect(() => {
    const controller = new AbortController()
    setSource(null)
    setError('')
    setLineID(null)
    const read = async () => {
      if (task.source_type === 'sales_order' && ['production_plan', 'shipment'].includes(kind)) {
        const record = await getSalesOrder({ id: task.source_id }, { signal: controller.signal })
        if (record?.id !== task.source_id || record.lifecycle_status !== 'active') throw new Error('当前销售订单尚未生效')
        const result = await listAllSalesOrderItems({ sales_order_id: record.id, expected_version: record.version }, { signal: controller.signal })
        const items = result.sales_order_items
        if (!items?.length || items.some((item) => item.sales_order_id !== record.id)) throw new Error('销售订单来源明细不完整')
        return { record, items }
      }
      if (task.source_type === 'purchase_receipt' && kind === 'inventory') {
        const record = await getPurchaseReceipt({ id: task.source_id }, { signal: controller.signal })
        if (record?.id !== task.source_id || record.status !== 'POSTED' || !record.items?.length) throw new Error('请先完成来源材料入库')
        const items = record.items.filter((item) => item.posted && item.lot_id && item.warehouse_id)
        if (!items.length) throw new Error('当前收货还没有可核对的已入库批次')
        return { record, items }
      }
      if (task.source_type === 'production_fact' && kind === 'inventory') {
        const result = await listAllProductionFacts({ keyword: task.source_no }, { signal: controller.signal })
        const records = result.production_facts.filter((row) => row.id === task.source_id)
        if (records.length !== 1 || records[0].status !== 'POSTED' || !records[0].lot_id || !records[0].warehouse_id) throw new Error('请先完成来源成品入库')
        return { record: records[0], items: [records[0]] }
      }
      throw new Error('当前任务不支持这项关联业务')
    }
    read().then((result) => {
      if (controller.signal.aborted) return
      setSource(result)
      if (result.items.length === 1) setLineID(result.items[0].id)
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(getActionErrorMessage(failure, '读取当前任务关联业务'))
    })
    return () => controller.abort()
  }, [kind, task.source_type, task.source_id, task.source_no, retry])
  const selected = source?.items.find((item) => item.id === lineID)
  const ready = source && (kind !== 'inventory' || selected)
  const childContext = useMemo(() => ({
    ...context,
    pageUIState,
    mobileTaskCommand: ready ? { kind, ...source, selected } : null,
  }), [context, pageUIState, ready, kind, source, selected])
  const close = async () => {
    if (!(await context.mobileTaskBusiness.confirmLeave())) return
    const to = mobileTaskBusinessPath(task, roleKey)
    navigate(to, { state: workflowTaskNavigationState(location.state, context.workflowTaskNavigation, to) })
  }
  return (
    <section className="mobile-task-related-business" data-testid="mobile-task-related-business">
      <Button onClick={close}>返回来源单据</Button>
      {error ? <Alert type="warning" showIcon message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : !source ? <Spin /> : (
        <>
          <p>来源单据：{source.record.order_no || source.record.receipt_no || source.record.fact_no}</p>
          {kind === 'inventory' ? (
            <label>核对本次入库批次<Select aria-label="核对本次入库批次" value={lineID} options={source.items.map((item) => ({ value: item.id, label: item.lot_no || item.material_name_snapshot || `收货第 ${item.line_no} 行` }))} onChange={async (id) => { if (await context.mobileTaskBusiness.confirmLeave()) setLineID(id) }} /></label>
          ) : null}
          {ready ? <Outlet key={`${kind}:${lineID || ''}`} context={childContext} /> : null}
        </>
      )}
    </section>
  )
}
