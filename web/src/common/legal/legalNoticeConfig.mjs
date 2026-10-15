import { ERP_COMPANY_NAME } from '../consts/brand.js'

export const LEGAL_NOTICE_CONTENT_REVISION = '2026-08-11.1'
export const DEFAULT_LEGAL_NOTICE_VERSION = '2026-08-11.1'
export const DEFAULT_LEGAL_NOTICE_EFFECTIVE_DATE = '2026-08-11'

const DEFAULT_CONTACT_CHANNEL = '请联系本单位系统管理员或人事、信息化负责人。'
const DEFAULT_STORAGE_LOCATION = '由本单位指定的中国境内私有化部署环境。'
const DEFAULT_CROSS_BORDER_RULE =
  '默认不向中华人民共和国境外提供个人信息；确需跨境时，由本单位另行履行评估、告知和必要授权程序。'
const DEFAULT_ACCOUNT_RETENTION =
  '账号有效期间；账号注销后，除履行法定义务、审计或争议处理所必需的关联记录外，删除或匿名化。'
const DEFAULT_SECURITY_LOG_RETENTION =
  '网络运行与安全日志自记录之日起不少于六个月；超过法定、安全和争议处理所需期限后删除或匿名化。'
const DEFAULT_AUDIT_RETENTION =
  '业务与审计记录保存至对应业务目的、法定义务或争议处理期限届满；随后删除或匿名化。'

function normalizeText(value, fallback, maxLength = 512) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || fallback || '').slice(0, maxLength)
}

function normalizeHTTPSURL(value) {
  const normalized = normalizeText(value, '', 2048)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    return parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function normalizeProcessor(value) {
  if (!value || typeof value !== 'object') return null
  const name = normalizeText(value.name, '', 128)
  const purpose = normalizeText(value.purpose, '', 256)
  const dataCategories = normalizeText(value.dataCategories, '', 256)
  const condition = normalizeText(value.condition, '', 256)
  if (!name || !purpose || !dataCategories || !condition) return null
  return {
    name,
    purpose,
    dataCategories,
    condition,
    privacyURL: normalizeHTTPSURL(value.privacyURL),
  }
}

function readRuntimeCustomerConfig(runtimeWindow) {
  const runtimeConfig = runtimeWindow?.__PLUSH_ERP_CUSTOMER_CONFIG__
  return runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {}
}

export function getLegalNoticeBundle(
  runtimeWindow = typeof window === 'undefined' ? undefined : window
) {
  const runtimeConfig = readRuntimeCustomerConfig(runtimeWindow)
  const legalNotice =
    runtimeConfig.legalNotice && typeof runtimeConfig.legalNotice === 'object'
      ? runtimeConfig.legalNotice
      : {}
  const runtimeCompanyName = normalizeText(
    runtimeConfig.brand?.companyName,
    ERP_COMPANY_NAME,
    160
  )
  const processors = Array.isArray(legalNotice.processors)
    ? legalNotice.processors
        .slice(0, 20)
        .map(normalizeProcessor)
        .filter(Boolean)
    : []

  return {
    contentRevision: LEGAL_NOTICE_CONTENT_REVISION,
    noticeVersion: normalizeText(
      legalNotice.noticeVersion,
      DEFAULT_LEGAL_NOTICE_VERSION,
      64
    ),
    effectiveDate: normalizeText(
      legalNotice.effectiveDate,
      DEFAULT_LEGAL_NOTICE_EFFECTIVE_DATE,
      32
    ),
    controllerName: normalizeText(
      legalNotice.controllerName,
      runtimeCompanyName,
      160
    ),
    contactChannel: normalizeText(
      legalNotice.contactChannel,
      DEFAULT_CONTACT_CHANNEL
    ),
    storageLocation: normalizeText(
      legalNotice.storageLocation,
      DEFAULT_STORAGE_LOCATION
    ),
    crossBorderRule: normalizeText(
      legalNotice.crossBorderRule,
      DEFAULT_CROSS_BORDER_RULE
    ),
    accountRetention: normalizeText(
      legalNotice.accountRetention,
      DEFAULT_ACCOUNT_RETENTION
    ),
    securityLogRetention: normalizeText(
      legalNotice.securityLogRetention,
      DEFAULT_SECURITY_LOG_RETENTION
    ),
    auditRetention: normalizeText(
      legalNotice.auditRetention,
      DEFAULT_AUDIT_RETENTION
    ),
    processors,
  }
}

export function stableSerialize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

function toUnsigned32(value) {
  const normalized = value % 4_294_967_296
  return normalized < 0 ? normalized + 4_294_967_296 : normalized
}

function hash32(value, seed, multiplier) {
  let hash = toUnsigned32(seed)
  for (let index = 0; index < value.length; index += 1) {
    hash = toUnsigned32(Math.imul(hash, multiplier) + value.charCodeAt(index))
  }
  return hash.toString(16).padStart(8, '0')
}

function contentFingerprint64(value) {
  return `${hash32(value, 2_166_136_261, 16_777_619)}${hash32(
    value,
    3_735_928_559,
    2_246_822_519
  )}`
}

export function getLegalNoticeIdentity(bundle = getLegalNoticeBundle()) {
  const normalizedBundle = getLegalNoticeBundle({
    __PLUSH_ERP_CUSTOMER_CONFIG__: {
      brand: { companyName: bundle.controllerName },
      legalNotice: {
        noticeVersion: bundle.noticeVersion,
        effectiveDate: bundle.effectiveDate,
        controllerName: bundle.controllerName,
        contactChannel: bundle.contactChannel,
        storageLocation: bundle.storageLocation,
        crossBorderRule: bundle.crossBorderRule,
        accountRetention: bundle.accountRetention,
        securityLogRetention: bundle.securityLogRetention,
        auditRetention: bundle.auditRetention,
        processors: bundle.processors,
      },
    },
  })
  const fingerprintPayload = {
    ...normalizedBundle,
    contentRevision: LEGAL_NOTICE_CONTENT_REVISION,
  }
  return {
    noticeVersion: normalizedBundle.noticeVersion,
    contentFingerprint: contentFingerprint64(
      stableSerialize(fingerprintPayload)
    ),
  }
}
