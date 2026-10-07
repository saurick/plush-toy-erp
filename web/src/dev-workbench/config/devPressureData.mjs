// Shared by the DEV controls and isolated QA runners; these are synthetic
// regression sizes, not forecasts of a customer's annual volume.
export const PRESSURE_DATA_SCALES = Object.freeze({
  baseline: Object.freeze({ label: '基础', historyOrders: 20, workflowTasks: 5000, productionFacts: 2000, financeFacts: 2000, attachments: 1000 }),
  growth: Object.freeze({ label: '增长', historyOrders: 100, workflowTasks: 15000, productionFacts: 6000, financeFacts: 6000, attachments: 1000 }),
  volume: Object.freeze({ label: '高量', historyOrders: 500, workflowTasks: 50000, productionFacts: 20000, financeFacts: 20000, attachments: 1000 }),
})
export const PRESSURE_HISTORY_STATES = Object.freeze(['PREVIEW', 'SUBMITTED', 'BOSS_APPROVED', 'APPROVED', 'APPROVED'])
export function pressureDataScale(key) {
  if (!Object.hasOwn(PRESSURE_DATA_SCALES, key)) throw new Error('pressure data scale is invalid')
  return PRESSURE_DATA_SCALES[key]
}
