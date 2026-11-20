import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./useBusinessListExport.js', import.meta.url),
  'utf8'
)

test('business list export loads the complete filtered result before downloading', () => {
  assert.match(source, /await loadRows\(\{ signal: request\.signal \}\)/u)
  assert.match(source, /if \(!Array\.isArray\(rows\)\)/u)
  assert.match(source, /downloadBusinessListCSV\(\{[\s\S]*?columns,[\s\S]*?rows,/u)
})

test('business list export is single-flight and ignores stale or aborted requests', () => {
  assert.match(source, /exportInFlightRef\.current/u)
  assert.match(source, /useLatestRequestCoordinator/u)
  assert.match(source, /!request\.isCurrent\(\) \|\| isRpcAbortError\(error\)/u)
  assert.match(source, /setExporting\(true\)/u)
  assert.match(source, /setExporting\(false\)/u)
})
