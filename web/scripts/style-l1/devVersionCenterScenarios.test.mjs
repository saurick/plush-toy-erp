import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  installDeliverySummaryRoute,
  createVersionCenterSummary,
} from './devVersionCenterScenarios.mjs'

test('shared DEV delivery route serves the validated fixture without live target reads', async () => {
  let registeredPattern = ''
  let registeredHandler = null
  let requestCount = 0
  const page = {
    async route(pattern, handler) {
      registeredPattern = pattern
      registeredHandler = handler
    },
  }

  const summary = await installDeliverySummaryRoute(page, () => {
    requestCount += 1
  })
  assert.equal(registeredPattern, '**/__dev/api/delivery/summary')
  assert.equal(typeof registeredHandler, 'function')
  assert.deepEqual(summary, createVersionCenterSummary())

  let response = null
  await registeredHandler({
    async fulfill(value) {
      response = value
    },
  })
  assert.equal(requestCount, 1)
  assert.equal(response.status, 200)
  assert.equal(response.contentType, 'application/json')
  assert.deepEqual(JSON.parse(response.body), summary)
})

test('Style L1 installs the shared delivery route before scenario navigation', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '..', 'styleL1.mjs'),
    'utf8'
  )
  assert.match(
    source,
    /await installDeliverySummaryRoute\(page\)[\s\S]*if \(typeof scenario\.beforeNavigate === 'function'\)/u
  )
})
