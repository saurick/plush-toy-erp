import { ShipmentFinanceReleaseStatus } from '../../common/consts/statuses.generated.mjs'
import { trackingURL } from './workflowTracking.mjs'

const APPROVAL_STATES = Object.freeze({
  [ShipmentFinanceReleaseStatus.PENDING]: { label: '待放行', color: 'gold' },
  [ShipmentFinanceReleaseStatus.APPROVED]: { label: '已放行', color: 'green' },
  [ShipmentFinanceReleaseStatus.REJECTED]: { label: '已退回', color: 'red' },
})

export function shipmentApprovalState(shipment = {}) {
  // PENDING 同时覆盖尚未提交和已提交的出货单，不能据此推断任务已开始。
  return APPROVAL_STATES[shipment?.finance_release_status] || { label: '待核对', color: 'default' }
}

export function shipmentApprovalPath(shipment) {
  if (!Number.isSafeInteger(shipment?.id) || shipment.id <= 0) return ''
  const processID = shipment.finance_release_process_instance_id
  const ref = Number.isSafeInteger(processID) && processID > 0
    ? { kind: 'process', id: processID }
    : null
  return trackingURL(ref, { type: 'shipment', id: shipment.id })
}
