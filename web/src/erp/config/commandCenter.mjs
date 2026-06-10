export const commandCenterGroups = Object.freeze([
  {
    title: '看板中心',
    items: [
      {
        key: 'workbench',
        label: '后台首页 / 工作台',
        shortLabel: '工作台',
        path: '/erp/dashboard',
        description: '聚合今日待办、跨角色阻塞、业务摘要和常用入口。',
      },
      {
        key: 'task-board',
        label: '任务看板',
        shortLabel: '任务',
        path: '/erp/task-board',
        description: '按协同状态、角色、到期时间和来源模块查看任务。',
      },
      {
        key: 'business-board',
        label: '业务看板',
        shortLabel: '业务',
        path: '/erp/business-dashboard',
        description: '按模块查看业务记录、状态分布和运营预警。',
      },
    ],
  },
  {
    title: '运营工具',
    items: [
      {
        key: 'print-center',
        label: '模板打印中心',
        shortLabel: '打印',
        path: '/erp/print-center',
        description: '模板选择、字段映射、纸面预览和打印窗口入口。',
      },
      {
        key: 'exception-flow',
        label: '异常 / 阻塞闭环',
        shortLabel: '异常',
        path: '/erp/operations/exceptions',
        description: '阻塞登记、责任分派、处理跟进、验证和关闭归档。',
      },
    ],
  },
])

export const commandCenterViews = Object.freeze(
  commandCenterGroups.flatMap((group) => group.items)
)

export function getCommandCenterView(viewKey) {
  return commandCenterViews.find((item) => item.key === viewKey) || null
}
