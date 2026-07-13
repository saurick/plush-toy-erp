import { mobileRoleDefinitions } from './appRegistry.mjs'
import { businessNavigationSections } from './businessModules.mjs'
import {
  applyCustomerMenuConfig,
  getActiveCustomerMenuConfig,
} from './customerMenuConfig.mjs'

export const STATUS_LABELS = {
  source_grounded: '已核对来源',
  seeded: '已配置入口',
  deferred: '暂未开放',
}

export const STATUS_STYLES = {
  source_grounded:
    'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]',
  seeded:
    'border-sky-200 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]',
  deferred:
    'border-slate-200 bg-slate-50 text-slate-600 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]',
}

export const roleWorkbenches = mobileRoleDefinitions.map((role) => ({
  key: role.roleKey,
  title: role.title,
  label: role.label,
  path: `/m/${role.roleKey}/tasks`,
}))

const roleWorkbenchMap = new Map(
  roleWorkbenches.map((role) => [role.key, role])
)

export function getRoleWorkbench(roleKey) {
  return roleWorkbenchMap.get(roleKey) || null
}

const navItemRegistry = {
  'global-dashboard': {
    key: 'global-dashboard',
    label: '工作台',
    path: '/erp/dashboard',
    shortLabel: '工作台',
    description: '聚合今日待办、阻塞交接、当前处理和业务状态摘要。',
  },
  'task-board': {
    key: 'task-board',
    label: '任务看板',
    path: '/erp/task-board',
    shortLabel: '任务',
    description: '按协同任务状态看待处理、处理中、阻塞、退回和超时任务。',
  },
  'business-dashboard': {
    key: 'business-dashboard',
    label: '业务看板',
    path: '/erp/business-dashboard',
    shortLabel: '业务',
    description: '按业务记录、部门待处理和风险预警看整体运行状态。',
  },
  'print-center': {
    key: 'print-center',
    label: '模板打印中心',
    path: '/erp/print-center',
    shortLabel: '打印',
    description: '统一查看合同、物料明细、色卡和作业指导书等固定打印模板。',
  },
  'exception-flow': {
    key: 'exception-flow',
    label: '异常 / 阻塞闭环',
    path: '/erp/operations/exceptions',
    shortLabel: '异常',
    description: '集中查看阻塞、催办、处理、验证和关闭的协同任务。',
  },
  'permission-center': {
    key: 'permission-center',
    label: '权限管理',
    path: '/erp/system/permissions',
    shortLabel: '权限',
    description: '集中管理管理员账号、角色、权限码和启用状态。',
  },
  'system-audit-logs': {
    key: 'system-audit-logs',
    label: '审计日志',
    path: '/erp/system/audit-logs',
    shortLabel: '审计',
    description: '只读查看系统管理操作记录。',
  },
}

export const navigationItemRegistry = navItemRegistry

const productCoreDashboardItem = {
  ...navItemRegistry['global-dashboard'],
  label: '产品核心总览',
  shortLabel: '核心',
  description: '审阅产品核心能力、运行边界、控制面和客户配置进入条件。',
}

function getDefaultNavigationSections() {
  return [
    {
      title: '看板中心',
      items: [
        navItemRegistry['global-dashboard'],
        navItemRegistry['task-board'],
        navItemRegistry['business-dashboard'],
      ],
    },
    ...businessNavigationSections,
    {
      title: '运营工具',
      items: [
        navItemRegistry['print-center'],
        navItemRegistry['exception-flow'],
      ],
    },
    {
      title: '系统管理',
      items: [
        navItemRegistry['permission-center'],
        navItemRegistry['system-audit-logs'],
      ],
    },
  ]
}

export function getProductCoreNavigationSections() {
  return [
    {
      title: '产品核心',
      items: [productCoreDashboardItem, navItemRegistry['print-center']],
    },
    {
      title: '控制面',
      items: [
        navItemRegistry['permission-center'],
        navItemRegistry['system-audit-logs'],
      ],
    },
  ]
}

export function getNavigationSections(
  customerMenuConfig = getActiveCustomerMenuConfig()
) {
  return applyCustomerMenuConfig(
    getDefaultNavigationSections(),
    customerMenuConfig
  )
}

export const navigationSections = getNavigationSections()
