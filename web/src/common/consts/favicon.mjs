import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PROTOTYPES_ROUTE,
  DEV_TESTING_ROUTE,
} from '../../erp/config/devRoutes.mjs'
import { getPrintTemplateByKey } from '../../erp/config/printTemplates.mjs'

export const ERP_FAVICON_VARIANTS = Object.freeze({
  admin: Object.freeze({
    key: 'admin',
    href: '/favicon-admin.svg',
    type: 'image/svg+xml',
  }),
  tasks: Object.freeze({
    key: 'tasks',
    href: '/favicon-tasks.svg',
    type: 'image/svg+xml',
  }),
  devHub: Object.freeze({
    key: 'dev-hub',
    href: '/favicon-dev.svg',
    type: 'image/svg+xml',
  }),
  testing: Object.freeze({
    key: 'testing',
    href: '/favicon-testing.svg',
    type: 'image/svg+xml',
  }),
  docs: Object.freeze({
    key: 'docs',
    href: '/favicon-docs.svg',
    type: 'image/svg+xml',
  }),
  governance: Object.freeze({
    key: 'governance',
    href: '/favicon-governance.svg',
    type: 'image/svg+xml',
  }),
  capabilityLedger: Object.freeze({
    key: 'capability-ledger',
    href: '/favicon-capability-ledger.svg',
    type: 'image/svg+xml',
  }),
  prototypes: Object.freeze({
    key: 'prototypes',
    href: '/favicon-prototypes.svg',
    type: 'image/svg+xml',
  }),
  customerConfig: Object.freeze({
    key: 'customer-config',
    href: '/favicon-customer-config.svg',
    type: 'image/svg+xml',
  }),
})

function normalizePathname(pathname = '') {
  const normalized = String(pathname || '').trim()
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function isMobileTaskPath(pathname = '') {
  return /^\/m\/[^/]+(?:\/tasks)?(?:\/.*)?$/.test(pathname)
}

function buildCustomerFaviconVariant(href = '') {
  const normalizedHref = String(href || '').trim()
  if (!normalizedHref) {
    return null
  }
  return Object.freeze({
    key: 'customer',
    href: normalizedHref,
    type: normalizedHref.endsWith('.ico')
      ? 'image/x-icon'
      : normalizedHref.endsWith('.png')
        ? 'image/png'
        : 'image/svg+xml',
  })
}

function escapeSVGText(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function getFirstVisibleGlyph(text = '', fallback = '模') {
  return (
    Array.from(String(text || '').trim()).find((glyph) => glyph.trim()) ||
    fallback
  )
}

function buildPrintTemplateFaviconHref(glyph) {
  const safeGlyph = escapeSVGText(getFirstVisibleGlyph(glyph))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Print template favicon"><rect width="256" height="256" rx="52" fill="#7c3f12"/><rect x="46" y="42" width="164" height="172" rx="24" fill="#fff7ed"/><path d="M78 82h100M78 120h100M78 158h66" stroke="#fed7aa" stroke-width="14" stroke-linecap="round"/><text x="128" y="165" text-anchor="middle" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif" font-size="92" font-weight="700" fill="#7c2d12">${safeGlyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function resolvePrintTemplateKeyFromPath(pathname = '') {
  const match = normalizePathname(pathname).match(
    /^\/erp\/print-workspace\/([^/]+)\/?$/
  )
  return match ? decodeURIComponent(match[1]) : ''
}

function buildPrintTemplateFaviconVariant(pathname = '') {
  const templateKey = resolvePrintTemplateKeyFromPath(pathname)
  const template = getPrintTemplateByKey(templateKey)
  if (!template) {
    return null
  }

  const glyph = getFirstVisibleGlyph(template.shortTitle || template.title)
  return Object.freeze({
    key: `print-template:${template.key}`,
    href: buildPrintTemplateFaviconHref(glyph),
    type: 'image/svg+xml',
    glyph,
  })
}

export function resolveERPFavicon(pathname = '', options = {}) {
  const normalizedPathname = normalizePathname(pathname)
  const normalizedFromPathname = options.fromPathname
    ? normalizePathname(options.fromPathname)
    : ''
  if (
    normalizedPathname === DEV_HUB_ROUTE ||
    normalizedPathname === `${DEV_HUB_ROUTE}/`
  ) {
    return ERP_FAVICON_VARIANTS.devHub
  }
  if (normalizedPathname === DEV_TESTING_ROUTE) {
    return ERP_FAVICON_VARIANTS.testing
  }
  if (normalizedPathname === DEV_GOVERNANCE_ROUTE) {
    return ERP_FAVICON_VARIANTS.governance
  }
  if (normalizedPathname === DEV_CAPABILITY_LEDGER_ROUTE) {
    return ERP_FAVICON_VARIANTS.capabilityLedger
  }
  if (normalizedPathname === DEV_DOCS_ROUTE) {
    return ERP_FAVICON_VARIANTS.docs
  }
  if (normalizedPathname === DEV_PROTOTYPES_ROUTE) {
    return ERP_FAVICON_VARIANTS.prototypes
  }
  if (normalizedPathname === DEV_CUSTOMER_CONFIG_ROUTE) {
    return ERP_FAVICON_VARIANTS.customerConfig
  }
  const printTemplateFavicon =
    buildPrintTemplateFaviconVariant(normalizedPathname)
  if (printTemplateFavicon) {
    return printTemplateFavicon
  }
  const customerFavicon = buildCustomerFaviconVariant(
    options.customerFaviconHref
  )
  if (customerFavicon) {
    return customerFavicon
  }
  if (
    options.isMobileExperience ||
    isMobileTaskPath(normalizedPathname) ||
    isMobileTaskPath(normalizedFromPathname)
  ) {
    return ERP_FAVICON_VARIANTS.tasks
  }
  return ERP_FAVICON_VARIANTS.admin
}

export function applyERPFavicon(documentRef, pathname = '', options = {}) {
  if (!documentRef?.head) {
    return null
  }

  const favicon = resolveERPFavicon(pathname, options)
  const iconLinks = Array.from(
    documentRef.querySelectorAll('link[rel~="icon"]')
  )

  iconLinks.slice(1).forEach((link) => link.remove())

  const link = iconLinks[0] || documentRef.createElement('link')
  link.setAttribute('rel', 'icon')
  link.setAttribute('type', favicon.type)
  link.setAttribute('href', favicon.href)

  if (!link.parentNode) {
    documentRef.head.appendChild(link)
  }

  return favicon
}
