import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'

export const ERP_BRAND_MARK = '绒'
export const ERP_COMPANY_NAME = '毛绒玩具 ERP'
export const ERP_ADMIN_SYSTEM_NAME = '毛绒 ERP 管理后台'

const bundledCustomerBrandConfigs = Object.freeze({
  yoyoosun: yoyoosunMenuConfig?.brand,
})

function normalizeCustomerKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

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
  }
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

function readRuntimeCustomerKey() {
  if (typeof window !== 'undefined') {
    const windowKey = normalizeCustomerKey(window.__PLUSH_ERP_CUSTOMER_KEY__)
    if (windowKey) {
      return windowKey
    }
  }
  return normalizeCustomerKey(import.meta.env?.VITE_ERP_CUSTOMER_KEY)
}

export function getActiveERPBrand() {
  const runtimeConfig = readRuntimeCustomerConfig()
  const runtimeBrand = normalizeBrandConfig(runtimeConfig?.brand)
  const customerKey =
    normalizeCustomerKey(runtimeConfig?.customerKey) || readRuntimeCustomerKey()
  const bundledBrand = normalizeBrandConfig(
    bundledCustomerBrandConfigs[customerKey]
  )
  return {
    brandMark:
      runtimeBrand.brandMark || bundledBrand.brandMark || ERP_BRAND_MARK,
    companyName:
      runtimeBrand.companyName || bundledBrand.companyName || ERP_COMPANY_NAME,
    systemName:
      runtimeBrand.systemName ||
      bundledBrand.systemName ||
      ERP_ADMIN_SYSTEM_NAME,
  }
}
