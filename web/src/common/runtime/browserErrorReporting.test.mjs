import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBrowserErrorReporter,
  installBrowserErrorListeners,
  safeBrowserPath,
} from './browserErrorReporting.mjs'

test('browser reports retain code locations while dropping messages, origins, queries and business identifiers', async () => {
  const reports = []
  const report = createBrowserErrorReporter({
    send: (value) => reports.push(value),
    getPath: () =>
      '/erp/customers/123/private-customer?access_token=private-token',
    build: 'a'.repeat(40),
  })
  const error = new TypeError('private-password and private-customer')
  error.stack =
    'TypeError: private-password\n at https://private-origin.test/assets/app.js?token=private-token:12:8\n at https://private-origin.test/src/erp/page.jsx:17:9\n at https://private-origin.test/src/erp/api/purchase.mjs:18:2'
  error.requestId = 'req-origin'
  assert.equal(await report(error), true)
  assert.equal(reports.length, 1)
  assert.deepEqual(reports[0].frames, [
    '/assets/app.js:12:8',
    '/src/erp/page.jsx:17:9',
    '/src/erp/api/purchase.mjs:18:2',
  ])
  assert.equal(reports[0].path, '/erp/customers/{page}/{page}')
  assert.equal(reports[0].origin_request_id, 'req-origin')
  assert.equal(reports[0].build, 'a'.repeat(40))
  assert.match(reports[0].fingerprint, /^[a-f0-9]{8}$/u)
  assert(!JSON.stringify(reports).includes('private-'))
  error.message = 'another-private-password'
  assert.equal(await report(error), false)
  assert.equal(reports.length, 1)
  assert.equal(safeBrowserPath('/erp?password=private'), '/erp')
})

test('browser reporting is bounded, drops repeat faults and survives failed delivery and hostile rejection values', async () => {
  let time = 0
  let sends = 0
  const report = createBrowserErrorReporter({
    send: () => {
      sends++
      throw new Error('network down')
    },
    getPath: () => '/erp',
    now: () => time,
  })
  for (let i = 0; i < 15; i++) {
    const error = new Error('private-message')
    error.stack = `at https://app.test/assets/app.js:${i + 1}:1`
    assert.equal(await report(error), false)
  }
  assert.equal(sends, 10)
  time = 60_000
  await report(new Error('different message'))
  assert.equal(sends, 11)
  await report({ name: 'RpcError' })
  assert.equal(sends, 11)
  assert.equal(
    await report({
      get name() {
        throw new Error('bad getter')
      },
    }),
    false
  )
})

test('browser listeners cover runtime errors and unhandled rejections and can be removed', async () => {
  const target = new EventTarget()
  const calls = []
  const stop = installBrowserErrorListeners(target, (error, kind) => {
    calls.push([error, kind])
  })
  const error = new Error('runtime')
  const event = new Event('error')
  event.error = error
  target.dispatchEvent(event)
  const rejection = new Event('unhandledrejection')
  rejection.reason = error
  target.dispatchEvent(rejection)
  assert.deepEqual(calls, [
    [error, 'runtime'],
    [error, 'unhandled_rejection'],
  ])
  stop()
  target.dispatchEvent(event)
  assert.equal(calls.length, 2)
})
