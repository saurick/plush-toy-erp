import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const governancePath = path.join(repoRoot, 'docs', '项目治理地图.md')

function stripHeadingMarkdown(rawTitle = '') {
  return String(rawTitle || '')
    .replace(/\s+#+\s*$/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

function slugifyHeading(rawTitle = '') {
  return stripHeadingMarkdown(rawTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function extractHeadingIds(source = '') {
  const counts = new Map()
  const ids = new Set()
  let inFence = false

  String(source || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim()
      if (/^```/.test(trimmed)) {
        inFence = !inFence
        return
      }
      if (inFence) return
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
      if (!match) return
      const baseId = slugifyHeading(match[2]) || `section-${ids.size + 1}`
      const count = (counts.get(baseId) || 0) + 1
      counts.set(baseId, count)
      ids.add(count > 1 ? `${baseId}-${count}` : baseId)
    })

  return ids
}

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
    if (!extractHeadingIds(targetSource).has(expectedId)) {
      failures.push(`${href} -> missing #${expectedId}`)
    }
  }

  assert.deepEqual(failures, [])
})
