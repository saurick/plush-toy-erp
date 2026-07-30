import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const pagesDirectory = fileURLToPath(new URL('.', import.meta.url))
const allowedControls = new Set(['PermissionCenterPage.jsx:刷新并保留当前勾选'])

function literalRefreshControls(fileName, source) {
  const controls = []
  const buttonTextPattern = />\s*(刷新[^<{]*?)\s*<\/(?:Button|button)>/gu
  const ariaLabelPattern = /\baria-label=(['"])(刷新.*?)\1/gu

  for (const match of source.matchAll(buttonTextPattern)) {
    controls.push(`${fileName}:${match[1].trim()}`)
  }
  for (const match of source.matchAll(ariaLabelPattern)) {
    controls.push(`${fileName}:${match[2].trim()}`)
  }
  return controls
}

test('ERP pages do not duplicate the shell refresh control', () => {
  const disallowedControls = readdirSync(pagesDirectory)
    .filter((fileName) => fileName.endsWith('.jsx'))
    .flatMap((fileName) =>
      literalRefreshControls(
        fileName,
        readFileSync(new URL(fileName, import.meta.url), 'utf8')
      )
    )
    .filter((control) => !allowedControls.has(control))

  assert.deepEqual(disallowedControls, [])
})
