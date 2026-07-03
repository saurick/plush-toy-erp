const ERP_APP_DEFINITIONS = {
  desktop: {
    id: 'desktop',
    kind: 'desktop',
    title: '毛绒 ERP 桌面后台',
    shortTitle: '桌面后台',
    roleKey: null,
    port: 5175,
    command: 'pnpm start',
    description:
      '桌面后台保持一个入口，统一承载看板、业务页面、打印中心、权限管理和 /m/<role>/tasks 岗位任务端。',
  },
}

export const mobileRoleDefinitions = Object.freeze([
  {
    roleKey: 'boss',
    title: '毛绒 ERP 老板岗位任务端',
    shortTitle: '老板岗位任务端',
    label: '老板',
    description:
      '老板岗位任务端通过 /m/boss/tasks 进入，聚焦交期风险、异常、待结算和本周重点，不做复杂录入。',
  },
  {
    roleKey: 'sales',
    title: '毛绒 ERP 业务岗位任务端',
    shortTitle: '业务岗位任务端',
    label: '业务',
    description:
      '业务岗位任务端通过 /m/sales/tasks 进入，聚焦客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警。',
  },
  {
    roleKey: 'purchase',
    title: '毛绒 ERP 采购岗位任务端',
    shortTitle: '采购岗位任务端',
    label: '采购',
    description:
      '采购岗位任务端通过 /m/purchase/tasks 进入，聚焦缺料、到料、单价确认、回签和辅材包材确认。',
  },
  {
    roleKey: 'production',
    title: '毛绒 ERP 生产岗位任务端',
    shortTitle: '生产岗位任务端',
    label: '生产',
    description:
      '生产岗位任务端通过 /m/production/tasks 进入，聚焦今日排产、进度回填、延期原因、返工和异常；扩展硬件链路 deferred。',
  },
  {
    roleKey: 'warehouse',
    title: '毛绒 ERP 仓库岗位任务端',
    shortTitle: '仓库岗位任务端',
    label: '仓库',
    description:
      '仓库岗位任务端通过 /m/warehouse/tasks 进入，聚焦收货、备料、成品入库、待出货和异常件处理；扩展硬件链路 deferred。',
  },
  {
    roleKey: 'finance',
    title: '毛绒 ERP 财务岗位任务端',
    shortTitle: '财务岗位任务端',
    label: '财务',
    description:
      '财务岗位任务端通过 /m/finance/tasks 进入，聚焦待对账、待付款、异常费用和结算提醒。',
  },
  {
    roleKey: 'pmc',
    title: '毛绒 ERP PMC 岗位任务端',
    shortTitle: 'PMC 岗位任务端',
    label: 'PMC',
    description:
      'PMC 岗位任务端通过 /m/pmc/tasks 进入，聚焦齐套推进、排产推进、延期跟进、催办和异常分发。',
  },
  {
    roleKey: 'quality',
    title: '毛绒 ERP 品质岗位任务端',
    shortTitle: '品质岗位任务端',
    label: '品质',
    description:
      '品质岗位任务端通过 /m/quality/tasks 进入，聚焦 IQC、过程异常、返工复检和放行 / 退回反馈。',
  },
  {
    roleKey: 'engineering',
    title: '毛绒 ERP 工程岗位任务端',
    shortTitle: '工程岗位任务端',
    label: '工程',
    description:
      '工程岗位任务端通过 /m/engineering/tasks 进入，聚焦产品资料、工序、BOM 和工程资料补齐任务。',
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
