export const AUTH_SMS_MODE = Object.freeze({
  DISABLED: 'disabled',
  MOCK: 'mock',
  PROVIDER: 'provider',
})

export const DEFAULT_AUTH_CAPABILITIES = Object.freeze({
  smsLoginEnabled: false,
  smsLoginMode: AUTH_SMS_MODE.DISABLED,
  smsLoginMockDelivery: false,
  smsLoginDisabledReason: '短信登录未启用',
})

export function normalizeAuthCapabilities(data = {}) {
  const smsLogin =
    data?.sms_login && typeof data.sms_login === 'object' ? data.sms_login : {}
  const mode = String(smsLogin.mode || AUTH_SMS_MODE.DISABLED).trim()

  return {
    smsLoginEnabled: smsLogin.enabled === true,
    smsLoginMode: mode || AUTH_SMS_MODE.DISABLED,
    smsLoginMockDelivery: smsLogin.mock_delivery === true,
    smsLoginDisabledReason: String(smsLogin.disabled_reason || '').trim(),
  }
}

export async function fetchAuthCapabilities(authRpc, options = {}) {
  const result = await authRpc.call('capabilities', {}, options)
  return normalizeAuthCapabilities(result?.data)
}
