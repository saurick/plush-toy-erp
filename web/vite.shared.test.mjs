import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  assertERPResolvedVitePorts,
  resolveERPViteCacheDir,
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

test('resolved Vite CLI overrides cannot desynchronize HMR and listener ports', () => {
  assert.doesNotThrow(() =>
    assertERPResolvedVitePorts({
      serverPort: 15240,
      hmrClientPort: 15240,
    })
  )
  assert.throws(
    () =>
      assertERPResolvedVitePorts({
        serverPort: 15240,
        hmrClientPort: 5175,
      }),
    /must match; set ERP_VITE_PORT and ERP_VITE_HMR_CLIENT_PORT/u
  )
})

test('development Vite optimizer caches are isolated by app and listener port', () => {
  const rootDir = path.resolve('/repo/web')
  const localCache = resolveERPViteCacheDir(
    rootDir,
    'desktop',
    'development',
    15200
  )
  const gateCache = resolveERPViteCacheDir(
    rootDir,
    'desktop',
    'development',
    15201
  )

  assert.equal(
    localCache,
    path.join(rootDir, '.vite-cache', 'desktop', '15200')
  )
  assert.equal(
    gateCache,
    path.join(rootDir, '.vite-cache', 'desktop', '15201')
  )
  assert.notEqual(localCache, gateCache)
  assert.equal(
    resolveERPViteCacheDir(rootDir, 'desktop', 'production', 15200),
    path.join(rootDir, 'build', '.vite-cache', 'desktop')
  )
  assert.equal(
    resolveERPViteCacheDir(rootDir, 'desktop', 'production', 15201),
    path.join(rootDir, 'build', '.vite-cache', 'desktop')
  )
})
