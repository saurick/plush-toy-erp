import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function jsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory()
      ? jsxFiles(filename)
      : entry.name.endsWith('.jsx')
        ? [filename]
        : []
  })
}

test('ERP dialogs enter the shared sizing and scroll shell', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const bypasses = []
  for (const filename of jsxFiles(root)) {
    const source = readFileSync(filename, 'utf8')
    if (
      !/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*['"]antd['"]/u.test(source)
    ) {
      continue
    }
    const relative = path.relative(root, filename)
    if (relative === 'components/business-list/BusinessModal.jsx') continue
    if (
      relative === 'components/workflow/ExceptionProcessRecoveryButton.jsx' &&
      source.includes('Modal.useModal()') &&
      !/<Modal\b/u.test(source)
    ) {
      continue
    }
    bypasses.push(relative)
  }
  assert.deepEqual(bypasses, [], 'Business dialogs must use BusinessModal')
})
