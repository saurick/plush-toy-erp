import {
  DEV_GOVERNANCE_ROUTE,
  DEV_UI_DESIGN_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
} from './devRoutes.mjs'

// 使用指南提供任务入口；完成状态以工具内的版本、回执和目标证据为准。
export const DEV_WORKBENCH_GUIDE = Object.freeze(
  [
    {
      value: '1',
      label: '明确改动',
      completion: '目标、范围、依据和完成标准明确。',
      action: '查看改动指南',
      route: DEV_GOVERNANCE_ROUTE,
    },
    {
      value: '2',
      label: '对照设计',
      completion: '默认页面、关键操作和返回路径都能在交互稿中说明清楚。',
      action: '打开交互设计',
      route: DEV_UI_DESIGN_ROUTE,
    },
    {
      value: '3',
      label: '验证改动',
      completion: '影响范围内的检查有结果、有来源；发布前再核对固定版本 CI。',
      action: '开始本轮验证',
      route: DEV_TESTING_ROUTE,
    },
    {
      value: '4',
      label: '准备交付',
      completion: '版本、目标、配置、迁移与恢复证据分别齐备；缺失条件先补齐。',
      action: '核对交付条件',
      route: DEV_DELIVERY_ROUTE,
    },
    {
      value: '5',
      label: '发布版本',
      completion: '具体计划已确认并留下操作回执，继续核对目标结果。',
      action: '进入版本发布',
      route: DEV_VERSION_CENTER_ROUTE,
    },
    {
      value: '6',
      label: '核对结果',
      completion: '回执、版本与目标一致，健康与业务入口分别读回，证据可追溯。',
      action: '查看操作回执',
      route: `${DEV_VERSION_CENTER_ROUTE}?view=history`,
    },
  ].map((item) => Object.freeze(item))
)

export const DEV_TOOL_USAGE = Object.freeze({
  'product-core': '确认能力范围',
  'permission-relationships': '核对岗位与权限',
  governance: '实现前查规则',
  'status-flows': '核对业务交接',
  docs: '查正式依据',
  'ui-design': '实现前走操作',
  testing: '验证当前改动',
  'quality-gates': '核对正式门禁',
  'business-usability': '检查页面说明',
  'data-preparation': '用例缺少数据时',
  'customer-config': '核对客户差异',
  'database-migration': '数据库结构变化时',
  'version-center': '发布、部署与读回',
  'drill-recovery': '演练或恢复时',
})
