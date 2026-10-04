export { DEV_UI_DESIGN_ROUTE } from './devRoutes.mjs'

export const UI_DESIGN_DIRECTORY = 'docs/product/ui-design'
export const UI_DESIGN_ASSET = Object.freeze({
  title: 'ERP 统一 UI 交互设计',
  path: `${UI_DESIGN_DIRECTORY}/index.html`,
  specificationPath: `${UI_DESIGN_DIRECTORY}/交互设计说明.md`,
  rationalePath: `${UI_DESIGN_DIRECTORY}/设计依据.md`,
})

const SANDBOX_STORAGE_SHIM = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
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
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return
    // Inner dialogs, popovers and the narrow navigation own Escape first.
    if (document.querySelector('#floating > *, [role="dialog"], dialog[open], :popover-open, .modal-layer, .drawer-layer, body.nav-open')) return
    window.parent.postMessage({ type: 'ui-design-escape' }, '*')
  }, true)
})()
</script>`

export function prepareUIDesignSandboxSource(
  source = '',
  { page = 'workspace' } = {}
) {
  const html = String(source || '')
  if (!html) return ''
  const entry = ['workspace', 'login', 'help', 'workbench'].includes(page)
    ? page
    : 'workspace'
  const bootstrap = `${SANDBOX_STORAGE_SHIM}\n<script>window.__ERP_UI_DESIGN_ENTRY__ = ${JSON.stringify(entry)};</script>`
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => {
      return `${head}\n${bootstrap}`
    })
  }
  return `${bootstrap}\n${html}`
}
