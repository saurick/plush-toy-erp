const ERP_APP_DEFINITIONS = {
  desktop: {
    id: 'desktop',
    kind: 'desktop',
    title: '业务管理',
    shortTitle: '电脑端',
    roleKey: null,
    command: 'pnpm start',
    description:
      '电脑端用于查看业务看板、办理日常业务、打印单据和管理账号权限；手机待办可用于随时查看和处理岗位任务。',
  },
}

export const mobileRoleDefinitions = Object.freeze([
  {
    roleKey: 'boss',
    title: '老板手机待办',
    shortTitle: '老板手机待办',
    label: '老板',
    description: '查看交期风险、异常、待结算和本周重点事项。',
  },
  {
    roleKey: 'sales',
    title: '业务手机待办',
    shortTitle: '业务手机待办',
    label: '业务',
    description: '跟进客户、款式、待补资料、催料、合同和交期提醒。',
  },
  {
    roleKey: 'purchase',
    title: '采购手机待办',
    shortTitle: '采购手机待办',
    label: '采购',
    description: '跟进缺料、到料、单价确认、回签和辅材包材确认。',
  },
  {
    roleKey: 'production',
    title: '生产手机待办',
    shortTitle: '生产手机待办',
    label: '生产',
    description: '跟进今日排产、生产进度、延期原因、返工和异常事项。',
  },
  {
    roleKey: 'warehouse',
    title: '仓库手机待办',
    shortTitle: '仓库手机待办',
    label: '仓库',
    description: '跟进收货、备料、成品入库、待出货和异常件处理。',
  },
  {
    roleKey: 'finance',
    title: '财务手机待办',
    shortTitle: '财务手机待办',
    label: '财务',
    description: '跟进待对账、待付款、异常费用和结算提醒。',
  },
  {
    roleKey: 'pmc',
    title: 'PMC 手机待办',
    shortTitle: 'PMC 手机待办',
    label: 'PMC',
    description: '跟进齐套、排产、延期、催办和异常分派。',
  },
  {
    roleKey: 'quality',
    title: '品质手机待办',
    shortTitle: '品质手机待办',
    label: '品质',
    description: '跟进来料检验、过程异常、返工复检和放行或退回事项。',
  },
  {
    roleKey: 'engineering',
    title: '工程手机待办',
    shortTitle: '工程手机待办',
    label: '工程',
    description: '跟进产品资料、加工环节、BOM 和待补工程资料。',
  },
])

export const DEFAULT_ERP_APP_ID = 'desktop'

export function getAppDefinition(appId = DEFAULT_ERP_APP_ID) {
  const app = ERP_APP_DEFINITIONS[appId]
  if (!app) {
    throw new Error(`Unknown ERP app id: ${appId}`)
  }
  return app
}

export function resolveRuntimeAppId() {
  return DEFAULT_ERP_APP_ID
}

export function getRuntimeAppDefinition() {
  return getAppDefinition(resolveRuntimeAppId())
}
