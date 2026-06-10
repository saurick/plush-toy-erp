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

test('favicon: routes resolve to separate admin, tasks, docs, capability ledger and prototype icons', () => {
  assert.equal(resolveERPFavicon('/erp/dashboard'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(resolveERPFavicon('/admin-login'), ERP_FAVICON_VARIANTS.admin)
  assert.equal(
    resolveERPFavicon('/m/warehouse/tasks'),
    ERP_FAVICON_VARIANTS.tasks
  )
  assert.equal(resolveERPFavicon('/tasks'), ERP_FAVICON_VARIANTS.tasks)
  assert.equal(resolveERPFavicon('/__dev/docs'), ERP_FAVICON_VARIANTS.docs)
  assert.equal(
    resolveERPFavicon('/__dev/capability-ledger'),
    ERP_FAVICON_VARIANTS.capabilityLedger
  )
  assert.equal(
    resolveERPFavicon('/__dev/prototypes'),
    ERP_FAVICON_VARIANTS.prototypes
  )
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
