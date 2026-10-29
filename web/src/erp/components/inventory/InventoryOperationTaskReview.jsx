import React, { useEffect, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import { getInventoryOperation } from '../../api/inventoryApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import InventoryOperationDetails from './InventoryOperationDetails.jsx'

export default function InventoryOperationTaskReview({ task, onReady }) {
  const id = task?.source_type === 'inventory_operation' ? Number(task.source_id) : 0
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!id) { onReady?.(id); return undefined }
    const controller = new AbortController()
    setResult(null); setError(''); onReady?.(0)
    getInventoryOperation({ id }, { signal: controller.signal }).then((operation) => {
      if (controller.signal.aborted) return
      if (Number(operation?.id) !== id || !Array.isArray(operation?.items) || !operation.items.length) {
        throw new Error('库存作业明细不完整，请重新读取')
      }
      setResult(operation); onReady?.(id)
    }).catch((err) => {
      if (!controller.signal.aborted) setError(getActionErrorMessage(err, '读取盘点与调整明细'))
    })
    return () => controller.abort()
  }, [id, revision, onReady])
  if (!id) return null
  if (error) return <Alert type="error" message={error} action={<Button onClick={() => setRevision((value) => value + 1)}>重新读取</Button>} />
  if (!result || Number(result.id) !== id) return <Spin tip="正在读取库存作业明细"><div style={{ minHeight: 80 }} /></Spin>
  return <InventoryOperationDetails operation={result} />
}
