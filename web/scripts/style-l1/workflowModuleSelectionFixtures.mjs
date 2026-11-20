import { DEFAULT_BUSINESS_PAGE_SIZE } from '../../src/erp/utils/businessPagination.mjs'
import { createWorkflowSourceTaskFixture } from './workflowSourceTaskFixtures.mjs'

export const workflowModuleSelectionDefinitions = [
  {
    key: 'production-scheduling',
    path: '/erp/production/scheduling',
    title: '排产确认',
    role: 'pmc',
    prefix: 'MO-SELECT',
    taskBase: 12000,
  },
]

export function createWorkflowModuleSelectionFixtures() {
  return workflowModuleSelectionDefinitions.flatMap((definition) =>
    Array.from({ length: DEFAULT_BUSINESS_PAGE_SIZE + 2 }, (_, index) => {
      const sourceID = 700 + index
      const taskID = definition.taskBase + index + 1
      const sourceNo = `${definition.prefix}-${String(index + 1).padStart(2, '0')}`
      const taskName =
        index === 0
          ? `${definition.title}：海盐企鹅礼盒（加长规格、多语言包装说明与追加批次，核对后按岗位办理）`
          : `${definition.title}验证记录 ${index + 1}`
      const task = createWorkflowSourceTaskFixture({
              taskGroup: 'production_scheduling',
              sourceID,
              taskID,
              sourceNo,
              taskName,
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
