import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

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
  assert.match(source, /if \(open\) confirmingRef\.current = false/u)
})
