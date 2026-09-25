import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { extractMarkdownAnchorIds } from '../../common/components/markdown/anchors.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const governancePath = path.join(repoRoot, 'docs', '项目治理地图.md')

function collectLocalAnchorLinks(source = '') {
  return [...String(source || '').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((href) => href.includes('#'))
    .filter((href) => !/^(?:https?:|mailto:)/i.test(href))
}

test('dev governance map local Markdown anchors match the viewer slug contract', () => {
  const source = readFileSync(governancePath, 'utf8')
  const failures = []

  for (const href of collectLocalAnchorLinks(source)) {
    const [rawTarget, rawHash] = href.split('#', 2)
    if (!rawHash) continue
    const targetPath = rawTarget
      ? path.resolve(
          path.dirname(governancePath),
          decodeURIComponent(rawTarget)
        )
      : governancePath
    if (path.extname(targetPath).toLowerCase() !== '.md') continue
    const targetSource = readFileSync(targetPath, 'utf8')
    const expectedId = decodeURIComponent(rawHash)
    if (!extractMarkdownAnchorIds(targetSource).has(expectedId)) {
      failures.push(`${href} -> missing #${expectedId}`)
    }
  }

  assert.deepEqual(failures, [])
})
