import { createWorkflowSourceTaskFixture } from './workflowSourceTaskFixtures.mjs'
import { createShipmentFinanceApprovalTaskFixture } from './shipmentApprovalFixtures.mjs'

export const workflowModuleSelectionDefinitions = [
  {
    key: 'production-scheduling',
    path: '/erp/production/scheduling',
    title: '排产确认',
    role: 'pmc',
    prefix: 'MO-SELECT',
    taskBase: 12000,
  },
  {
    key: 'shipping-release',
    path: '/erp/warehouse/shipping-release',
    title: '出货放行',
    role: 'finance',
    prefix: 'SHIP-SELECT',
    taskBase: 13000,
  },
]

export function createWorkflowModuleSelectionFixtures() {
  return workflowModuleSelectionDefinitions.flatMap((definition) =>
    Array.from({ length: 12 }, (_, index) => {
      const sourceID = 700 + index
      const taskID = definition.taskBase + index + 1
      const sourceNo = `${definition.prefix}-${String(index + 1).padStart(2, '0')}`
      const taskName =
        index === 0
          ? `${definition.title}：海盐企鹅礼盒（加长规格、多语言包装说明与追加批次，核对后按岗位办理）`
          : `${definition.title}验证记录 ${index + 1}`
      const task =
        definition.key === 'production-scheduling'
          ? createWorkflowSourceTaskFixture({
              taskGroup: 'production_scheduling',
              sourceID,
              taskID,
              sourceNo,
              taskName,
            })
          : createShipmentFinanceApprovalTaskFixture({
              taskID,
              sourceID,
              sourceNo,
              taskName,
              processInstanceID: taskID + 10000,
              processNodeInstanceID: taskID + 20000,
            })
      return {
        ...task,
        task_status_key:
          ['ready', 'blocked', 'done', 'rejected'][index] || 'ready',
        blocked_reason: index === 1 ? '需要责任岗位核对补充资料后继续办理' : '',
      }
    })
  )
}
