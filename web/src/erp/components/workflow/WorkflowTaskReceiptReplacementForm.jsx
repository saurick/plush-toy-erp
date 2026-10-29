import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import PurchaseRejectionDispositionModal from '../quality-inspections/PurchaseRejectionDispositionModal.jsx'
import { getPurchaseRejectionDisposition } from '../../api/purchaseApi.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { resolveMobileTaskBusinessEntry } from '../../mobile/utils/mobileTaskBusiness.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

// Replacement counting edits the existing disposition. It does not require the
// purchasing capability to create a new rejection plan or open that full module.
export default function WorkflowTaskReceiptReplacementForm() {
  const { taskBusiness, adminProfile } = useBusinessPageContext()
  const { task } = taskBusiness
  const [state, setState] = useState(null)
  const [retry, setRetry] = useState(0)
  const scope = `${adminProfile.id}:${task.id}:${task.version}:${task.source_type}:${task.source_id}`
  const entry = resolveMobileTaskBusinessEntry(task)
  const inspectionID = Number(new URL(entry, 'https://erp.invalid').searchParams.get('quality_inspection_id'))
  useEffect(() => {
    const controller = new AbortController()
    setState({ scope, loading: true })
    getPurchaseRejectionDisposition({ id: task.source_id }, { signal: controller.signal }).then((record) => {
      if (controller.signal.aborted) return
      if (record?.id !== task.source_id || record.quality_inspection_id !== inspectionID || record.disposition_type !== 'REPLACE' || !Number.isSafeInteger(record.version)) throw new Error('本次补换记录与任务来源不一致')
      setState({ scope, record })
    }).catch((error) => { if (!controller.signal.aborted) setState({ scope, error: getActionErrorMessage(error, '读取本次补换到货') }) })
    return () => controller.abort()
  }, [scope, task.source_id, inspectionID, retry])
  const inspection = useMemo(() => ({ id: inspectionID }), [inspectionID])
  if (!state || state.scope !== scope || state.loading) return <Spin />
  if (state.error) return <Alert type="warning" message={state.error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} />
  const allowed = hasActionPermission(adminProfile, PermissionCode.PURCHASE_RETURN_READ)
  return <PurchaseRejectionDispositionModal
    open
    inspection={inspection}
    initialRecord={state.record}
    sourceAccess={{ allowed, reason: allowed ? '' : '当前账号不能读取本次补换记录' }}
    canPost={hasActionPermission(adminProfile, PermissionCode.PURCHASE_RETURN_POST)}
    canReceiveReplacement={hasActionPermission(adminProfile, PermissionCode.PURCHASE_RECEIPT_CREATE)}
    onClose={() => taskBusiness.navigate(-1)}
  />
}
