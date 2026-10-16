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
import { DEV_DELIVERY_TARGETS } from '../../src/dev-workbench/config/devDelivery.mjs'

test('delivery fixture covers the target catalog and keeps unverified targets blocked', () => {
  const summary = createVersionCenterSummary()
  const keys = DEV_DELIVERY_TARGETS.map(({ key }) => key)
  assert.deepEqual(summary.targets.map(({ key }) => key), keys)
  assert.deepEqual(summary.boundaries.targets, keys)
  for (const version of summary.versions) {
    assert.deepEqual(Object.keys(version.actionsByTarget), keys)
    for (const target of summary.targets.filter(({ preflight }) => preflight === null)) {
      assert.deepEqual(version.actionsByTarget[target.key], {
        actionClass: 'blocked',
        actionReason: 'target_identity_unavailable',
      })
    }
  }
})

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
  assert.deepEqual(summary.releaseVersionPolicy, {
    schemaVersion: 'plush.release-version-catalog/v1',
    timeZone: 'Asia/Shanghai',
    date: '2026.08.09',
    nextVersion: '2026.08.09-1',
    officialVersionCount: 14,
    dateVersionCount: 0,
  })

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
    kind: 'plush.dev-data-preparation-summary',
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
