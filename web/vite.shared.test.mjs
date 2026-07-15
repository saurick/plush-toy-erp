import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveERPDevServerPort,
  resolveERPHMRClientPort,
} from './vite.shared.mjs'

const ports = Object.freeze({
  web: 5175,
  style: 6175,
  auxStart: 15200,
})

test('ERP Vite runtime ports stay on canonical or project auxiliary ports', () => {
  assert.equal(resolveERPDevServerPort('', ports), 5175)
  assert.equal(resolveERPDevServerPort('6175', ports), 6175)
  assert.equal(resolveERPDevServerPort('15299', ports), 15299)
  assert.throws(
    () => resolveERPDevServerPort('5177', ports),
    /auxiliary range 15200-15299/u
  )
  assert.throws(
    () => resolveERPDevServerPort('not-a-port', ports),
    /integer between 1024 and 65535/u
  )
})

test('ERP HMR client port follows the actual Vite listener', () => {
  assert.equal(resolveERPHMRClientPort('', 15230), 15230)
  assert.equal(resolveERPHMRClientPort('15230', 15230), 15230)
  assert.throws(
    () => resolveERPHMRClientPort('5175', 15230),
    /must match ERP_VITE_PORT=15230/u
  )
})
