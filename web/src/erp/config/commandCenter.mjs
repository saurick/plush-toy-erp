export const commandCenterGroups = Object.freeze([
  {
    title: '看板中心',
    items: [
      {
        key: 'workbench',
        label: '工作台',
        shortLabel: '工作台',
        path: '/erp/dashboard',
        description: '集中查看今日待办、阻塞事项、业务概况和常用入口。',
      },
      {
        key: 'task-board',
        label: '任务看板',
        shortLabel: '任务',
        path: '/erp/task-board',
        description: '按办理状态、负责岗位、截止时间和相关业务查看任务。',
      },
      {
        key: 'business-board',
        label: '业务看板',
        shortLabel: '业务',
        path: '/erp/business-dashboard',
        description: '查看各类业务数量、办理情况和需要关注的事项。',
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
        description: '模板选择、纸面预览和打印窗口入口。',
      },
      {
        key: 'exception-flow',
        label: '异常处理',
        shortLabel: '异常',
        path: '/erp/operations/exceptions',
        description: '登记原因、分派负责人、跟进处理、确认恢复并关闭事项。',
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
