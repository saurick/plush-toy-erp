const ERP_APP_DEFINITIONS = {
  desktop: {
    id: 'desktop',
    kind: 'desktop',
    title: '毛绒 ERP 桌面后台',
    shortTitle: '桌面后台',
    roleKey: null,
    port: 5175,
    command: 'pnpm start:desktop',
    description:
      '桌面后台保持一个入口，统一承载流程、真源、打印和帮助中心；角色差异通过各自移动端端口访问。',
  },
  'mobile-boss': {
    id: 'mobile-boss',
    kind: 'mobile',
    title: '毛绒 ERP 老板移动端',
    shortTitle: '老板移动端',
    roleKey: 'boss',
    port: 5186,
    command: 'pnpm start:mobile:boss',
    description:
      '老板移动端独立入口，聚焦交期风险、异常、待结算和本周重点，不做复杂录入。',
  },
  'mobile-business': {
    id: 'mobile-business',
    kind: 'mobile',
    title: '毛绒 ERP 业务移动端',
    shortTitle: '业务移动端',
    roleKey: 'business',
    port: 5187,
    command: 'pnpm start:mobile:business',
    description:
      '业务移动端独立入口，聚焦客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警。',
  },
  'mobile-purchasing': {
    id: 'mobile-purchasing',
    kind: 'mobile',
    title: '毛绒 ERP 采购移动端',
    shortTitle: '采购移动端',
    roleKey: 'purchasing',
    port: 5188,
    command: 'pnpm start:mobile:purchasing',
    description:
      '采购移动端独立入口，聚焦缺料、到料、单价确认、回签和辅材包材确认。',
  },
  'mobile-production': {
    id: 'mobile-production',
    kind: 'mobile',
    title: '毛绒 ERP 生产移动端',
    shortTitle: '生产移动端',
    roleKey: 'production',
    port: 5189,
    command: 'pnpm start:mobile:production',
    description:
      '生产移动端独立入口，聚焦今日排产、进度回填、延期原因、返工和异常；扩展硬件链路 deferred。',
  },
  'mobile-warehouse': {
    id: 'mobile-warehouse',
    kind: 'mobile',
    title: '毛绒 ERP 仓库移动端',
    shortTitle: '仓库移动端',
    roleKey: 'warehouse',
    port: 5190,
    command: 'pnpm start:mobile:warehouse',
    description:
      '仓库移动端独立入口，聚焦收货、备料、成品入库、待出货和异常件处理；扩展硬件链路 deferred。',
  },
  'mobile-finance': {
    id: 'mobile-finance',
    kind: 'mobile',
    title: '毛绒 ERP 财务移动端',
    shortTitle: '财务移动端',
    roleKey: 'finance',
    port: 5191,
    command: 'pnpm start:mobile:finance',
    description: '财务移动端独立入口，聚焦待对账、待付款、异常费用和结算提醒。',
  },
  'mobile-pmc': {
    id: 'mobile-pmc',
    kind: 'mobile',
    title: '毛绒 ERP PMC 移动端',
    shortTitle: 'PMC 移动端',
    roleKey: 'pmc',
    port: 5192,
    command: 'pnpm start:mobile:pmc',
    description:
      'PMC 移动端独立入口，聚焦齐套推进、排产推进、延期跟进、催办和异常分发。',
  },
  'mobile-quality': {
    id: 'mobile-quality',
    kind: 'mobile',
    title: '毛绒 ERP 品质移动端',
    shortTitle: '品质移动端',
    roleKey: 'quality',
    port: 5193,
    command: 'pnpm start:mobile:quality',
    description:
      '品质移动端独立入口，聚焦 IQC、过程异常、返工复检和放行 / 退回反馈。',
  },
}

export const DEFAULT_ERP_APP_ID = 'desktop'

export const appDefinitions = Object.values(ERP_APP_DEFINITIONS)

export function getAppDefinition(appId = DEFAULT_ERP_APP_ID) {
  return ERP_APP_DEFINITIONS[appId] || ERP_APP_DEFINITIONS[DEFAULT_ERP_APP_ID]
}

export function resolveRuntimeAppId() {
  if (import.meta.env.VITE_ERP_APP_ID) {
    return import.meta.env.VITE_ERP_APP_ID
  }
  return DEFAULT_ERP_APP_ID
}

export function getRuntimeAppDefinition() {
  return getAppDefinition(resolveRuntimeAppId())
}
