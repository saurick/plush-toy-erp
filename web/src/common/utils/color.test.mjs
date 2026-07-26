import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

async function loadColorUtils() {
  const path = fileURLToPath(new URL('./color.js', import.meta.url))
  const transformed = readFileSync(path, 'utf8').replace(
    "import tinycolor from 'tinycolor2'",
    "const tinycolor = () => { throw new Error('tinycolor is not used by conversion tests') }"
  )
  const encoded = Buffer.from(transformed).toString('base64')
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`)
}

test('rgbToHsv uses the blue-red delta when green is the maximum channel', async () => {
  const { rgbToHsv } = await loadColorUtils()

  assert.deepEqual(rgbToHsv(0, 255, 0), { h: 120, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(64, 128, 96), { h: 150, s: 50, v: 50 })
})

test('rgbToHsv keeps the canonical primary and achromatic values', async () => {
  const { rgbToHsv } = await loadColorUtils()

  assert.deepEqual(rgbToHsv(255, 0, 0), { h: 0, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(0, 0, 255), { h: 240, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(128, 128, 128), { h: 0, s: 0, v: 50 })
})
