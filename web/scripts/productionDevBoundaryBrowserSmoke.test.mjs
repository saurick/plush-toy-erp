import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./productionDevBoundaryBrowserSmoke.mjs', import.meta.url),
  'utf8'
)

test('production DEV boundary browser smoke uses built static app and a bounded local port', () => {
  assert.match(source, /serveStaticApp\.mjs/u)
  assert.match(source, /validateDevAuxPort/u)
  assert.match(source, /STATIC_ROOT:\s*options\.buildDir/u)
  assert.match(source, /page\.goto\(`\$\{baseURL\}\/__dev`/u)
  assert.match(source, /result\.pathname,\s*'\/admin-login'/u)
  assert.match(source, /favicon-dev\.svg/u)
  assert.doesNotMatch(source, /vite\s+--host/u)
})
