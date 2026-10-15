import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getStyleL1ContextOptions,
  resolveStyleL1BrowserName,
} from './styleL1.mjs'

test('Style L1 rejects an unknown engine instead of producing Chromium evidence', () => {
  assert.equal(resolveStyleL1BrowserName(), 'chromium')
  assert.equal(resolveStyleL1BrowserName('webkit'), 'webkit')
  assert.throws(() => resolveStyleL1BrowserName('safari'), /STYLE_L1_BROWSER/)
  assert.throws(() => resolveStyleL1BrowserName('firefox'), /STYLE_L1_BROWSER/)
})

test('phone regressions enable mobile layout and touch while preserving explicit scenario settings', () => {
  const viewport = { width: 390, height: 844 }
  assert.deepEqual(getStyleL1ContextOptions({ viewport }), {
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  })
  assert.deepEqual(
    getStyleL1ContextOptions({ viewport, isMobile: false, hasTouch: false }),
    {
      viewport,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    }
  )
  assert.equal(
    getStyleL1ContextOptions({ viewport: { width: 1440, height: 900 } })
      .isMobile,
    false
  )
})

test('Style L1 preserves screenshot density and restricts operator credentials to scenes visiting DEV', () => {
  const viewport = { width: 1920, height: 1080 }
  const env = {
    PLUSH_DEV_OPERATOR_USERNAME: 'operator-test',
    PLUSH_DEV_OPERATOR_PASSWORD: 'placeholder',
  }
  const options = getStyleL1ContextOptions(
    {
      path: '/__dev/testing?view=pressure',
      viewport,
      deviceScaleFactor: 2,
    },
    env
  )
  assert.equal(options.deviceScaleFactor, 2)
  assert.deepEqual(options.httpCredentials, {
    username: env.PLUSH_DEV_OPERATOR_USERNAME,
    password: env.PLUSH_DEV_OPERATOR_PASSWORD,
  })
  assert.deepEqual(
    getStyleL1ContextOptions(
      { path: '/m/boss/tasks', viewport, visitsDevWorkbench: true },
      env
    ).httpCredentials,
    options.httpCredentials
  )
  assert.equal(
    getStyleL1ContextOptions({ path: '/erp', viewport }, env).httpCredentials,
    undefined
  )
  assert.equal(
    getStyleL1ContextOptions({ path: '/__dev/testing', viewport }, {})
      .httpCredentials,
    undefined
  )
})
