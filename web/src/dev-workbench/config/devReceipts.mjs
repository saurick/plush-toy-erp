import { DEV_WORKBENCH_AREA_KEYS } from './devRoutes.mjs'

export const DEV_WORKBENCH_RECEIPT_API_PATH = '/__dev/api/receipts'

export const DEV_RECEIPT_GATES_BY_AREA = Object.freeze({
  [DEV_WORKBENCH_AREA_KEYS.quality]: Object.freeze([
    'fast',
    'full',
    'strict',
    'browser',
    'collaboration-e2e',
    'stability',
  ]),
  [DEV_WORKBENCH_AREA_KEYS.delivery]: Object.freeze([
    'strict',
    'release-rehearsal',
    'target-release',
  ]),
})

export const DEV_RECEIPT_STATUS_PRESENTATION = Object.freeze({
  passed: Object.freeze({ label: '通过', color: 'success' }),
  failed: Object.freeze({ label: '失败', color: 'error' }),
  blocked: Object.freeze({ label: '阻塞', color: 'warning' }),
  skipped: Object.freeze({ label: '跳过', color: 'default' }),
})

export function filterDevReceiptsForArea(receipts = [], areaKey = '') {
  const allowedGates = new Set(DEV_RECEIPT_GATES_BY_AREA[areaKey] || [])
  return (Array.isArray(receipts) ? receipts : [])
    .filter(
      (item) =>
        allowedGates.has(item?.receipt?.gate) &&
        ['current', 'historical'].includes(item?.freshness)
    )
    .sort((left, right) => {
      const freshnessOrder =
        Number(right.freshness === 'current') -
        Number(left.freshness === 'current')
      if (freshnessOrder !== 0) return freshnessOrder
      return (
        Date.parse(right.receipt.finishedAt || 0) -
        Date.parse(left.receipt.finishedAt || 0)
      )
    })
}

export function summarizeDevReceiptEvidence(payload, areaKey) {
  const receipts = filterDevReceiptsForArea(payload?.receipts, areaKey)
  const current = receipts.filter((item) => item.freshness === 'current')
  const currentPassed = current.filter(
    (item) => item.receipt.status === 'passed'
  )
  const blockers = current.filter(
    (item) => item.receipt.status !== 'passed'
  )
  return Object.freeze({
    blockers,
    current,
    currentPassed,
    historical: receipts.filter((item) => item.freshness === 'historical'),
    receipts,
  })
}
