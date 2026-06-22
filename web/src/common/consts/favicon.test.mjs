import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_FAVICON_VARIANTS,
  applyERPFavicon,
  resolveERPFavicon,
} from './favicon.mjs'

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

test('favicon: routes resolve to separate admin, tasks, dev, governance, testing, docs, capability ledger, prototype, customer config and print template icons', () => {
  assert.equal(resolveERPFavicon('/erp/dashboard'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(resolveERPFavicon('/admin-login'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(
    resolveERPFavicon('/m/warehouse/tasks'),
    ERP_FAVICON_VARIANTS.tasks
  )
  assert.equal(resolveERPFavicon('/tasks'), ERP_FAVICON_VARIANTS.tasks)
  assert.equal(resolveERPFavicon('/__dev'), ERP_FAVICON_VARIANTS.devHub)
  assert.equal(resolveERPFavicon('/__dev/'), ERP_FAVICON_VARIANTS.devHub)
  assert.equal(ERP_FAVICON_VARIANTS.governance.href, '/favicon-governance.svg')
  assert.equal(
    resolveERPFavicon('/__dev/governance'),
    ERP_FAVICON_VARIANTS.governance
  )
  assert.equal(
    resolveERPFavicon('/__dev/testing'),
    ERP_FAVICON_VARIANTS.testing
  )
  assert.equal(resolveERPFavicon('/__dev/docs'), ERP_FAVICON_VARIANTS.docs)
  assert.equal(
    resolveERPFavicon('/__dev/capability-ledger'),
    ERP_FAVICON_VARIANTS.capabilityLedger
  )
  assert.equal(
    resolveERPFavicon('/__dev/prototypes'),
    ERP_FAVICON_VARIANTS.prototypes
  )
  assert.equal(
    resolveERPFavicon('/__dev/customer-config'),
    ERP_FAVICON_VARIANTS.customerConfig
  )

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

test('favicon: customer favicon overrides customer-facing admin and task routes', () => {
  assert.deepEqual(
    resolveERPFavicon('/erp/dashboard', {
      customerFaviconHref: '/favicon-yoyoosun.svg',
    }),
    {
      key: 'customer',
      href: '/favicon-yoyoosun.svg',
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
  assert.equal(
    resolveERPFavicon('/__dev', {
      customerFaviconHref: '/favicon-yoyoosun.svg',
    }),
    ERP_FAVICON_VARIANTS.devHub
  )
  assert.equal(
    resolveERPFavicon('/__dev/testing', {
      customerFaviconHref: '/favicon-yoyoosun.svg',
    }),
    ERP_FAVICON_VARIANTS.testing
  )
  assert.equal(
    resolveERPFavicon('/__dev/governance', {
      customerFaviconHref: '/favicon-yoyoosun.svg',
    }),
    ERP_FAVICON_VARIANTS.governance
  )
})

test('favicon: print workspace keeps template glyph before customer branding', () => {
  const result = resolveERPFavicon('/erp/print-workspace/processing-contract', {
    customerFaviconHref: '/favicon-yoyoosun.svg',
  })

  assert.equal(result.key, 'print-template:processing-contract')
  assert.equal(result.glyph, '加')
  assert.match(decodeURIComponent(result.href), />加<\/text>/)
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
    customerFaviconHref: '/favicon-yoyoosun.svg',
  })

  assert.deepEqual(result, {
    key: 'customer',
    href: '/favicon-yoyoosun.svg',
    type: 'image/svg+xml',
  })
  assert.equal(
    documentStub.links[0].getAttribute('href'),
    '/favicon-yoyoosun.svg'
  )
  assert.equal(documentStub.links[0].getAttribute('type'), 'image/svg+xml')
})

test('favicon: runtime update creates an icon link when HTML has none', () => {
  const documentStub = createDocumentStub()

  const result = applyERPFavicon(documentStub, '/__dev/capability-ledger')

  assert.equal(result, ERP_FAVICON_VARIANTS.capabilityLedger)
  assert.equal(documentStub.appended.length, 1)
  assert.equal(
    documentStub.appended[0].getAttribute('href'),
    '/favicon-capability-ledger.svg'
  )
})
