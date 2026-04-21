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
      '桌面后台保持一个入口，通过角色工作台、菜单权限、首页配置和帮助中心区分老板、跟单、采购、生产、仓库和财务。',
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
  'mobile-merchandiser': {
    id: 'mobile-merchandiser',
    kind: 'mobile',
    title: '毛绒 ERP 跟单移动端',
    shortTitle: '跟单移动端',
    roleKey: 'merchandiser',
    port: 5187,
    command: 'pnpm start:mobile:merchandiser',
    description:
      '跟单移动端独立入口，聚焦客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警。',
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
      '生产移动端独立入口，聚焦今日排产、进度回填、延期原因、返工和异常；拍照扫码 deferred。',
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
      '仓库移动端独立入口，聚焦收货、备料、成品入库、待出货和异常件处理；扫码 deferred。',
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
