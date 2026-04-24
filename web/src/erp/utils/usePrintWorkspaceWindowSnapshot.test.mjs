import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPrintWorkspaceWindowHTML } from './usePrintWorkspaceWindowSnapshot.js'

class FakeScriptElement {
  constructor() {
    this.attributes = new Map()
    this.textContent = ''
  }

  setAttribute(name, value) {
    this.attributes.set(name, value)
  }

  get outerHTML() {
    const attributes = Array.from(this.attributes.entries())
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('')
    return `<script${attributes}>${this.textContent}</script>`
  }
}

class FakeContainerElement {
  constructor(tagName, innerHTML = '') {
    this.tagName = tagName
    this.children = []
    this.innerHTML = innerHTML
  }

  prepend(node) {
    this.children.unshift(node)
  }

  get outerHTML() {
    const childrenHTML = this.children
      .map((child) => child.outerHTML || '')
      .join('')
    return `<${this.tagName}>${childrenHTML}${this.innerHTML}</${this.tagName}>`
  }
}

class FakeHTMLRoot {
  constructor() {
    this.head = new FakeContainerElement(
      'head',
      '<meta charset="utf-8"><title>snapshot</title>'
    )
    this.body = new FakeContainerElement('body', '<div id="root"></div>')
  }

  cloneNode() {
    return new FakeHTMLRoot()
  }

  querySelector(selector) {
    if (selector === 'head') {
      return this.head
    }
    if (selector === 'body') {
      return this.body
    }
    return null
  }

  querySelectorAll() {
    return []
  }

  get outerHTML() {
    return `<html lang="zh-CN">${this.head.outerHTML}${this.body.outerHTML}</html>`
  }
}

test('buildPrintWorkspaceWindowHTML: 快照会注入工作台恢复脚本', () => {
  const documentLike = {
    documentElement: new FakeHTMLRoot(),
    querySelectorAll() {
      return []
    },
    createElement(tagName) {
      assert.equal(tagName, 'script')
      return new FakeScriptElement()
    },
  }

  const workspaceURL =
    'http://127.0.0.1:4173/erp/print-workspace/material-purchase-contract?state=window-7'
  const windowHTML = buildPrintWorkspaceWindowHTML(documentLike, workspaceURL)

  assert.match(windowHTML, /data-print-workspace-bootstrap="true"/)
  assert.match(windowHTML, /window\.history\.replaceState/)
  assert.match(
    windowHTML,
    /const workspaceURL = "http:\/\/127\.0\.0\.1:4173\/erp\/print-workspace\/material-purchase-contract\?state=window-7"/
  )
  assert.match(windowHTML, /<body><div id="root"><\/div><\/body>/)
})
