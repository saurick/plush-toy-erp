export const ERP_BRAND_MARK = '绒'
export const ERP_COMPANY_NAME = '毛绒玩具管理系统'
export const ERP_ADMIN_SYSTEM_NAME = '业务管理'

function normalizeBrandConfig(brandConfig = {}) {
  if (!brandConfig || typeof brandConfig !== 'object') {
    return {}
  }
  return {
    brandMark:
      typeof brandConfig.brandMark === 'string' && brandConfig.brandMark.trim()
        ? brandConfig.brandMark.trim()
        : undefined,
    companyName:
      typeof brandConfig.companyName === 'string' &&
      brandConfig.companyName.trim()
        ? brandConfig.companyName.trim()
        : undefined,
    systemName:
      typeof brandConfig.systemName === 'string' &&
      brandConfig.systemName.trim()
        ? brandConfig.systemName.trim()
        : undefined,
    faviconHref:
      typeof brandConfig.faviconHref === 'string' &&
      brandConfig.faviconHref.trim()
        ? brandConfig.faviconHref.trim()
        : undefined,
  }
}

function normalizeCustomerKey(runtimeConfig = {}) {
  return typeof runtimeConfig?.customerKey === 'string' &&
    runtimeConfig.customerKey.trim()
    ? runtimeConfig.customerKey.trim()
    : undefined
}

function readRuntimeCustomerConfig() {
  if (typeof window === 'undefined') {
    return null
  }
  const runtimeConfig = window.__PLUSH_ERP_CUSTOMER_CONFIG__
  return runtimeConfig && typeof runtimeConfig === 'object'
    ? runtimeConfig
    : null
}

export function getActiveERPBrand() {
  const runtimeConfig = readRuntimeCustomerConfig()
  const runtimeBrand = normalizeBrandConfig(runtimeConfig?.brand)
  return {
    customerKey: normalizeCustomerKey(runtimeConfig),
    brandMark: runtimeBrand.brandMark || ERP_BRAND_MARK,
    companyName: runtimeBrand.companyName || ERP_COMPANY_NAME,
    systemName: runtimeBrand.systemName || ERP_ADMIN_SYSTEM_NAME,
    faviconHref: runtimeBrand.faviconHref,
  }
}
