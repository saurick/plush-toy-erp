import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  createVersionCenterSummary,
  installDataPreparationContractFailureRoute,
  installDeliverySummaryRoute,
} from './devVersionCenterScenarios.mjs'
import { installDrillRecoveryRoutes } from './devDrillRecoveryScenarios.mjs'

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

test('shared DEV data preparation route enters contract failure without live database reads', async () => {
  let registeredPattern = ''
  let registeredHandler = null
  const page = {
    async route(pattern, handler) {
      registeredPattern = pattern
      registeredHandler = handler
    },
  }

  await installDataPreparationContractFailureRoute(page)
  assert.equal(registeredPattern, '**/__dev/api/data-preparation/summary')
  assert.equal(typeof registeredHandler, 'function')

  let response = null
  await registeredHandler({
    async fulfill(value) {
      response = value
    },
  })
  assert.equal(response.status, 200)
  assert.equal(response.contentType, 'application/json')
  assert.deepEqual(JSON.parse(response.body), {
    schemaVersion: 'plush.dev-data-preparation-summary/v1',
  })
})

test('drill recovery installs both target and data readback isolation before navigation', async () => {
  const registeredPatterns = []
  const page = {
    async route(pattern) {
      registeredPatterns.push(pattern)
    },
  }

  await installDrillRecoveryRoutes(page)
  assert.deepEqual(registeredPatterns, [
    '**/__dev/api/data-preparation/summary',
    '**/__dev/api/delivery/summary',
    '**/__dev/api/qa/quality-gates',
    '**/__dev/api/delivery/operations/*',
  ])
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
