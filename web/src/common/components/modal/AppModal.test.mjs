import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('standard AppModal preserves caller layout, accessible title, callbacks and footer', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { ConfigProvider }, { default: AppModal }] = await Promise.all([
    import('react-dom/client'), import('antd'), import('./AppModal.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let panel = null
  let confirmed = 0
  let cancelled = 0
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const props = {
    open: true,
    title: '共享标准弹窗',
    width: 560,
    panelRef: (node) => { panel = node },
    className: 'contract-standard-modal',
    centered: true,
    okText: '执行检查',
    onOk: () => { confirmed += 1 },
    onCancel: () => { cancelled += 1 },
    styles: { body: { padding: 17 } },
  }
  const render = async (extra = {}) => {
    await act(async () => root.render(createElement(ConfigProvider,
      { theme: { token: { motion: false } } },
      createElement(AppModal, { ...props, ...extra }, '内容保持不变')
    )))
    await act(async () => new Promise(setImmediate))
  }
  await render()
  const dialog = document.querySelector('.contract-standard-modal')
  assert.equal(dialog.style.width, '560px')
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, '共享标准弹窗')
  assert.equal(dialog.querySelector('.ant-modal-body').style.padding, '17px')
  assert.equal(document.querySelectorAll('.app-modal-root').length, 0)
  assert(panel)
  await act(async () => dialog.querySelector('.ant-modal-footer .ant-btn-primary').click())
  await act(async () => dialog.querySelector('.ant-modal-close').click())
  assert.equal(confirmed, 1)
  assert.equal(cancelled, 1)
  await render({ footer: createElement('button', { type: 'button' }, '自定义关闭') })
  assert.equal(dialog.querySelector('.ant-modal-footer').textContent, '自定义关闭')
})

test('AppModal: delegates overlay keyboard and focus containment to Ant Design Modal', () => {
  const source = readSource('./AppModal.jsx')

  assert.match(source, /import \{ Modal \} from 'antd'/u)
  assert.match(source, /<Modal/u)
  assert.match(source, /keyboard/u)
  assert.match(source, /maskClosable/u)
  assert.match(source, /focusTriggerAfterClose/u)
  assert.match(source, /panelRef=\{handlePanelRef\}/u)
  assert.match(source, /role = 'dialog'/u)
  assert.match(source, /element\?\.closest\?\.\('\.ant-modal'\) \|\| element/u)
  assert.match(source, /dialogElement\.setAttribute\('role', role\)/u)
  assert.doesNotMatch(source, /element\.setAttribute\('role', role\)/u)
  assert.doesNotMatch(source, /addEventListener\(['"]keydown/u)
  assert.doesNotMatch(source, /event\.key\s*===\s*['"]Tab/u)
})

test('AppModal: isolates the application background with stack-safe restoration', () => {
  const source = readSource('./AppModal.jsx')

  assert.match(source, /const backgroundIsolationStates = new WeakMap\(\)/u)
  assert.match(source, /state\.count \+= 1/u)
  assert.match(source, /activeState\.count -= 1/u)
  assert.match(source, /if \(activeState\.count > 0\) return/u)
  assert.match(source, /hadInert: appRoot\.hasAttribute\('inert'\)/u)
  assert.match(source, /ariaHidden: appRoot\.getAttribute\('aria-hidden'\)/u)
  assert.match(source, /appRoot\.setAttribute\('inert', ''\)/u)
  assert.match(source, /appRoot\.setAttribute\('aria-hidden', 'true'\)/u)
  assert.match(source, /if \(!activeState\.hadInert\)[\s\S]*?removeAttribute/u)
  assert.match(
    source,
    /if \(activeState\.ariaHidden === null\)[\s\S]*?removeAttribute\('aria-hidden'\)[\s\S]*?setAttribute\('aria-hidden', activeState\.ariaHidden\)/u
  )
  assert.match(
    source,
    /if \(!releaseBackgroundIsolationRef\.current\)[\s\S]*?acquireBackgroundIsolation\(\)/u
  )
  assert.match(
    source,
    /if \(!openRef\.current\) releaseBackgroundIsolation\(\)/u
  )
  assert.match(
    source,
    /React\.useLayoutEffect\(\(\) => \{[\s\S]*?if \(!open\) releaseBackgroundIsolation\(\)/u
  )
})

test('AlertDialog: exposes labelled alertdialog semantics and an explicit initial focus target', () => {
  const source = readSource('./AlertDialog.jsx')

  assert.match(source, /role="alertdialog"/u)
  assert.match(source, /ariaLabelledBy=\{title \? titleId : ''\}/u)
  assert.match(source, /ariaDescribedBy=\{message \? messageId : ''\}/u)
  assert.match(source, /initialFocusSelector="\[data-app-alert-confirm\]"/u)
  assert.match(source, /id=\{titleId\}/u)
  assert.match(source, /id=\{messageId\}/u)
  assert.match(source, /const confirmingRef = React\.useRef\(false\)/u)
  assert.match(source, /if \(confirmingRef\.current\) return/u)
  assert.match(source, /confirmingRef\.current = true/u)
  assert.match(source, /if \(open\) \{\s*confirmingRef\.current = false/u)
})
