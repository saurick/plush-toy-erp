import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const LEGAL_NOTICE_GATE = 'common/legal/LegalNoticeGate.jsx'
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|ts|tsx)$/u
const MODAL_METHOD_CALL = /\bmodal\.(?:confirm|warning|info|success|error)\(\{/gu
const MODAL_COMPONENT_START = /<(?:BusinessFormModal|BusinessModal|Modal)\b/gu
const EXPLICIT_FALSE_PATTERNS = [
  /maskClosable\s*=\s*\{false\}/gu,
  /maskClosable\s*=\s*false\b/gu,
  /maskClosable\s*:\s*false\b/gu,
]

function listSourceFiles(directory = SOURCE_ROOT) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(absolutePath)
    return SOURCE_EXTENSIONS.test(entry.name) ? [absolutePath] : []
  })
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function listModalOpeningElements(source) {
  const elements = []
  MODAL_COMPONENT_START.lastIndex = 0
  for (const match of source.matchAll(MODAL_COMPONENT_START)) {
    let braceDepth = 0
    let quote = ''
    let escaped = false
    let cursor = match.index + match[0].length
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = ''
        continue
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character
      } else if (character === '{') {
        braceDepth += 1
      } else if (character === '}') {
        braceDepth = Math.max(0, braceDepth - 1)
      } else if (character === '>' && braceDepth === 0) {
        elements.push({
          index: match.index,
          source: source.slice(match.index, cursor + 1),
        })
        break
      }
    }
  }
  return elements
}

test('business modals allow backdrop dismissal unless an operation is busy', () => {
  const businessModal = readFileSync(
    resolve(SOURCE_ROOT, 'erp/components/business-list/BusinessModal.jsx'),
    'utf8'
  )
  const businessFormModal = readFileSync(
    resolve(SOURCE_ROOT, 'erp/components/business-list/BusinessFormModal.jsx'),
    'utf8'
  )

  assert.match(businessModal, /maskClosable = true/u)
  assert.match(businessModal, /maskClosable=\{maskClosable\}/u)
  assert.match(businessFormModal, /maskClosable = true/u)
})

test('only the legal notice gate hard-disables Ant Design backdrop dismissal', () => {
  const violations = []

  for (const absolutePath of listSourceFiles()) {
    const sourcePath = relative(SOURCE_ROOT, absolutePath)
    const source = readFileSync(absolutePath, 'utf8')
    for (const pattern of EXPLICIT_FALSE_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        if (sourcePath !== LEGAL_NOTICE_GATE) {
          violations.push(`${sourcePath}:${lineNumberAt(source, match.index)}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('session recovery remains an intentional blocking native dialog', () => {
  const source = readFileSync(
    resolve(SOURCE_ROOT, 'erp/components/SessionRecoveryDialog.jsx'),
    'utf8'
  )

  assert.match(source, /dialog[.]showModal\(\)/u)
  assert.match(source, /onCancel=\{\(event\) => event[.]preventDefault\(\)\}/u)
  assert.doesNotMatch(source, /event[.]target === dialog/u)
})

test('Ant Design modal method calls explicitly enable backdrop dismissal', () => {
  const violations = []

  for (const absolutePath of listSourceFiles()) {
    const sourcePath = relative(SOURCE_ROOT, absolutePath)
    const source = readFileSync(absolutePath, 'utf8')
    MODAL_METHOD_CALL.lastIndex = 0
    for (const match of source.matchAll(MODAL_METHOD_CALL)) {
      const configSource = source.slice(match.index + match[0].length)
      if (!/^\s*maskClosable:\s*true,/u.test(configSource)) {
        violations.push(`${sourcePath}:${lineNumberAt(source, match.index)}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('busy-aware modal components explicitly protect backdrop dismissal', () => {
  const violations = []

  for (const absolutePath of listSourceFiles()) {
    const sourcePath = relative(SOURCE_ROOT, absolutePath)
    const source = readFileSync(absolutePath, 'utf8')
    for (const element of listModalOpeningElements(source)) {
      const hasBusyCloseContract =
        /\b(?:confirmLoading|closable|keyboard)\s*=/u.test(element.source)
      if (hasBusyCloseContract && !/\bmaskClosable\b/u.test(element.source)) {
        violations.push(`${sourcePath}:${lineNumberAt(source, element.index)}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})
