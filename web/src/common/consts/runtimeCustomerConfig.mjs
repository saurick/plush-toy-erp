export function readRuntimeCustomerConfig() {
  if (typeof window === 'undefined') {
    return null
  }
  const runtimeConfig = window.__PLUSH_ERP_CUSTOMER_CONFIG__
  return runtimeConfig && typeof runtimeConfig === 'object'
    ? runtimeConfig
    : null
}
