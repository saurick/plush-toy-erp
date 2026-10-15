import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_FAVICON_VARIANTS,
  applyERPFavicon,
  resolveERPFavicon,
} from './favicon.mjs'

const CUSTOMER_FAVICON_HREF = '/customer-assets/yoyoosun/favicon-yoyoosun.svg'
const CUSTOMER_MOBILE_FAVICON_HREF =
  '/customer-assets/yoyoosun/favicon-yoyoosun-mobile.svg'

function createDocumentStub(existingLinks = []) {
  const removed = []
  const appended = []
  const head = {
    appendChild(node) {
      node.parentNode = head
      appended.push(node)
    },
  }
  const links = existingLinks.map((attrs) => ({
    attrs: { ...attrs },
    parentNode: head,
    setAttribute(key, value) {
      this.attrs[key] = value
    },
    getAttribute(key) {
      return this.attrs[key]
    },
    remove() {
      this.parentNode = null
      removed.push(this)
    },
  }))

  return {
    appended,
    head,
    links,
    removed,
    createElement(tagName) {
      return {
        attrs: {},
        tagName,
        parentNode: null,
        setAttribute(key, value) {
          this.attrs[key] = value
        },
        getAttribute(key) {
          return this.attrs[key]
        },
        remove() {
          this.parentNode = null
          removed.push(this)
        },
      }
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'link[rel~="icon"]')
      return links
    },
  }
}

test('favicon: product routes resolve admin, tasks and print template icons without dev-only metadata', () => {
  assert.equal(resolveERPFavicon('/erp/dashboard'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(resolveERPFavicon('/admin-login'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(
    resolveERPFavicon('/m/warehouse/tasks'),
    ERP_FAVICON_VARIANTS.tasks
  )
  assert.equal(
    resolveERPFavicon('/not-a-mobile-task'),
    ERP_FAVICON_VARIANTS.admin
  )
  assert.equal(resolveERPFavicon('/__dev'), ERP_FAVICON_VARIANTS.admin)

  const materialTemplateFavicon = resolveERPFavicon(
    '/erp/print-workspace/material-purchase-contract'
  )
  assert.equal(
    materialTemplateFavicon.key,
    'print-template:material-purchase-contract'
  )
  assert.equal(materialTemplateFavicon.glyph, '采')
  assert.equal(materialTemplateFavicon.type, 'image/svg+xml')
  assert.match(materialTemplateFavicon.href, /^data:image\/svg\+xml,/)

  const processingTemplateFavicon = resolveERPFavicon(
    '/erp/print-workspace/processing-contract'
  )
  assert.equal(
    processingTemplateFavicon.key,
    'print-template:processing-contract'
  )
  assert.equal(processingTemplateFavicon.glyph, '加')
})

test('favicon: mobile login redirect keeps the task icon by source route', () => {
  assert.equal(
    resolveERPFavicon('/admin-login', {
      fromPathname: '/m/warehouse/tasks',
    }),
    ERP_FAVICON_VARIANTS.tasks
  )
  assert.equal(
    resolveERPFavicon('/admin-login', { isMobileExperience: true }),
    ERP_FAVICON_VARIANTS.tasks
  )
})

test('favicon: customer favicon applies to desktop and mobile without a mobile override', () => {
  assert.deepEqual(
    resolveERPFavicon('/erp/dashboard', {
      customerFaviconHref: CUSTOMER_FAVICON_HREF,
    }),
    {
      key: 'customer',
      href: CUSTOMER_FAVICON_HREF,
      type: 'image/svg+xml',
    }
  )
  assert.deepEqual(
    resolveERPFavicon('/m/warehouse/tasks', {
      customerFaviconHref: '/favicon-yoyoosun.png',
    }),
    {
      key: 'customer',
      href: '/favicon-yoyoosun.png',
      type: 'image/png',
    }
  )
})

test('favicon: mobile branding follows mobile routes and login redirects without changing desktop', () => {
  const options = {
    customerFaviconHref: CUSTOMER_FAVICON_HREF,
    customerMobileFaviconHref: CUSTOMER_MOBILE_FAVICON_HREF,
  }
  for (const pathname of ['/m/warehouse/tasks', '/m/login', '/m/sales/tasks']) {
    assert.equal(
      resolveERPFavicon(pathname, options).href,
      CUSTOMER_MOBILE_FAVICON_HREF
    )
  }
  for (const loginOptions of [
    { fromPathname: '/m/warehouse/tasks' },
    { isMobileExperience: true },
  ]) {
    assert.equal(
      resolveERPFavicon('/admin-login', { ...options, ...loginOptions }).href,
      CUSTOMER_MOBILE_FAVICON_HREF
    )
  }
  for (const pathname of ['/erp/dashboard', '/admin-login']) {
    assert.equal(
      resolveERPFavicon(pathname, options).href,
      CUSTOMER_FAVICON_HREF
    )
  }
})

test('favicon: blank mobile branding uses the configured customer or neutral task icon', () => {
  assert.equal(
    resolveERPFavicon('/m/warehouse/tasks', {
      customerFaviconHref: CUSTOMER_FAVICON_HREF,
      customerMobileFaviconHref: ' ',
    }).href,
    CUSTOMER_FAVICON_HREF
  )
  assert.equal(
    resolveERPFavicon('/m/warehouse/tasks', { customerMobileFaviconHref: ' ' }),
    ERP_FAVICON_VARIANTS.tasks
  )
})

test('favicon: print workspace keeps template glyph before customer branding', () => {
  const result = resolveERPFavicon('/erp/print-workspace/processing-contract', {
    customerFaviconHref: CUSTOMER_FAVICON_HREF,
    customerMobileFaviconHref: CUSTOMER_MOBILE_FAVICON_HREF,
    isMobileExperience: true,
  })

  assert.equal(result.key, 'print-template:processing-contract')
  assert.equal(result.glyph, '加')
  assert.match(decodeURIComponent(result.href), />加<\/text>/)
})

test('favicon: malformed print workspace encoding falls back without throwing', () => {
  for (const pathname of [
    '/erp/print-workspace/%',
    '/erp/print-workspace/%E0%A4%A',
  ]) {
    assert.equal(resolveERPFavicon(pathname), ERP_FAVICON_VARIANTS.admin)
    assert.deepEqual(
      resolveERPFavicon(pathname, {
        customerFaviconHref: CUSTOMER_FAVICON_HREF,
      }),
      {
        key: 'customer',
        href: CUSTOMER_FAVICON_HREF,
        type: 'image/svg+xml',
      }
    )
  }
})

test('favicon: runtime update keeps a single active icon link', () => {
  const documentStub = createDocumentStub([
    { rel: 'icon', href: '/favicon.svg' },
    { rel: 'alternate icon', href: '/favicon.png' },
  ])

  const result = applyERPFavicon(documentStub, '/m/warehouse/tasks')

  assert.equal(result, ERP_FAVICON_VARIANTS.tasks)
  assert.equal(documentStub.links[0].getAttribute('rel'), 'icon')
  assert.equal(documentStub.links[0].getAttribute('type'), 'image/svg+xml')
  assert.equal(documentStub.links[0].getAttribute('href'), '/favicon-tasks.svg')
  assert.equal(documentStub.removed.length, 1)
  assert.equal(documentStub.removed[0].getAttribute('href'), '/favicon.png')
  assert.equal(documentStub.appended.length, 0)
})

test('favicon: runtime update applies configured customer favicon', () => {
  const documentStub = createDocumentStub([
    { rel: 'icon', href: '/favicon.svg' },
  ])

  const result = applyERPFavicon(documentStub, '/erp/dashboard', {
    customerFaviconHref: CUSTOMER_FAVICON_HREF,
  })

  assert.deepEqual(result, {
    key: 'customer',
    href: CUSTOMER_FAVICON_HREF,
    type: 'image/svg+xml',
  })
  assert.equal(
    documentStub.links[0].getAttribute('href'),
    CUSTOMER_FAVICON_HREF
  )
  assert.equal(documentStub.links[0].getAttribute('type'), 'image/svg+xml')
})

test('favicon: runtime update creates an icon link when HTML has none', () => {
  const documentStub = createDocumentStub()

  const result = applyERPFavicon(documentStub, '/erp/dashboard')

  assert.equal(result, ERP_FAVICON_VARIANTS.admin)
  assert.equal(documentStub.appended.length, 1)
  assert.equal(
    documentStub.appended[0].getAttribute('href'),
    '/favicon-admin.svg'
  )
})

test('favicon: returning from mobile to desktop restores the desktop icon', () => {
  const documentStub = createDocumentStub([
    { rel: 'icon', href: '/favicon.svg' },
  ])
  const options = {
    customerFaviconHref: CUSTOMER_FAVICON_HREF,
    customerMobileFaviconHref: CUSTOMER_MOBILE_FAVICON_HREF,
  }

  applyERPFavicon(documentStub, '/m/warehouse/tasks', options)
  assert.equal(
    documentStub.links[0].getAttribute('href'),
    CUSTOMER_MOBILE_FAVICON_HREF
  )

  applyERPFavicon(documentStub, '/erp/dashboard', options)
  assert.equal(
    documentStub.links[0].getAttribute('href'),
    CUSTOMER_FAVICON_HREF
  )
  assert.equal(documentStub.appended.length, 0)
})
