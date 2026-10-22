export { DEV_UI_DESIGN_ROUTE } from './devRoutes.mjs'

export const UI_DESIGN_DIRECTORY = 'docs/product/ui-design'
export const UI_DESIGN_ASSET = Object.freeze({
  title: 'ERP 统一 交互设计',
  path: `${UI_DESIGN_DIRECTORY}/index.html`,
  specificationPath: `${UI_DESIGN_DIRECTORY}/交互设计说明.md`,
  rationalePath: `${UI_DESIGN_DIRECTORY}/设计依据.md`,
})

export const UI_DESIGN_PREVIEW_TIMEOUT_MS = 12000

export const UI_DESIGN_PREVIEW_PAGES = Object.freeze([
  { value: 'workspace', label: '业务界面' },
  { value: 'production-hub', label: '生产管理' },
  { value: 'task-handling', label: '任务处理' },
  { value: 'mobile-tasks', label: '手机版任务' },
  { value: 'workbench', label: '效能工作台' },
  { value: 'login', label: '登录页' },
  { value: 'help', label: '岗位帮助' },
])

export function resolveUIDesignPreviewPage(page) {
  return UI_DESIGN_PREVIEW_PAGES.some((item) => item.value === page)
    ? page
    : 'workspace'
}

const SANDBOX_BOOTSTRAP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<script>
;(function () {
  function createMemoryStorage() {
    var values = Object.create(null)
    var keys = []
    return {
      get length() { return keys.length },
      key: function (index) { return keys[index] || null },
      getItem: function (key) {
        key = String(key)
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
      },
      setItem: function (key, value) {
        key = String(key)
        if (!Object.prototype.hasOwnProperty.call(values, key)) keys.push(key)
        values[key] = String(value)
      },
      removeItem: function (key) {
        key = String(key)
        if (!Object.prototype.hasOwnProperty.call(values, key)) return
        delete values[key]
        keys = keys.filter(function (item) { return item !== key })
      },
      clear: function () { values = Object.create(null); keys = [] }
    }
  }
  ;['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        value: createMemoryStorage()
      })
    } catch (_error) {}
  })
  var failed = false
  var rendered = false
  var scheduled = false
  function report(status, reason) {
    window.parent.postMessage({
      type: 'ui-design-preview-status',
      previewId: window.__ERP_UI_DESIGN_PREVIEW_ID__,
      status: status,
      reason: reason
    }, '*')
  }
  function checkLayout() {
    scheduled = false
    if (failed || document.hidden || document.readyState === 'loading') return
    var app = document.querySelector('.app')
    var box = app && app.getBoundingClientRect()
    if (!app || !app.children.length) {
      report('failed', 'empty')
    } else if (box.width > 0 && box.height > 0) {
      rendered = true
      report('ready')
    } else {
      report('failed', 'layout')
    }
  }
  function scheduleCheck() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(checkLayout)
  }
  function failStartup() {
    if (rendered || failed) return
    failed = true
    report('failed', 'script')
  }
  window.addEventListener('error', function (event) {
    if (event.target === window) failStartup()
  })
  window.addEventListener('unhandledrejection', failStartup)
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent ||
        event.data?.type !== 'ui-design-preview-check' ||
        event.data.previewId !== window.__ERP_UI_DESIGN_PREVIEW_ID__) return
    if (failed) report('failed', 'script')
    else scheduleCheck()
  })
  document.addEventListener('DOMContentLoaded', scheduleCheck)
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return
    // Inner dialogs, popovers and the narrow navigation own Escape first.
    if (document.querySelector('#floating > *, [role="dialog"], dialog[open], :popover-open, .business-action-menu[open], .modal-layer, .drawer-layer, body.nav-open')) return
    window.parent.postMessage({ type: 'ui-design-escape' }, '*')
  }, true)
})()
</script>`

export function prepareUIDesignSandboxSource(
  source = '',
  { page = 'workspace', revision = 0 } = {}
) {
  const html = String(source || '')
  if (!html) return ''
  const entry = resolveUIDesignPreviewPage(page)
  const attempt = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
  const bootstrap = `${SANDBOX_BOOTSTRAP}\n<script>window.__ERP_UI_DESIGN_ENTRY__ = ${JSON.stringify(entry)}; window.__ERP_UI_DESIGN_PREVIEW_ID__ = ${JSON.stringify(`${entry}-${attempt}`)};</script>`
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => {
      return `${head}\n${bootstrap}`
    })
  }
  return `${bootstrap}\n${html}`
}
