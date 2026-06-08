import { appDefinitions } from './appRegistry.mjs'
import { businessNavigationSections } from './businessModules.mjs'
import {
  applyCustomerMenuConfig,
  getActiveCustomerMenuConfig,
} from './customerMenuConfig.mjs'

export const STATUS_LABELS = {
  source_grounded: '已按真源收口',
  seeded: '已落入口',
  deferred: '本轮 deferred',
}

export const STATUS_STYLES = {
  source_grounded:
    'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]',
  seeded:
    'border-sky-200 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]',
  deferred:
    'border-slate-200 bg-slate-50 text-slate-600 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]',
}

const MOBILE_ROLE_META = Object.freeze({
  boss: { title: '老板 / 管理层', label: '老板' },
  sales: { title: '业务', label: '业务' },
  purchase: { title: '采购', label: '采购' },
  production: { title: '生产经理', label: '生产' },
  warehouse: { title: '仓库', label: '仓库' },
  finance: { title: '财务', label: '财务' },
  pmc: { title: 'PMC', label: 'PMC' },
  quality: { title: '品质', label: '品质' },
})

export const roleWorkbenches = appDefinitions
  .filter((app) => app.kind === 'mobile' && app.roleKey)
  .map((app) => {
    const roleMeta = MOBILE_ROLE_META[app.roleKey] || {
      title: app.shortTitle,
      label: app.shortTitle,
    }

    return {
      key: app.roleKey,
      title: roleMeta.title,
      label: roleMeta.label,
      appId: app.id,
      port: app.port,
    }
  })

const roleWorkbenchMap = new Map(
  roleWorkbenches.map((role) => [role.key, role])
)

export function getRoleWorkbench(roleKey) {
  return roleWorkbenchMap.get(roleKey) || null
}

const navItemRegistry = {
  'global-dashboard': {
    key: 'global-dashboard',
    label: '任务看板',
    path: '/erp/dashboard',
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
    description: '统一查看辅料采购合同和加工合同的固定打印模板。',
  },
  'permission-center': {
    key: 'permission-center',
    label: '权限管理',
    path: '/erp/system/permissions',
    shortLabel: '权限',
    description: '集中管理管理员账号、角色、权限码和启用状态。',
  },
}

export const navigationItemRegistry = navItemRegistry

function getDefaultNavigationSections() {
  return [
    {
      title: '看板中心',
      items: [
        navItemRegistry['global-dashboard'],
        navItemRegistry['business-dashboard'],
      ],
    },
    ...businessNavigationSections,
    {
      title: '单据模板',
      items: [navItemRegistry['print-center']],
    },
    {
      title: '系统管理',
      items: [navItemRegistry['permission-center']],
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
