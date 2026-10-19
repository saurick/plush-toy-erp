import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Spin } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { createRequestScopeAbortReason, RequestScopeOwner, RequestScopeCancellationCause } from '../../../common/utils/requestScopeCancellation.mjs'
import BusinessRowItemCards from '../../components/business-list/BusinessRowItemCards.jsx'

export default function MobileOutsourcingTaskActions({ record, load, getItemFields, refreshKey }) {
  const [state, setState] = useState({ items: [], loading: true, error: '' })
  const [retry, setRetry] = useState(0)
  const sourceID = record?.id
  const sourceVersion = record?.version
  const requestSequence = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    const generation = ++requestSequence.current
    const cancelRead = () => controller.abort(createRequestScopeAbortReason({
      owner: RequestScopeOwner.OUTSOURCING_TASK_ITEMS,
      cause: RequestScopeCancellationCause.DISPOSED,
      generation,
    }))
    if (!sourceID || !sourceVersion) {
      setState({ items: [], loading: false, error: '' })
      return cancelRead
    }
    setState({ items: [], loading: true, error: '' })
    load({ id: sourceID, version: sourceVersion }, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (!Array.isArray(result.items) || result.total !== result.items.length || result.items.some((item) => item.outsourcing_order_id !== sourceID)) throw new Error('任务办理明细不完整')
      setState({ items: result.items, loading: false, error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ items: [], loading: false, error: getActionErrorMessage(error, '读取委外任务办理明细') })
    })
    return cancelRead
  }, [sourceID, sourceVersion, load, retry, refreshKey])
  return (
    <section className="mobile-outsourcing-task-actions" data-testid="mobile-outsourcing-task-actions">
      {state.loading ? <Spin /> : state.error ? <Alert type="warning" showIcon message={state.error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : state.items.length ? (
        <BusinessRowItemCards record={record} items={state.items} getItemFields={(item, context) => getItemFields(item, context).filter((field) => field.taskSummary)} />
      ) : <Empty description="暂无可办理明细" />}
    </section>
  )
}
