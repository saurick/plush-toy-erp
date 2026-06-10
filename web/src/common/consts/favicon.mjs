import { DEV_CAPABILITY_LEDGER_ROUTE } from '../../erp/config/devCapabilityLedger.mjs'
import { DEV_CUSTOMER_CONFIG_ROUTE } from '../../erp/config/devCustomerConfig.mjs'
import { DEV_DOCS_ROUTE } from '../../erp/config/devDocs.mjs'
import { DEV_HUB_ROUTE } from '../../erp/config/devHub.mjs'
import { DEV_PROTOTYPES_ROUTE } from '../../erp/config/devPrototypes.mjs'
import { DEV_TESTING_ROUTE } from '../../erp/config/devTesting.mjs'

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
  return (
    pathname === '/tasks' || /^\/m\/[^/]+(?:\/tasks)?(?:\/.*)?$/.test(pathname)
  )
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
